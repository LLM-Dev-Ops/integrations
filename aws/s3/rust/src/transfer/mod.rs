//! Transfer utilities for large file uploads and downloads.
//!
//! This module provides high-level utilities for efficient data transfer
//! including streaming, chunked uploads, and progress tracking.

use crate::error::S3Error;
use bytes::Bytes;
use std::io::Read;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::AsyncRead;

/// Progress callback for transfer operations.
pub type ProgressCallback = Box<dyn Fn(TransferProgress) + Send + Sync>;

/// Transfer progress information.
#[derive(Debug, Clone)]
pub struct TransferProgress {
    /// Total bytes to transfer.
    pub total_bytes: u64,
    /// Bytes transferred so far.
    pub transferred_bytes: u64,
    /// Current part number (for multipart uploads).
    pub current_part: Option<u32>,
    /// Total parts (for multipart uploads).
    pub total_parts: Option<u32>,
}

impl TransferProgress {
    /// Calculate the progress percentage.
    pub fn percentage(&self) -> f64 {
        if self.total_bytes == 0 {
            100.0
        } else {
            (self.transferred_bytes as f64 / self.total_bytes as f64) * 100.0
        }
    }
}

/// Configuration for transfer operations.
#[derive(Debug, Clone)]
pub struct TransferConfig {
    /// Part size for multipart uploads (min 5MB, default 8MB).
    pub part_size: usize,
    /// Maximum concurrent parts.
    pub max_concurrency: usize,
    /// Threshold for using multipart upload.
    pub multipart_threshold: usize,
}

impl Default for TransferConfig {
    fn default() -> Self {
        Self {
            part_size: 8 * 1024 * 1024, // 8MB
            max_concurrency: 4,
            multipart_threshold: 8 * 1024 * 1024, // 8MB
        }
    }
}

impl TransferConfig {
    /// Create a new transfer configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the part size for multipart uploads.
    pub fn with_part_size(mut self, size: usize) -> Self {
        self.part_size = size.max(5 * 1024 * 1024); // Minimum 5MB
        self
    }

    /// Set the maximum concurrency.
    pub fn with_max_concurrency(mut self, concurrency: usize) -> Self {
        self.max_concurrency = concurrency.max(1);
        self
    }

    /// Set the multipart threshold.
    pub fn with_multipart_threshold(mut self, threshold: usize) -> Self {
        self.multipart_threshold = threshold;
        self
    }
}

/// Chunked reader for splitting data into parts.
pub struct ChunkedReader<R> {
    reader: R,
    chunk_size: usize,
    position: u64,
}

impl<R: Read> ChunkedReader<R> {
    /// Create a new chunked reader.
    pub fn new(reader: R, chunk_size: usize) -> Self {
        Self {
            reader,
            chunk_size,
            position: 0,
        }
    }

    /// Read the next chunk.
    pub fn read_chunk(&mut self) -> std::io::Result<Option<Bytes>> {
        let mut buffer = vec![0u8; self.chunk_size];
        let mut total_read = 0;

        while total_read < self.chunk_size {
            match self.reader.read(&mut buffer[total_read..]) {
                Ok(0) => break,
                Ok(n) => total_read += n,
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(e) => return Err(e),
            }
        }

        if total_read == 0 {
            return Ok(None);
        }

        buffer.truncate(total_read);
        self.position += total_read as u64;
        Ok(Some(Bytes::from(buffer)))
    }

    /// Get the current position.
    pub fn position(&self) -> u64 {
        self.position
    }
}

/// Calculate MD5 hash for integrity verification.
pub fn calculate_md5(data: &[u8]) -> String {
    base64::encode(md5::compute(data).0)
}

/// Calculate SHA256 hash for signing.
pub fn calculate_sha256(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Transfer manager for high-level file operations.
///
/// Provides convenient methods for uploading and downloading files
/// with automatic multipart handling and progress tracking.
pub struct TransferManager {
    config: TransferConfig,
}

impl TransferManager {
    /// Create a new transfer manager with default configuration.
    pub fn new() -> Self {
        Self {
            config: TransferConfig::default(),
        }
    }

    /// Create a new transfer manager with custom configuration.
    pub fn with_config(config: TransferConfig) -> Self {
        Self { config }
    }

    /// Get the transfer configuration.
    pub fn config(&self) -> &TransferConfig {
        &self.config
    }

    /// Determine if multipart upload should be used for the given size.
    pub fn should_use_multipart(&self, size: u64) -> bool {
        size as usize > self.config.multipart_threshold
    }

    /// Calculate the number of parts needed for a given size.
    pub fn calculate_parts(&self, size: u64) -> u32 {
        let part_size = self.config.part_size as u64;
        ((size + part_size - 1) / part_size) as u32
    }

    /// Read a file into bytes.
    pub fn read_file(path: &std::path::Path) -> std::io::Result<Bytes> {
        let data = std::fs::read(path)?;
        Ok(Bytes::from(data))
    }

    /// Write bytes to a file.
    pub fn write_file(path: &std::path::Path, data: &[u8]) -> std::io::Result<()> {
        std::fs::write(path, data)
    }

    /// Get file size.
    pub fn file_size(path: &std::path::Path) -> std::io::Result<u64> {
        let metadata = std::fs::metadata(path)?;
        Ok(metadata.len())
    }

    /// Detect content type from file extension.
    pub fn detect_content_type(path: &std::path::Path) -> Option<&'static str> {
        let extension = path.extension()?.to_str()?.to_lowercase();
        match extension.as_str() {
            // Images
            "jpg" | "jpeg" => Some("image/jpeg"),
            "png" => Some("image/png"),
            "gif" => Some("image/gif"),
            "webp" => Some("image/webp"),
            "svg" => Some("image/svg+xml"),
            "ico" => Some("image/x-icon"),
            // Documents
            "pdf" => Some("application/pdf"),
            "doc" => Some("application/msword"),
            "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            "xls" => Some("application/vnd.ms-excel"),
            "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            // Text
            "txt" => Some("text/plain"),
            "html" | "htm" => Some("text/html"),
            "css" => Some("text/css"),
            "js" => Some("application/javascript"),
            "json" => Some("application/json"),
            "xml" => Some("application/xml"),
            "csv" => Some("text/csv"),
            "md" => Some("text/markdown"),
            // Archives
            "zip" => Some("application/zip"),
            "gz" | "gzip" => Some("application/gzip"),
            "tar" => Some("application/x-tar"),
            "rar" => Some("application/vnd.rar"),
            "7z" => Some("application/x-7z-compressed"),
            // Audio
            "mp3" => Some("audio/mpeg"),
            "wav" => Some("audio/wav"),
            "ogg" => Some("audio/ogg"),
            // Video
            "mp4" => Some("video/mp4"),
            "webm" => Some("video/webm"),
            "avi" => Some("video/x-msvideo"),
            // Binary
            "bin" => Some("application/octet-stream"),
            "exe" => Some("application/octet-stream"),
            _ => Some("application/octet-stream"),
        }
    }
}

impl Default for TransferManager {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for TransferManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TransferManager")
            .field("config", &self.config)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_transfer_progress_percentage() {
        let progress = TransferProgress {
            total_bytes: 100,
            transferred_bytes: 50,
            current_part: None,
            total_parts: None,
        };
        assert_eq!(progress.percentage(), 50.0);
    }

    #[test]
    fn test_transfer_progress_percentage_zero() {
        let progress = TransferProgress {
            total_bytes: 0,
            transferred_bytes: 0,
            current_part: None,
            total_parts: None,
        };
        assert_eq!(progress.percentage(), 100.0);
    }

    #[test]
    fn test_transfer_config_default() {
        let config = TransferConfig::default();
        assert_eq!(config.part_size, 8 * 1024 * 1024);
        assert_eq!(config.max_concurrency, 4);
    }

    #[test]
    fn test_transfer_config_part_size_minimum() {
        let config = TransferConfig::new().with_part_size(1024);
        assert_eq!(config.part_size, 5 * 1024 * 1024); // Enforced minimum
    }

    #[test]
    fn test_chunked_reader() {
        let data = b"hello world this is a test";
        let mut reader = ChunkedReader::new(Cursor::new(data), 5);

        let chunk1 = reader.read_chunk().unwrap().unwrap();
        assert_eq!(chunk1.as_ref(), b"hello");

        let chunk2 = reader.read_chunk().unwrap().unwrap();
        assert_eq!(chunk2.as_ref(), b" worl");

        assert_eq!(reader.position(), 10);
    }

    #[test]
    fn test_chunked_reader_end() {
        let data = b"hi";
        let mut reader = ChunkedReader::new(Cursor::new(data), 10);

        let chunk1 = reader.read_chunk().unwrap().unwrap();
        assert_eq!(chunk1.as_ref(), b"hi");

        let chunk2 = reader.read_chunk().unwrap();
        assert!(chunk2.is_none());
    }

    #[test]
    fn test_calculate_md5() {
        let md5 = calculate_md5(b"hello");
        assert!(!md5.is_empty());
    }

    #[test]
    fn test_calculate_sha256() {
        let sha256 = calculate_sha256(b"hello");
        assert_eq!(sha256.len(), 64); // 32 bytes = 64 hex chars
    }
}

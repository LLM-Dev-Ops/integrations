//! S3 service implementations.
//!
//! This module provides service implementations for different S3 operations:
//! - Objects: Put, Get, Delete, Copy, List operations
//! - Buckets: Create, Delete, List operations
//! - Multipart: Multipart upload operations
//! - Presign: Generate presigned URLs
//! - Tagging: Object tagging operations

mod buckets;
mod multipart;
mod objects;
mod presign;
mod tagging;

pub use buckets::BucketsService;
pub use multipart::MultipartService;
pub use objects::ObjectsService;
pub use presign::PresignService;
pub use tagging::TaggingService;

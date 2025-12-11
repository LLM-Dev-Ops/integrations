//! S3 Client implementation.
//!
//! This module provides the main S3 client interface and builder.

use crate::config::S3Config;
use crate::credentials::{ChainCredentialsProvider, CredentialsProvider};
use crate::error::S3Error;
use crate::services::{BucketsService, MultipartService, ObjectsService, PresignService, TaggingService};
use crate::signing::AwsSignerV4;
use crate::transport::{HttpTransport, ReqwestTransport};
use once_cell::sync::OnceCell;
use std::sync::Arc;

/// S3 client trait.
pub trait S3Client: Send + Sync {
    /// Get the objects service.
    fn objects(&self) -> &ObjectsService;

    /// Get the buckets service.
    fn buckets(&self) -> &BucketsService;

    /// Get the multipart service.
    fn multipart(&self) -> &MultipartService;

    /// Get the presign service.
    fn presign(&self) -> &PresignService;

    /// Get the tagging service.
    fn tagging(&self) -> &TaggingService;

    /// Get the client configuration.
    fn config(&self) -> &S3Config;
}

/// S3 client implementation.
pub struct S3ClientImpl {
    config: Arc<S3Config>,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<AwsSignerV4>,

    // Lazy-initialized services
    objects: OnceCell<ObjectsService>,
    buckets: OnceCell<BucketsService>,
    multipart: OnceCell<MultipartService>,
    presign: OnceCell<PresignService>,
    tagging: OnceCell<TaggingService>,
}

impl S3ClientImpl {
    /// Create a new S3 client with the given configuration.
    pub fn new(config: S3Config, transport: Arc<dyn HttpTransport>) -> Self {
        let config = Arc::new(config);
        let signer = Arc::new(AwsSignerV4::new(
            config.credentials_provider.clone(),
            &config.region,
        ));

        Self {
            config,
            transport,
            signer,
            objects: OnceCell::new(),
            buckets: OnceCell::new(),
            multipart: OnceCell::new(),
            presign: OnceCell::new(),
            tagging: OnceCell::new(),
        }
    }
}

impl S3Client for S3ClientImpl {
    fn objects(&self) -> &ObjectsService {
        self.objects.get_or_init(|| {
            ObjectsService::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
            )
        })
    }

    fn buckets(&self) -> &BucketsService {
        self.buckets.get_or_init(|| {
            BucketsService::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
            )
        })
    }

    fn multipart(&self) -> &MultipartService {
        self.multipart.get_or_init(|| {
            MultipartService::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
            )
        })
    }

    fn presign(&self) -> &PresignService {
        self.presign.get_or_init(|| {
            PresignService::new(self.config.clone(), self.signer.clone())
        })
    }

    fn tagging(&self) -> &TaggingService {
        self.tagging.get_or_init(|| {
            TaggingService::new(
                self.config.clone(),
                self.transport.clone(),
                self.signer.clone(),
            )
        })
    }

    fn config(&self) -> &S3Config {
        &self.config
    }
}

impl std::fmt::Debug for S3ClientImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("S3ClientImpl")
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

/// Builder for S3 client.
pub struct S3ClientBuilder {
    config: Option<S3Config>,
    from_env: bool,
    transport: Option<Arc<dyn HttpTransport>>,
}

impl S3ClientBuilder {
    /// Create a new builder.
    pub fn new() -> Self {
        Self {
            config: None,
            from_env: false,
            transport: None,
        }
    }

    /// Use the provided configuration.
    pub fn config(mut self, config: S3Config) -> Self {
        self.config = Some(config);
        self
    }

    /// Load configuration from environment variables.
    pub fn from_env(mut self) -> Self {
        self.from_env = true;
        self
    }

    /// Use a custom HTTP transport.
    pub fn transport(mut self, transport: Arc<dyn HttpTransport>) -> Self {
        self.transport = Some(transport);
        self
    }

    /// Build the S3 client.
    pub fn build(self) -> Result<S3ClientImpl, S3Error> {
        let config = if let Some(config) = self.config {
            config
        } else if self.from_env {
            S3Config::builder().from_env().build()?
        } else {
            S3Config::default()
        };

        let transport = if let Some(transport) = self.transport {
            transport
        } else {
            let builder = crate::transport::ReqwestTransport::builder()
                .connect_timeout(config.connect_timeout)
                .read_timeout(config.read_timeout)
                .pool_max_idle_per_host(config.max_connections as usize)
                .pool_idle_timeout(Some(config.idle_timeout))
                .verify_ssl(config.verify_ssl);

            Arc::new(builder.build()?)
        };

        Ok(S3ClientImpl::new(config, transport))
    }
}

impl Default for S3ClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_default() {
        let result = S3ClientBuilder::new().build();
        assert!(result.is_ok());
    }

    #[test]
    fn test_builder_with_config() {
        let config = S3Config::builder()
            .region("eu-west-1")
            .build()
            .unwrap();

        let client = S3ClientBuilder::new().config(config).build().unwrap();
        assert_eq!(client.config().region, "eu-west-1");
    }
}

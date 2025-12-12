//! Dedicated IP operations for SES v2.
//!
//! This module provides methods for managing dedicated IP addresses,
//! including warmup and pool assignments.

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use crate::error::{SesError, SesResult};
use crate::http::{HttpClient, SesRequest, HttpMethod};
use super::SesService;

/// Service for dedicated IP operations.
///
/// This service provides methods for:
/// - Getting information about a dedicated IP
/// - Listing all dedicated IPs
/// - Assigning IPs to pools
/// - Configuring IP warmup
pub struct DedicatedIpService {
    http_client: Arc<dyn HttpClient>,
}

impl DedicatedIpService {
    /// Create a new dedicated IP service.
    pub fn new(http_client: impl HttpClient + 'static) -> Self {
        Self {
            http_client: Arc::new(http_client),
        }
    }

    /// Get information about a dedicated IP address.
    ///
    /// # Arguments
    ///
    /// * `ip` - The IP address to query
    ///
    /// # Returns
    ///
    /// IP information including warmup status and pool assignment.
    pub async fn get_dedicated_ip(
        &self,
        ip: &str,
    ) -> SesResult<GetDedicatedIpResponse> {
        let path = format!("/v2/email/dedicated-ips/{}", ip);
        let ses_request = SesRequest::new(HttpMethod::Get, &path);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize GetDedicatedIp response: {}", e),
            })
    }

    /// List all dedicated IPs for the account.
    ///
    /// # Arguments
    ///
    /// * `pool_name` - Optional filter by pool name
    /// * `next_token` - Token for pagination
    /// * `page_size` - Maximum number of results (1-100)
    ///
    /// # Returns
    ///
    /// List of dedicated IPs and optional next token for pagination.
    pub async fn list_dedicated_ips(
        &self,
        pool_name: Option<String>,
        next_token: Option<String>,
        page_size: Option<i32>,
    ) -> SesResult<ListDedicatedIpsResponse> {
        let mut path = "/v2/email/dedicated-ips".to_string();
        let mut query_params = Vec::new();

        if let Some(pool) = pool_name {
            query_params.push(format!("PoolName={}", pool));
        }
        if let Some(token) = next_token {
            query_params.push(format!("NextToken={}", token));
        }
        if let Some(size) = page_size {
            query_params.push(format!("PageSize={}", size));
        }

        if !query_params.is_empty() {
            path.push_str("?");
            path.push_str(&query_params.join("&"));
        }

        let ses_request = SesRequest::new(HttpMethod::Get, &path);
        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize ListDedicatedIps response: {}", e),
            })
    }

    /// Assign a dedicated IP to a pool.
    ///
    /// # Arguments
    ///
    /// * `ip` - The IP address
    /// * `destination_pool_name` - The pool to assign the IP to
    pub async fn put_dedicated_ip_in_pool(
        &self,
        ip: &str,
        destination_pool_name: &str,
    ) -> SesResult<PutDedicatedIpInPoolResponse> {
        let request = PutDedicatedIpInPoolRequest {
            destination_pool_name: destination_pool_name.to_string(),
        };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutDedicatedIpInPool request: {}", e),
            })?;

        let path = format!("/v2/email/dedicated-ips/{}/pool", ip);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutDedicatedIpInPool response: {}", e),
            })
    }

    /// Configure warmup attributes for a dedicated IP.
    ///
    /// # Arguments
    ///
    /// * `ip` - The IP address
    /// * `warmup_percentage` - The warmup percentage (0-100)
    pub async fn put_dedicated_ip_warmup_attributes(
        &self,
        ip: &str,
        warmup_percentage: i32,
    ) -> SesResult<PutDedicatedIpWarmupAttributesResponse> {
        let request = PutDedicatedIpWarmupAttributesRequest { warmup_percentage };

        let body = serde_json::to_vec(&request)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to serialize PutDedicatedIpWarmupAttributes request: {}", e),
            })?;

        let path = format!("/v2/email/dedicated-ips/{}/warmup", ip);
        let ses_request = SesRequest::new(HttpMethod::Put, &path).with_body(body);

        let response = self.http_client.send_request(ses_request).await?;

        serde_json::from_slice(&response.body)
            .map_err(|e| SesError::Serialization {
                message: format!("Failed to deserialize PutDedicatedIpWarmupAttributes response: {}", e),
            })
    }
}

impl SesService for DedicatedIpService {
    fn http_client(&self) -> &Arc<dyn HttpClient> {
        &self.http_client
    }
}

// Request types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutDedicatedIpInPoolRequest {
    destination_pool_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct PutDedicatedIpWarmupAttributesRequest {
    warmup_percentage: i32,
}

// Response types

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetDedicatedIpResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_ip: Option<DedicatedIp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DedicatedIp {
    pub ip: String,
    pub warmup_status: WarmupStatus,
    pub warmup_percentage: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pool_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WarmupStatus {
    /// Warmup in progress.
    InProgress,
    /// Warmup complete.
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ListDedicatedIpsResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedicated_ips: Option<Vec<DedicatedIp>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutDedicatedIpInPoolResponse {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutDedicatedIpWarmupAttributesResponse {}

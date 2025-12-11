//! Connectors service for managing external connectors.
//!
//! This service requires the 'connectors' feature flag.

mod service;
mod types;

pub use service::{ConnectorsService, ConnectorsServiceImpl};
pub use types::{
    Connector, ConnectorAuthType, ConnectorOAuth, ConnectorServiceAccount,
    CreateConnectorRequest, UpdateConnectorRequest,
};

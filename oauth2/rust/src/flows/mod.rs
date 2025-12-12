//! OAuth2 Flows
//!
//! OAuth2 authorization flow implementations.
//!
//! This module provides implementations for all major OAuth2 authorization flows:
//!
//! - **Authorization Code Flow** (RFC 6749 Section 4.1): Standard flow for server-side applications
//! - **PKCE Flow** (RFC 7636): Authorization Code with Proof Key for Code Exchange
//! - **Client Credentials Flow** (RFC 6749 Section 4.4): For machine-to-machine authentication
//! - **Device Authorization Flow** (RFC 8628): For input-constrained devices

pub mod authorization_code;
pub mod client_credentials;
pub mod device;
pub mod pkce;

// Authorization Code Flow
pub use authorization_code::{
    create_mock_authorization_code_flow, AuthorizationCodeFlow, AuthorizationCodeFlowImpl,
    MockAuthorizationCodeFlow,
};

// PKCE Authorization Code Flow
pub use pkce::{
    create_mock_pkce_authorization_code_flow, MockPkceAuthorizationCodeFlow,
    PkceAuthorizationCodeFlow, PkceAuthorizationCodeFlowImpl,
};

// Client Credentials Flow
pub use client_credentials::{
    create_mock_client_credentials_flow, ClientCredentialsFlow, ClientCredentialsFlowImpl,
    ClientCredentialsRequest, MockClientCredentialsFlow,
};

// Device Authorization Flow
pub use device::{
    create_mock_device_authorization_flow, DeviceAuthorizationFlow, DeviceAuthorizationFlowImpl,
    MockDeviceAuthorizationFlow,
};

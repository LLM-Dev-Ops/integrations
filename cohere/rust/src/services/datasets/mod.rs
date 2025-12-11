//! Datasets service for dataset management.
//!
//! This service requires the 'datasets' feature flag.

mod service;
mod types;

pub use service::{DatasetsService, DatasetsServiceImpl};
pub use types::{
    CreateDatasetRequest, Dataset, DatasetPart, DatasetStatus, DatasetType, DatasetUsage,
};

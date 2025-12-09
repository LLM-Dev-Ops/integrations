mod categories;
mod error;
mod mapping;

pub use categories::{
    AuthenticationError, ConfigurationError, NetworkError, RateLimitError, ServerError,
    ValidationError,
};
pub use error::{OpenAIError, OpenAIResult};
pub use mapping::ErrorMapper;

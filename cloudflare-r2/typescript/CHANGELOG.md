# Changelog

All notable changes to the Cloudflare R2 Storage Integration will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Client implementation with builder pattern
- Object operations service (GET, PUT, DELETE, HEAD, LIST, COPY)
- Multipart upload service
- Presigned URL service
- Mock client for testing
- Integration tests
- Performance benchmarks

## [0.1.0] - 2025-12-16

### Added
- Initial module structure and configuration
- TypeScript configuration with strict mode
- Jest testing configuration with ESM support
- ESLint and Prettier configuration
- Package exports for subpath imports
- Type definitions for all R2 operations
- Configuration system with validation and defaults
- Error hierarchy with retryability support
- S3 Signature V4 signing implementation
- Authentication provider system
- Resilience patterns (retry, circuit breaker)
- XML parsing and serialization utilities
- HTTP transport layer with resilience
- Comprehensive README documentation

### Module Components
- `config/`: Configuration types, validation, and environment loading
- `errors/`: Error classes and mapping utilities
- `types/`: Request/response type definitions
- `signing/`: S3 Signature V4 implementation
- `auth/`: Credential provider system
- `resilience/`: Retry and circuit breaker patterns
- `xml/`: XML parsing and serialization
- `transport/`: HTTP client with resilience

### Documentation
- Production-ready README with examples
- API reference documentation
- Configuration guide
- Error handling guide
- Testing documentation
- Troubleshooting guide

[Unreleased]: https://github.com/llm-devops/integrations/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/llm-devops/integrations/releases/tag/v0.1.0

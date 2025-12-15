/**
 * Azure Key Vault Keys Service
 *
 * Exports for the Keys service module.
 */

// Export service interface and implementation
export { KeysService, KeysServiceImpl } from './service.js';

// Export service-specific types
export type {
  CreateKeyOptions,
  GetKeyOptions,
  KeyBundle,
  KeyItem,
  KeyListResult,
  DeletedKeyBundle,
  CreateKeyRequest,
  EncryptRequest,
  EncryptResponse,
  DecryptRequest,
  DecryptResponse,
  SignRequest,
  SignResponse,
  VerifyRequest,
  VerifyResponse,
  WrapKeyRequest,
  WrapKeyResponse,
  UnwrapKeyRequest,
  UnwrapKeyResponse,
} from './types.js';

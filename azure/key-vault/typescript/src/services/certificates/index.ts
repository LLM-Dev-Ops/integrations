/**
 * Azure Key Vault Certificates Service
 *
 * Service for managing certificates in Azure Key Vault.
 */

export { CertificatesService, CertificatesServiceImpl } from './service.js';
export type {
  Certificate,
  CertificateProperties,
  CertificatePolicy,
  GetCertificateOptions,
  ListCertificatesOptions,
} from './types.js';

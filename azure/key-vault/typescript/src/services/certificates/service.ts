/**
 * Azure Key Vault Certificates Service
 *
 * Service implementation for certificate operations following SPARC specification.
 */

import { HttpTransport } from '../../transport/http.js';
import { CacheManager } from '../../cache/manager.js';
import type { NormalizedKeyVaultConfig } from '../../config.js';
import { TimestampUtils, RecoveryLevel } from '../../types/common.js';
import {
  CertificateNotFoundError,
  createErrorFromResponse,
} from '../../error.js';
import type {
  Certificate,
  CertificateProperties,
  CertificatePolicy,
  GetCertificateOptions,
  ListCertificatesOptions,
  CertificateKeyType,
  CertificateKeyCurveName,
  CertificateContentType,
  KeyUsageType,
} from '../../types/certificate.js';
import type {
  CertificateBundle,
  CertificateItem,
  CertificatePolicyBundle,
  ListResponse,
} from './types.js';

/**
 * CertificatesService interface
 *
 * Provides methods for managing certificates in Azure Key Vault.
 */
export interface CertificatesService {
  /**
   * Get a certificate (latest or specific version)
   *
   * @param name - Certificate name
   * @param options - Get options (optional version)
   * @returns Certificate object with DER-encoded certificate data
   * @throws {CertificateNotFoundError} If certificate not found
   * @throws {AccessDeniedError} If access is denied
   */
  getCertificate(name: string, options?: GetCertificateOptions): Promise<Certificate>;

  /**
   * List all certificates (metadata only, no certificate data)
   *
   * @param options - List options (pagination, filters)
   * @returns Array of certificate properties
   */
  listCertificates(options?: ListCertificatesOptions): Promise<CertificateProperties[]>;

  /**
   * List all versions of a certificate
   *
   * @param name - Certificate name
   * @returns Array of certificate properties (one per version)
   */
  listCertificateVersions(name: string): Promise<CertificateProperties[]>;

  /**
   * Get certificate policy
   *
   * @param name - Certificate name
   * @returns Certificate policy
   * @throws {CertificateNotFoundError} If certificate not found
   */
  getCertificatePolicy(name: string): Promise<CertificatePolicy>;
}

/**
 * CertificatesService implementation
 */
export class CertificatesServiceImpl implements CertificatesService {
  private readonly transport: HttpTransport;
  private readonly cache: CacheManager;
  private readonly config: NormalizedKeyVaultConfig;

  constructor(
    transport: HttpTransport,
    cache: CacheManager,
    config: NormalizedKeyVaultConfig
  ) {
    this.transport = transport;
    this.cache = cache;
    this.config = config;
  }

  async getCertificate(
    name: string,
    options?: GetCertificateOptions
  ): Promise<Certificate> {
    const version = options?.version || '';

    // Build cache key
    const cacheKey = CacheManager.buildKey('certificate', name, version || 'latest');

    // Check cache
    const cached = this.cache.get<Certificate>(cacheKey);
    if (cached) {
      this.checkExpiryWarning(cached.properties);
      return cached;
    }

    // Build path
    const path = version
      ? `/certificates/${name}/${version}`
      : `/certificates/${name}`;

    // Make request
    const response = await this.transport.get(path);

    if (response.status === 404) {
      this.cache.setNegative(cacheKey);
      throw new CertificateNotFoundError({
        message: `Certificate '${name}' not found`,
        statusCode: 404,
        vault: this.config.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.config.vaultUrl,
        name
      );
    }

    // Parse response
    const bundle = response.body as CertificateBundle;
    const certificate = this.parseCertificateBundle(bundle, name);

    // Cache the result
    this.cache.set(cacheKey, certificate);

    // Check expiry and log warning
    this.checkExpiryWarning(certificate.properties);

    return certificate;
  }

  async listCertificates(
    options?: ListCertificatesOptions
  ): Promise<CertificateProperties[]> {
    const allProperties: CertificateProperties[] = [];
    let nextLink: string | undefined;

    // Build query params
    const query: Record<string, string> = {};
    if (options?.maxPageSize) {
      query.maxresults = options.maxPageSize.toString();
    }
    if (options?.includePending) {
      query.includePending = 'true';
    }

    do {
      // Use nextLink if available, otherwise use base path
      const path = nextLink
        ? this.extractPathFromNextLink(nextLink)
        : '/certificates';

      const response = await this.transport.get(
        path,
        nextLink ? undefined : query
      );

      if (response.status !== 200) {
        throw createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl
        );
      }

      const listResponse = response.body as ListResponse<CertificateItem>;

      if (listResponse.value) {
        for (const item of listResponse.value) {
          const properties = this.parseCertificateItem(item);
          allProperties.push(properties);
        }
      }

      nextLink = listResponse.nextLink;
    } while (nextLink);

    return allProperties;
  }

  async listCertificateVersions(name: string): Promise<CertificateProperties[]> {
    const allVersions: CertificateProperties[] = [];
    let nextLink: string | undefined;

    do {
      const path = nextLink
        ? this.extractPathFromNextLink(nextLink)
        : `/certificates/${name}/versions`;

      const response = await this.transport.get(path);

      if (response.status === 404) {
        throw new CertificateNotFoundError({
          message: `Certificate '${name}' not found`,
          statusCode: 404,
          vault: this.config.vaultUrl,
          resourceName: name,
        });
      }

      if (response.status !== 200) {
        throw createErrorFromResponse(
          response.status,
          response.body as string,
          response.headers,
          this.config.vaultUrl,
          name
        );
      }

      const listResponse = response.body as ListResponse<CertificateItem>;

      if (listResponse.value) {
        for (const item of listResponse.value) {
          const properties = this.parseCertificateItem(item);
          allVersions.push(properties);
        }
      }

      nextLink = listResponse.nextLink;
    } while (nextLink);

    return allVersions;
  }

  async getCertificatePolicy(name: string): Promise<CertificatePolicy> {
    // Build cache key for policy
    const cacheKey = `certificate-policy:${name}`;

    // Check cache
    const cached = this.cache.get<CertificatePolicy>(cacheKey);
    if (cached) {
      return cached;
    }

    const path = `/certificates/${name}/policy`;
    const response = await this.transport.get(path);

    if (response.status === 404) {
      throw new CertificateNotFoundError({
        message: `Certificate '${name}' not found`,
        statusCode: 404,
        vault: this.config.vaultUrl,
        resourceName: name,
      });
    }

    if (response.status !== 200) {
      throw createErrorFromResponse(
        response.status,
        response.body as string,
        response.headers,
        this.config.vaultUrl,
        name
      );
    }

    const policyBundle = response.body as CertificatePolicyBundle;
    const policy = this.parseCertificatePolicy(policyBundle);

    // Cache the policy
    this.cache.set(cacheKey, policy);

    return policy;
  }

  /**
   * Parse certificate bundle from Azure API response
   */
  private parseCertificateBundle(bundle: CertificateBundle, name: string): Certificate {
    // Parse CER data (base64url encoded)
    const cer = bundle.cer ? this.decodeBase64Url(bundle.cer) : new Uint8Array();

    // Parse X.509 thumbprint
    const x509Thumbprint = bundle.x5t
      ? this.decodeBase64Url(bundle.x5t)
      : undefined;

    // Parse version from ID
    const id = bundle.id || '';
    const version = this.extractVersionFromId(id);

    const properties: CertificateProperties = {
      id,
      name,
      vaultUrl: this.config.vaultUrl,
      version,
      enabled: bundle.attributes?.enabled ?? true,
      createdOn: TimestampUtils.fromUnixSeconds(bundle.attributes?.created),
      updatedOn: TimestampUtils.fromUnixSeconds(bundle.attributes?.updated),
      expiresOn: TimestampUtils.fromUnixSeconds(bundle.attributes?.exp),
      notBefore: TimestampUtils.fromUnixSeconds(bundle.attributes?.nbf),
      recoveryLevel: this.parseRecoveryLevel(bundle.attributes?.recoveryLevel),
      recoverableDays: bundle.attributes?.recoverableDays,
      tags: bundle.tags,
      x509Thumbprint,
      contentType: bundle.contentType as CertificateContentType | undefined,
      managed: false, // Set based on issuer if available
    };

    const certificate: Certificate = {
      id,
      name,
      cer,
      properties,
      keyId: bundle.kid,
      secretId: bundle.sid,
    };

    // Add policy if present
    if (bundle.policy) {
      certificate.policy = this.parseCertificatePolicy(bundle.policy);
    }

    return certificate;
  }

  /**
   * Parse certificate item from list response
   */
  private parseCertificateItem(item: CertificateItem): CertificateProperties {
    const id = item.id || '';
    const name = this.extractNameFromId(id);
    const version = this.extractVersionFromId(id);

    const x509Thumbprint = item.x5t
      ? this.decodeBase64Url(item.x5t)
      : undefined;

    return {
      id,
      name,
      vaultUrl: this.config.vaultUrl,
      version,
      enabled: item.attributes?.enabled ?? true,
      createdOn: TimestampUtils.fromUnixSeconds(item.attributes?.created),
      updatedOn: TimestampUtils.fromUnixSeconds(item.attributes?.updated),
      expiresOn: TimestampUtils.fromUnixSeconds(item.attributes?.exp),
      notBefore: TimestampUtils.fromUnixSeconds(item.attributes?.nbf),
      recoveryLevel: this.parseRecoveryLevel(item.attributes?.recoveryLevel),
      recoverableDays: item.attributes?.recoverableDays,
      tags: item.tags,
      x509Thumbprint,
      subject: item.subject,
    };
  }

  /**
   * Parse certificate policy bundle
   */
  private parseCertificatePolicy(bundle: CertificatePolicyBundle): CertificatePolicy {
    const policy: CertificatePolicy = {
      id: bundle.id,
      enabled: bundle.attributes?.enabled,
      createdOn: TimestampUtils.fromUnixSeconds(bundle.attributes?.created),
      updatedOn: TimestampUtils.fromUnixSeconds(bundle.attributes?.updated),
    };

    // Parse key properties
    if (bundle.key_props) {
      policy.keyProperties = {
        exportable: bundle.key_props.exportable,
        keyType: bundle.key_props.kty as CertificateKeyType,
        keySize: bundle.key_props.key_size,
        curveName: bundle.key_props.crv as CertificateKeyCurveName,
        reuseKey: bundle.key_props.reuse_key,
      };
    }

    // Parse secret properties
    if (bundle.secret_props) {
      policy.secretProperties = {
        contentType: bundle.secret_props.contentType as any,
      };
    }

    // Parse X.509 properties
    if (bundle.x509_props) {
      policy.x509Properties = {
        subject: bundle.x509_props.subject,
        ekus: bundle.x509_props.ekus,
        keyUsage: bundle.x509_props.key_usage as KeyUsageType[],
        validityInMonths: bundle.x509_props.validity_months,
      };

      if (bundle.x509_props.sans) {
        policy.x509Properties.subjectAlternativeNames = {
          dnsNames: bundle.x509_props.sans.dns_names,
          emails: bundle.x509_props.sans.emails,
          upns: bundle.x509_props.sans.upns,
        };
      }
    }

    // Parse issuer parameters
    if (bundle.issuer) {
      policy.issuerParameters = {
        name: bundle.issuer.name,
        certificateType: bundle.issuer.cty,
        certificateTransparency: bundle.issuer.cert_transparency,
      };
    }

    // Parse lifetime actions
    if (bundle.lifetime_actions) {
      policy.lifetimeActions = bundle.lifetime_actions.map((action) => ({
        action: action.action?.action_type
          ? { actionType: action.action.action_type as 'EmailContacts' | 'AutoRenew' }
          : undefined,
        trigger: {
          daysBeforeExpiry: action.trigger?.days_before_expiry,
          lifetimePercentage: action.trigger?.lifetime_percentage,
        },
      }));
    }

    return policy;
  }

  /**
   * Decode base64url string to Uint8Array
   */
  private decodeBase64Url(input: string): Uint8Array {
    // Convert base64url to base64
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    // Decode base64
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  /**
   * Extract certificate name from ID
   * ID format: https://{vault}.vault.azure.net/certificates/{name}/{version}
   */
  private extractNameFromId(id: string): string {
    const parts = id.split('/');
    // certificates is at index -2 or -3 depending on whether version is included
    const certificatesIndex = parts.findIndex((p) => p === 'certificates');
    if (certificatesIndex !== -1 && parts.length > certificatesIndex + 1) {
      const name = parts[certificatesIndex + 1];
      return name ?? '';
    }
    return '';
  }

  /**
   * Extract version from ID
   */
  private extractVersionFromId(id: string): string | undefined {
    const parts = id.split('/');
    // Version is the last part if present
    const certificatesIndex = parts.findIndex((p) => p === 'certificates');
    if (certificatesIndex !== -1 && parts.length > certificatesIndex + 2) {
      return parts[certificatesIndex + 2];
    }
    return undefined;
  }

  /**
   * Extract path from nextLink URL
   */
  private extractPathFromNextLink(nextLink: string): string {
    try {
      const url = new URL(nextLink);
      return url.pathname;
    } catch {
      // If parsing fails, return as-is
      return nextLink;
    }
  }

  /**
   * Parse recovery level string to enum
   */
  private parseRecoveryLevel(level?: string): RecoveryLevel | undefined {
    if (!level) return undefined;

    switch (level) {
      case 'Purgeable':
        return RecoveryLevel.Purgeable;
      case 'Recoverable':
        return RecoveryLevel.Recoverable;
      case 'Recoverable+ProtectedSubscription':
        return RecoveryLevel.RecoverableProtectedSubscription;
      case 'Recoverable+Purgeable':
        return RecoveryLevel.RecoverablePurgeable;
      default:
        return undefined;
    }
  }

  /**
   * Check if certificate is expired or close to expiry and log warning
   */
  private checkExpiryWarning(properties: CertificateProperties): void {
    if (!properties.expiresOn) {
      return;
    }

    const now = Date.now();
    const expiresAt = properties.expiresOn.getTime();

    if (expiresAt < now) {
      console.warn(
        `Certificate '${properties.name}' has expired on ${properties.expiresOn.toISOString()}`
      );
    } else {
      // Warn if expiring within 30 days
      const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry <= 30) {
        console.warn(
          `Certificate '${properties.name}' will expire in ${Math.ceil(daysUntilExpiry)} days (${properties.expiresOn.toISOString()})`
        );
      }
    }
  }
}

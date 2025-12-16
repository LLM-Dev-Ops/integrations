/**
 * Vulnerability operations for GitHub Container Registry.
 * @module operations/vulnerabilities
 */

import type { GhcrClient } from '../client.js';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type {
  OwnerType,
  Severity,
  VulnerabilityReport,
  VulnerableVersion,
  Vulnerability,
} from '../types/mod.js';
import {
  VulnerabilityReportUtils,
  meetsThreshold,
} from '../types/mod.js';
import type { VersionOps } from './versions.js';
import { PackageVersionUtils } from '../types/mod.js';

/**
 * Vulnerability operations interface.
 */
export interface VulnOps {
  /**
   * Gets vulnerabilities for a specific version.
   */
  getVulnerabilities(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<VulnerabilityReport>;

  /**
   * Lists versions with vulnerabilities above a threshold.
   */
  listVulnerableVersions(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    minSeverity: Severity
  ): Promise<VulnerableVersion[]>;
}

/**
 * Creates vulnerability operations.
 */
export function createVulnOps(
  client: GhcrClient,
  versionOps: VersionOps
): VulnOps {
  return new VulnOpsImpl(client, versionOps);
}

/**
 * Vulnerability operations implementation.
 */
class VulnOpsImpl implements VulnOps {
  private readonly client: GhcrClient;
  private readonly versionOps: VersionOps;

  constructor(client: GhcrClient, versionOps: VersionOps) {
    this.client = client;
    this.versionOps = versionOps;
  }

  async getVulnerabilities(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<VulnerabilityReport> {
    // GitHub Advanced Security (GHAS) vulnerability data
    // is retrieved via the Dependabot alerts API or Container Scanning
    try {
      const path = this.buildVulnPath(owner, packageName, versionId, ownerType);

      const response = await this.client.apiGet<GhasVulnResponse>(path);

      return this.parseVulnResponse(versionId, response.data);
    } catch (error) {
      // GHAS might not be enabled or data not available
      if (
        error instanceof GhcrError &&
        (error.kind === GhcrErrorKind.NotFound ||
         error.kind === GhcrErrorKind.Forbidden)
      ) {
        return VulnerabilityReportUtils.unavailable(versionId);
      }

      throw error;
    }
  }

  async listVulnerableVersions(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    minSeverity: Severity
  ): Promise<VulnerableVersion[]> {
    // Get all versions
    const versions = await this.versionOps.list(owner, packageName, ownerType);

    const vulnerableVersions: VulnerableVersion[] = [];

    // Check each version for vulnerabilities
    for (const version of versions) {
      try {
        const report = await this.getVulnerabilities(
          owner,
          packageName,
          version.id,
          ownerType
        );

        // Filter by severity
        const matchingVulns = report.vulnerabilities.filter(v =>
          meetsThreshold(v.severity, minSeverity)
        );

        if (matchingVulns.length > 0) {
          vulnerableVersions.push({
            versionId: version.id,
            tags: PackageVersionUtils.tags(version),
            vulnerabilities: matchingVulns,
            highestSeverity: VulnerabilityReportUtils.highestSeverity({
              ...report,
              vulnerabilities: matchingVulns,
            }),
            count: matchingVulns.length,
          });
        }
      } catch {
        // Skip versions where vulnerability data is unavailable
        continue;
      }
    }

    // Sort by highest severity
    return vulnerableVersions.sort((a, b) => {
      const severityOrder: Record<Severity, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
        unknown: 0,
      };
      return severityOrder[b.highestSeverity] - severityOrder[a.highestSeverity];
    });
  }

  /**
   * Builds the API path for vulnerability data.
   */
  private buildVulnPath(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): string {
    // Use the security advisories API for container vulnerabilities
    // Note: This requires GHAS to be enabled
    if (ownerType === 'org') {
      return `/orgs/${owner}/security-advisories`;
    }
    return `/repos/${owner}/${packageName}/security-advisories`;
  }

  /**
   * Parses the vulnerability response from GHAS.
   */
  private parseVulnResponse(
    versionId: number,
    response: GhasVulnResponse
  ): VulnerabilityReport {
    const vulnerabilities: Vulnerability[] = [];

    if (response.vulnerabilities) {
      for (const vuln of response.vulnerabilities) {
        vulnerabilities.push({
          id: vuln.cve_id || vuln.ghsa_id || 'UNKNOWN',
          severity: this.mapSeverity(vuln.severity),
          summary: vuln.summary || vuln.description || 'No summary available',
          description: vuln.description,
          fixedIn: vuln.patched_versions?.[0],
          packageName: vuln.package?.name,
          installedVersion: vuln.vulnerable_version_range,
          cvss: vuln.cvss ? {
            score: vuln.cvss.score,
            version: vuln.cvss.vectorString?.split('/')[0] || '3.1',
          } : undefined,
          references: vuln.references?.map(r => r.url).filter(Boolean) as string[] || [],
          publishedAt: vuln.published_at,
          updatedAt: vuln.updated_at,
        });
      }
    }

    return {
      packageVersionId: versionId,
      vulnerabilities,
      scannedAt: new Date().toISOString(),
      status: 'completed',
    };
  }

  /**
   * Maps GHAS severity to our severity type.
   */
  private mapSeverity(severity?: string): Severity {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'moderate':
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'unknown';
    }
  }
}

/**
 * GHAS vulnerability response structure.
 */
interface GhasVulnResponse {
  vulnerabilities?: Array<{
    cve_id?: string;
    ghsa_id?: string;
    severity?: string;
    summary?: string;
    description?: string;
    patched_versions?: string[];
    vulnerable_version_range?: string;
    package?: {
      name?: string;
      ecosystem?: string;
    };
    cvss?: {
      score: number;
      vectorString?: string;
    };
    references?: Array<{ url?: string }>;
    published_at?: string;
    updated_at?: string;
  }>;
}

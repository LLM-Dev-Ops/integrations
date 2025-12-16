/**
 * Scan service implementation for Amazon ECR.
 *
 * Provides operations for vulnerability scanning of container images,
 * including starting scans, retrieving findings, and waiting for scan completion.
 *
 * @module services/scan
 */

import type {
  ImageIdentifier,
  ScanStatus,
  ScanFindings,
  ScanFindingsOptions,
  WaitOptions,
  ImageDetail,
} from '../types/index.js';
import { ScanState } from '../types/scan.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Scan service interface.
 */
export interface ScanService {
  /**
   * Starts an image scan.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @returns The scan status
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  startScan(repositoryName: string, imageId: ImageIdentifier): Promise<ScanStatus>;

  /**
   * Gets scan findings for an image.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @param options - Options for retrieving findings
   * @returns The scan findings
   * @throws {EcrError} ScanInProgress if scan is still in progress
   * @throws {EcrError} ScanFailed if scan failed
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getScanFindings(
    repositoryName: string,
    imageId: ImageIdentifier,
    options?: ScanFindingsOptions
  ): Promise<ScanFindings>;

  /**
   * Gets the scan status for an image.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @returns The scan status
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getScanStatus(repositoryName: string, imageId: ImageIdentifier): Promise<ScanStatus>;

  /**
   * Waits for a scan to complete.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @param options - Wait options (timeout, poll interval)
   * @returns The scan findings when complete
   * @throws {EcrError} Timeout if scan does not complete within timeout
   * @throws {EcrError} ScanFailed if scan fails
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  waitForScan(
    repositoryName: string,
    imageId: ImageIdentifier,
    options?: WaitOptions
  ): Promise<ScanFindings>;
}

/**
 * Scan service implementation.
 */
export class ScanServiceImpl implements ScanService {
  constructor(
    private readonly startImageScan: (repo: string, id: ImageIdentifier) => Promise<ScanStatus>,
    private readonly describeImageScanFindings: (
      repo: string,
      id: ImageIdentifier,
      options?: ScanFindingsOptions
    ) => Promise<ScanFindings>,
    private readonly describeImages: (repo: string, ids: ImageIdentifier[]) => Promise<ImageDetail[]>,
    private readonly emitMetric?: (name: string, value: number, tags?: Record<string, string>) => void
  ) {}

  async startScan(repositoryName: string, imageId: ImageIdentifier): Promise<ScanStatus> {
    const status = await this.startImageScan(repositoryName, imageId);

    // Emit metric for scan started
    if (this.emitMetric) {
      this.emitMetric('ecr.scans.started', 1, {
        repository: repositoryName,
      });
    }

    return status;
  }

  async getScanFindings(
    repositoryName: string,
    imageId: ImageIdentifier,
    options?: ScanFindingsOptions
  ): Promise<ScanFindings> {
    return this.describeImageScanFindings(repositoryName, imageId, options);
  }

  async getScanStatus(repositoryName: string, imageId: ImageIdentifier): Promise<ScanStatus> {
    const details = await this.describeImages(repositoryName, [imageId]);

    if (details.length === 0) {
      throw new EcrError(
        EcrErrorKind.ImageNotFound,
        `Image not found: ${imageIdToString(imageId)}`
      );
    }

    const detail = details[0];

    if (!detail.imageScanStatus) {
      throw new EcrError(
        EcrErrorKind.ScanNotFound,
        'Scan not initiated'
      );
    }

    return detail.imageScanStatus;
  }

  async waitForScan(
    repositoryName: string,
    imageId: ImageIdentifier,
    options?: WaitOptions
  ): Promise<ScanFindings> {
    const timeoutSeconds = options?.timeoutSeconds ?? 1800; // 30 minutes default
    const pollIntervalSeconds = options?.pollIntervalSeconds ?? 10;
    const timeoutMs = timeoutSeconds * 1000;
    const pollIntervalMs = pollIntervalSeconds * 1000;
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (Date.now() - startTime >= timeoutMs) {
        throw new EcrError(
          EcrErrorKind.Timeout,
          `Scan did not complete within ${timeoutSeconds} seconds`
        );
      }

      // Get image details to check scan status
      const details = await this.describeImages(repositoryName, [imageId]);

      if (details.length === 0) {
        throw new EcrError(
          EcrErrorKind.ImageNotFound,
          `Image not found: ${imageIdToString(imageId)}`
        );
      }

      const detail = details[0];

      if (!detail.imageScanStatus) {
        throw new EcrError(
          EcrErrorKind.ScanNotFound,
          'Scan not initiated'
        );
      }

      const status = detail.imageScanStatus.status;

      // Emit progress metric
      if (this.emitMetric) {
        this.emitMetric('ecr.scan.progress', 1, {
          repository: repositoryName,
          status: status,
        });
      }

      // Check scan state
      if (status === ScanState.Complete) {
        // Scan is complete, get findings
        return this.getScanFindings(repositoryName, imageId);
      }

      if (status === ScanState.Failed) {
        const description = detail.imageScanStatus.description ?? 'Scan failed';
        throw new EcrError(
          EcrErrorKind.ScanFailed,
          description
        );
      }

      if (status === ScanState.Unsupported) {
        throw new EcrError(
          EcrErrorKind.ScanFailed,
          'Image type not supported for scanning'
        );
      }

      if (status === ScanState.FindingsUnavailable) {
        throw new EcrError(
          EcrErrorKind.ScanFailed,
          'Scan findings are unavailable'
        );
      }

      // Still in progress or pending, wait and poll again
      await sleep(pollIntervalMs);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts an image identifier to a string.
 */
function imageIdToString(imageId: ImageIdentifier): string {
  if (imageId.imageTag) {
    return imageId.imageTag;
  }
  if (imageId.imageDigest) {
    return imageId.imageDigest;
  }
  return 'unknown';
}

/**
 * Sleeps for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * AWS profile credential provider.
 *
 * This module provides a credential provider that reads AWS credentials
 * from shared configuration files (~/.aws/credentials and ~/.aws/config).
 *
 * @module credentials/profile
 */

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { AwsCredentials, CredentialProvider } from './types.js';
import { CredentialError } from './error.js';

/**
 * Configuration for profile credential provider.
 */
export interface ProfileConfig {
  /**
   * Name of the profile to use. Defaults to 'default' or AWS_PROFILE env var.
   */
  profile?: string;

  /**
   * Path to credentials file. Defaults to ~/.aws/credentials or AWS_SHARED_CREDENTIALS_FILE.
   */
  credentialsFile?: string;

  /**
   * Path to config file. Defaults to ~/.aws/config or AWS_CONFIG_FILE.
   */
  configFile?: string;
}

/**
 * Parsed INI section data.
 */
interface IniSection {
  [key: string]: string;
}

/**
 * Parsed INI file data.
 */
interface IniData {
  [section: string]: IniSection;
}

/**
 * Provider that retrieves AWS credentials from shared configuration files.
 *
 * This provider reads credentials from the AWS CLI configuration files:
 * - ~/.aws/credentials: Contains access keys and secrets
 * - ~/.aws/config: Contains additional configuration including role assumptions
 *
 * The provider supports:
 * - Multiple named profiles
 * - source_profile for role assumption chains
 * - Environment variable overrides (AWS_PROFILE, AWS_SHARED_CREDENTIALS_FILE, AWS_CONFIG_FILE)
 *
 * @example Basic usage
 * ```typescript
 * const provider = new ProfileCredentialProvider();
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example With named profile
 * ```typescript
 * const provider = new ProfileCredentialProvider({ profile: 'production' });
 * const credentials = await provider.getCredentials();
 * ```
 *
 * @example With custom file paths
 * ```typescript
 * const provider = new ProfileCredentialProvider({
 *   credentialsFile: '/custom/path/credentials',
 *   configFile: '/custom/path/config'
 * });
 * ```
 */
export class ProfileCredentialProvider implements CredentialProvider {
  private readonly profile: string;
  private readonly credentialsFile: string;
  private readonly configFile: string;

  /**
   * Creates a new profile credential provider.
   *
   * @param config - Optional configuration for profile loading
   */
  constructor(config: ProfileConfig = {}) {
    this.profile = config.profile
      || process.env['AWS_PROFILE']
      || 'default';

    this.credentialsFile = config.credentialsFile
      || process.env['AWS_SHARED_CREDENTIALS_FILE']
      || join(homedir(), '.aws', 'credentials');

    this.configFile = config.configFile
      || process.env['AWS_CONFIG_FILE']
      || join(homedir(), '.aws', 'config');
  }

  /**
   * Retrieves AWS credentials from profile configuration.
   *
   * @returns Promise resolving to credentials from the profile
   * @throws {CredentialError} If profile cannot be loaded or doesn't contain credentials
   */
  public async getCredentials(): Promise<AwsCredentials> {
    try {
      // Try to load credentials from credentials file first
      const credentials = await this.loadFromCredentialsFile();
      if (credentials) {
        return credentials;
      }

      // Fall back to config file
      const configCredentials = await this.loadFromConfigFile();
      if (configCredentials) {
        return configCredentials;
      }

      throw new CredentialError(
        `Profile '${this.profile}' not found or does not contain credentials`,
        'PROFILE_ERROR'
      );
    } catch (error) {
      if (error instanceof CredentialError) {
        throw error;
      }

      throw new CredentialError(
        `Failed to load profile '${this.profile}': ${(error as Error).message}`,
        'PROFILE_ERROR'
      );
    }
  }

  /**
   * Loads credentials from the credentials file.
   *
   * @returns Promise resolving to credentials or null if not found
   */
  private async loadFromCredentialsFile(): Promise<AwsCredentials | null> {
    try {
      const content = await readFile(this.credentialsFile, 'utf-8');
      const ini = this.parseIni(content);

      const section = ini[this.profile];
      if (!section) {
        return null;
      }

      return this.extractCredentials(section);
    } catch (error) {
      // File might not exist, which is fine
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Loads credentials from the config file.
   *
   * @returns Promise resolving to credentials or null if not found
   */
  private async loadFromConfigFile(): Promise<AwsCredentials | null> {
    try {
      const content = await readFile(this.configFile, 'utf-8');
      const ini = this.parseIni(content);

      // Config file uses 'profile <name>' for named profiles, but 'default' for default
      const sectionName = this.profile === 'default'
        ? 'default'
        : `profile ${this.profile}`;

      let section = ini[sectionName];
      if (!section) {
        return null;
      }

      // Handle source_profile
      if (section['source_profile']) {
        return this.loadSourceProfile(section['source_profile'], ini);
      }

      return this.extractCredentials(section);
    } catch (error) {
      // File might not exist, which is fine
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Loads credentials from a source profile.
   *
   * @param sourceProfile - Name of the source profile
   * @param configIni - Parsed config file data
   * @returns Promise resolving to credentials from source profile
   */
  private async loadSourceProfile(
    sourceProfile: string,
    configIni: IniData
  ): Promise<AwsCredentials | null> {
    // Try config file first
    const configSectionName = sourceProfile === 'default'
      ? 'default'
      : `profile ${sourceProfile}`;

    const configSection = configIni[configSectionName];
    if (configSection) {
      const credentials = this.extractCredentials(configSection);
      if (credentials) {
        return credentials;
      }
    }

    // Try credentials file
    try {
      const credContent = await readFile(this.credentialsFile, 'utf-8');
      const credIni = this.parseIni(credContent);
      const credSection = credIni[sourceProfile];

      if (credSection) {
        return this.extractCredentials(credSection);
      }
    } catch (error) {
      // Credentials file might not exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return null;
  }

  /**
   * Extracts AWS credentials from an INI section.
   *
   * @param section - Parsed INI section
   * @returns Credentials object or null if section doesn't contain credentials
   */
  private extractCredentials(section: IniSection): AwsCredentials | null {
    const accessKeyId = section['aws_access_key_id'];
    const secretAccessKey = section['aws_secret_access_key'];
    const sessionToken = section['aws_session_token'];

    if (!accessKeyId || !secretAccessKey) {
      return null;
    }

    const credentials: AwsCredentials = {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    };

    if (sessionToken && sessionToken.trim() !== '') {
      credentials.sessionToken = sessionToken.trim();
    }

    return credentials;
  }

  /**
   * Parses INI file content.
   *
   * @param content - Raw INI file content
   * @returns Parsed INI data structure
   */
  private parseIni(content: string): IniData {
    const result: IniData = {};
    let currentSection: string | null = null;

    for (let line of content.split('\n')) {
      line = line.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      // Section header
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch && sectionMatch[1]) {
        currentSection = sectionMatch[1].trim();
        result[currentSection] = {};
        continue;
      }

      // Key-value pair
      if (currentSection) {
        const kvMatch = line.match(/^([^=]+)=(.*)$/);
        if (kvMatch && kvMatch[1] && kvMatch[2] !== undefined) {
          const key = kvMatch[1].trim();
          const value = kvMatch[2].trim();
          const section = result[currentSection];
          if (section) {
            section[key] = value;
          }
        }
      }
    }

    return result;
  }

  /**
   * Checks if credentials are expired.
   *
   * Profile credentials don't have expiration metadata in the files,
   * so this always returns false.
   *
   * @returns false - profile credentials don't have expiration info
   */
  public isExpired(): boolean {
    return false;
  }
}

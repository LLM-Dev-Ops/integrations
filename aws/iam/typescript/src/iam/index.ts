/**
 * AWS IAM Module
 *
 * This module provides IAM-specific functionality including:
 * - XML parsing for IAM API responses
 * - Policy simulation with caching
 * - Role information retrieval
 *
 * @module iam
 */

// XML parsing utilities
export {
  parseSimulatePolicyResponse,
  parseGetRoleResponse,
  parseListRolePoliciesResponse,
  parseListAttachedRolePoliciesResponse,
  parseIamError,
  parseAssumeRoleResponse,
  parseGetCallerIdentityResponse,
} from './xml.js';

// Policy Simulator
export { PolicySimulator } from './simulator.js';
export type {
  IamConfig as SimulatorConfig,
  HttpClient as SimulatorHttpClient,
  AwsSigner as SimulatorAwsSigner,
} from './simulator.js';

// Role Service
export { RoleService } from './role.js';
export type {
  IamConfig as RoleServiceConfig,
  HttpClient as RoleServiceHttpClient,
  AwsSigner as RoleServiceAwsSigner,
} from './role.js';

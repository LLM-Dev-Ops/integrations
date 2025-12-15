/**
 * AWS IAM XML Response Parser
 *
 * This module provides XML parsing functionality for AWS IAM API responses.
 * IAM uses XML for its responses with the API version 2010-05-08.
 *
 * @module iam/xml
 */

import type { AssumedCredentials, CallerIdentity, EvaluationResult, SimulationResult, EvaluationDecision } from '../types/responses.js';
import type { RoleInfo, Statement } from '../types/common.js';

/**
 * Parse a SimulatePrincipalPolicy response from XML
 *
 * @param xml - XML response string from SimulatePrincipalPolicy
 * @returns Parsed simulation result
 * @throws Error if XML is malformed
 *
 * @example
 * ```typescript
 * const result = parseSimulatePolicyResponse(xmlResponse);
 * console.log(`Allowed: ${result.evaluationResults.every(r => r.decision === 'allowed')}`);
 * ```
 */
export function parseSimulatePolicyResponse(xml: string): SimulationResult {
  const evaluationResults: EvaluationResult[] = [];

  // Extract evaluation results
  const resultsMatch = xml.match(/<EvaluationResults>([\s\S]*?)<\/EvaluationResults>/);
  if (resultsMatch) {
    const resultsXml = resultsMatch[1];
    const memberRegex = /<member>([\s\S]*?)<\/member>/g;
    let memberMatch;

    while ((memberMatch = memberRegex.exec(resultsXml ?? '')) !== null) {
      const memberXml = memberMatch[1] ?? '';

      const actionName = extractTextContentOr(memberXml, 'EvalActionName', '');
      const resourceName = extractTextContent(memberXml, 'EvalResourceName');
      const decision = (extractTextContent(memberXml, 'EvalDecision') ?? 'implicitDeny') as EvaluationDecision;

      // Parse matched statements
      const matchedStatements: Statement[] = [];
      const statementsMatch = memberXml.match(/<MatchedStatements>([\s\S]*?)<\/MatchedStatements>/);
      if (statementsMatch) {
        const stmtsXml = statementsMatch[1] ?? '';
        const stmtMemberRegex = /<member>([\s\S]*?)<\/member>/g;
        let stmtMatch;

        while ((stmtMatch = stmtMemberRegex.exec(stmtsXml)) !== null) {
          const stmtXml = stmtMatch[1] ?? '';
          const statement: Statement = {
            effect: (extractTextContent(stmtXml, 'Effect') ?? 'Allow') as 'Allow' | 'Deny',
            action: extractTextContentOr(stmtXml, 'Action', ''),
          };

          const resource = extractTextContent(stmtXml, 'Resource');
          if (resource) {
            statement.resource = resource;
          }

          const sid = extractTextContent(stmtXml, 'StatementId');
          if (sid) {
            statement.sid = sid;
          }

          matchedStatements.push(statement);
        }
      }

      // Parse missing context values
      const missingContextValues: string[] = [];
      const missingMatch = memberXml.match(/<MissingContextValues>([\s\S]*?)<\/MissingContextValues>/);
      if (missingMatch) {
        const missingXml = missingMatch[1] ?? '';
        const valueRegex = /<member>(.*?)<\/member>/g;
        let valueMatch;

        while ((valueMatch = valueRegex.exec(missingXml)) !== null) {
          missingContextValues.push(valueMatch[1] ?? '');
        }
      }

      evaluationResults.push({
        actionName,
        resourceName,
        decision,
        matchedStatements,
        missingContextValues,
      });
    }
  }

  // Check if truncated
  const isTruncated = extractTextContent(xml, 'IsTruncated') === 'true';
  const marker = extractTextContent(xml, 'Marker');

  return {
    evaluationResults,
    isTruncated,
    marker,
  };
}

/**
 * Parse a GetRole response from XML
 *
 * @param xml - XML response string from GetRole
 * @returns Parsed role information
 * @throws Error if XML is malformed
 *
 * @example
 * ```typescript
 * const roleInfo = parseGetRoleResponse(xmlResponse);
 * console.log(`Role ARN: ${roleInfo.arn}`);
 * ```
 */
export function parseGetRoleResponse(xml: string): RoleInfo {
  const roleMatch = xml.match(/<Role>([\s\S]*?)<\/Role>/);
  if (!roleMatch?.[1]) {
    throw new Error('Invalid GetRole response: missing Role element');
  }

  const roleXml = roleMatch[1];

  const arn = extractTextContent(roleXml, 'Arn');
  const roleName = extractTextContent(roleXml, 'RoleName');
  const roleId = extractTextContent(roleXml, 'RoleId');

  if (!arn || !roleName || !roleId) {
    throw new Error('Invalid GetRole response: missing required fields');
  }

  const roleInfo: RoleInfo = {
    arn,
    roleName,
    roleId,
  };

  // Optional fields
  const path = extractTextContent(roleXml, 'Path');
  if (path) {
    roleInfo.path = path;
  }

  const createDateStr = extractTextContent(roleXml, 'CreateDate');
  if (createDateStr) {
    roleInfo.createDate = new Date(createDateStr);
  }

  const assumeRolePolicyDocument = extractTextContent(roleXml, 'AssumeRolePolicyDocument');
  if (assumeRolePolicyDocument) {
    // URL decode the policy document
    roleInfo.assumeRolePolicyDocument = decodeURIComponent(assumeRolePolicyDocument);
  }

  const description = extractTextContent(roleXml, 'Description');
  if (description) {
    roleInfo.description = description;
  }

  const maxSessionDurationStr = extractTextContent(roleXml, 'MaxSessionDuration');
  if (maxSessionDurationStr) {
    roleInfo.maxSessionDuration = parseInt(maxSessionDurationStr, 10);
  }

  const permissionsBoundary = extractTextContent(roleXml, 'PermissionsBoundary');
  if (permissionsBoundary) {
    roleInfo.permissionsBoundary = permissionsBoundary;
  }

  // Parse tags
  const tagsMatch = roleXml.match(/<Tags>([\s\S]*?)<\/Tags>/);
  if (tagsMatch?.[1]) {
    const tags: Array<{ key: string; value: string }> = [];
    const tagsXml = tagsMatch[1];
    const tagMemberRegex = /<member>([\s\S]*?)<\/member>/g;
    let tagMatch;

    while ((tagMatch = tagMemberRegex.exec(tagsXml)) !== null) {
      const tagXml = tagMatch[1] ?? '';
      const key = extractTextContent(tagXml, 'Key');
      const value = extractTextContent(tagXml, 'Value');

      if (key && value) {
        tags.push({ key, value });
      }
    }

    if (tags.length > 0) {
      roleInfo.tags = tags;
    }
  }

  return roleInfo;
}

/**
 * Parse a ListRolePolicies response from XML
 *
 * @param xml - XML response string from ListRolePolicies
 * @returns Array of policy names
 *
 * @example
 * ```typescript
 * const policies = parseListRolePoliciesResponse(xmlResponse);
 * console.log(`Found ${policies.length} inline policies`);
 * ```
 */
export function parseListRolePoliciesResponse(xml: string): string[] {
  const policies: string[] = [];

  const policyNamesMatch = xml.match(/<PolicyNames>([\s\S]*?)<\/PolicyNames>/);
  if (policyNamesMatch?.[1]) {
    const policyNamesXml = policyNamesMatch[1];
    const memberRegex = /<member>(.*?)<\/member>/g;
    let memberMatch;

    while ((memberMatch = memberRegex.exec(policyNamesXml)) !== null) {
      policies.push(memberMatch[1] ?? '');
    }
  }

  return policies;
}

/**
 * Parse a ListAttachedRolePolicies response from XML
 *
 * @param xml - XML response string from ListAttachedRolePolicies
 * @returns Array of policy ARNs
 *
 * @example
 * ```typescript
 * const policyArns = parseListAttachedRolePoliciesResponse(xmlResponse);
 * console.log(`Found ${policyArns.length} attached policies`);
 * ```
 */
export function parseListAttachedRolePoliciesResponse(xml: string): string[] {
  const policyArns: string[] = [];

  const attachedPoliciesMatch = xml.match(/<AttachedPolicies>([\s\S]*?)<\/AttachedPolicies>/);
  if (attachedPoliciesMatch?.[1]) {
    const policiesXml = attachedPoliciesMatch[1];
    const memberRegex = /<member>([\s\S]*?)<\/member>/g;
    let memberMatch;

    while ((memberMatch = memberRegex.exec(policiesXml)) !== null) {
      const memberXml = memberMatch[1] ?? '';
      const policyArn = extractTextContent(memberXml, 'PolicyArn');
      if (policyArn) {
        policyArns.push(policyArn);
      }
    }
  }

  return policyArns;
}

/**
 * Parse an IAM error response from XML
 *
 * @param xml - XML error response string
 * @returns Object containing error code, message, and request ID
 *
 * @example
 * ```typescript
 * try {
 *   // ... make request
 * } catch (error) {
 *   const iamError = parseIamError(responseBody);
 *   console.error(`IAM Error: ${iamError.code} - ${iamError.message}`);
 * }
 * ```
 */
export function parseIamError(xml: string): {
  code: string;
  message: string;
  requestId?: string;
} {
  const errorMatch = xml.match(/<Error>([\s\S]*?)<\/Error>/);
  const errorXml = errorMatch?.[1] ?? xml;

  const code = extractTextContentOr(errorXml, 'Code', 'UnknownError');
  const message = extractTextContentOr(errorXml, 'Message', 'An unknown error occurred');
  const requestId = extractTextContent(xml, 'RequestId');

  return {
    code,
    message,
    requestId,
  };
}

/**
 * Parse an AssumeRole response from XML (STS)
 *
 * @param xml - XML response string from AssumeRole
 * @returns Parsed assumed credentials
 * @throws Error if XML is malformed
 *
 * @example
 * ```typescript
 * const credentials = parseAssumeRoleResponse(xmlResponse);
 * console.log(`Access Key: ${credentials.accessKeyId}`);
 * console.log(`Expires: ${credentials.expiration}`);
 * ```
 */
export function parseAssumeRoleResponse(xml: string): AssumedCredentials {
  const credentialsMatch = xml.match(/<Credentials>([\s\S]*?)<\/Credentials>/);
  if (!credentialsMatch?.[1]) {
    throw new Error('Invalid AssumeRole response: missing Credentials element');
  }

  const credentialsXml = credentialsMatch[1];

  const accessKeyId = extractTextContent(credentialsXml, 'AccessKeyId');
  const secretAccessKey = extractTextContent(credentialsXml, 'SecretAccessKey');
  const sessionToken = extractTextContent(credentialsXml, 'SessionToken');
  const expirationStr = extractTextContent(credentialsXml, 'Expiration');

  if (!accessKeyId || !secretAccessKey || !sessionToken || !expirationStr) {
    throw new Error('Invalid AssumeRole response: missing required credential fields');
  }

  const expiration = new Date(expirationStr);

  // Extract assumed role user info
  const assumedRoleUserMatch = xml.match(/<AssumedRoleUser>([\s\S]*?)<\/AssumedRoleUser>/);
  let assumedRoleArn = '';
  let assumedRoleId = '';

  if (assumedRoleUserMatch?.[1]) {
    const assumedRoleUserXml = assumedRoleUserMatch[1];
    assumedRoleArn = extractTextContentOr(assumedRoleUserXml, 'Arn', '');
    assumedRoleId = extractTextContentOr(assumedRoleUserXml, 'AssumedRoleId', '');
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiration,
    assumedRoleArn,
    assumedRoleId,
  };
}

/**
 * Parse a GetCallerIdentity response from XML (STS)
 *
 * @param xml - XML response string from GetCallerIdentity
 * @returns Parsed caller identity
 * @throws Error if XML is malformed
 *
 * @example
 * ```typescript
 * const identity = parseGetCallerIdentityResponse(xmlResponse);
 * console.log(`Account: ${identity.account}`);
 * console.log(`ARN: ${identity.arn}`);
 * ```
 */
export function parseGetCallerIdentityResponse(xml: string): CallerIdentity {
  const account = extractTextContent(xml, 'Account');
  const arn = extractTextContent(xml, 'Arn');
  const userId = extractTextContent(xml, 'UserId');

  if (!account || !arn || !userId) {
    throw new Error('Invalid GetCallerIdentity response: missing required fields');
  }

  return {
    account,
    arn,
    userId,
  };
}

/**
 * Extract text content from an XML tag
 *
 * @param xml - XML string to search
 * @param tagName - Tag name to extract
 * @returns Text content or undefined if not found
 * @internal
 */
function extractTextContent(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's');
  const match = xml.match(regex);
  return match?.[1];
}

/**
 * Extract text content with a default value
 *
 * @param xml - XML string to search
 * @param tagName - Tag name to extract
 * @param defaultValue - Default value if not found
 * @returns Text content or default value
 * @internal
 */
function extractTextContentOr(xml: string, tagName: string, defaultValue: string): string {
  return extractTextContent(xml, tagName) ?? defaultValue;
}

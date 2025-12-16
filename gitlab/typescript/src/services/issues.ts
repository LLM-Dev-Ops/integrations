/**
 * GitLab Issues Service
 *
 * Provides operations for managing GitLab issues including CRUD operations,
 * comments (notes), labels, and assignees.
 */

import type { GitLabClient, Page } from '../client.js';
import type {
  Issue,
  CreateIssueRequest,
  UpdateIssueRequest,
  IssueQuery,
  Note,
  ProjectRef,
} from '../types.js';

/**
 * Encodes a ProjectRef for use in API URLs
 */
function encodeProjectRef(project: ProjectRef): string {
  switch (project.type) {
    case 'Id':
      return String(project.value);
    case 'Path':
      return encodeURIComponent(project.value);
    case 'Url': {
      // Extract path from URL and encode it
      const url = new URL(project.value);
      const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
      return encodeURIComponent(path);
    }
  }
}

/**
 * Service for managing GitLab issues
 */
export class IssuesService {
  constructor(private readonly client: GitLabClient) {}

  /**
   * Creates a new issue in a project
   */
  async create(project: ProjectRef, request: CreateIssueRequest): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const body: Record<string, unknown> = {
      title: request.title,
    };

    if (request.description !== undefined) body['description'] = request.description;
    if (request.confidential !== undefined) body['confidential'] = request.confidential;
    if (request.assignee_ids !== undefined) body['assignee_ids'] = request.assignee_ids;
    if (request.milestone_id !== undefined) body['milestone_id'] = request.milestone_id;
    if (request.labels !== undefined) body['labels'] = request.labels;
    if (request.due_date !== undefined) body['due_date'] = request.due_date;
    if (request.weight !== undefined) body['weight'] = request.weight;

    const response = await this.client.post<Issue>(`/projects/${projectId}/issues`, body);
    return response.data;
  }

  /**
   * Gets a specific issue by IID
   */
  async get(project: ProjectRef, iid: number): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.get<Issue>(`/projects/${projectId}/issues/${iid}`);
    return response.data;
  }

  /**
   * Updates an existing issue
   */
  async update(project: ProjectRef, iid: number, request: UpdateIssueRequest): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const body: Record<string, unknown> = {};

    if (request.title !== undefined) body['title'] = request.title;
    if (request.description !== undefined) body['description'] = request.description;
    if (request.confidential !== undefined) body['confidential'] = request.confidential;
    if (request.assignee_ids !== undefined) body['assignee_ids'] = request.assignee_ids;
    if (request.milestone_id !== undefined) body['milestone_id'] = request.milestone_id;
    if (request.labels !== undefined) body['labels'] = request.labels;
    if (request.state_event !== undefined) body['state_event'] = request.state_event;
    if (request.due_date !== undefined) body['due_date'] = request.due_date;
    if (request.weight !== undefined) body['weight'] = request.weight;

    const response = await this.client.put<Issue>(`/projects/${projectId}/issues/${iid}`, body);
    return response.data;
  }

  /**
   * Lists issues in a project with optional filtering
   */
  async list(project: ProjectRef, query?: IssueQuery): Promise<Page<Issue>> {
    const projectId = encodeProjectRef(project);
    const params: Record<string, string | number | boolean | undefined> = {};

    if (query) {
      if (query.state !== undefined) params['state'] = query.state;
      if (query.labels !== undefined) {
        params['labels'] = Array.isArray(query.labels) ? (query.labels as string[]).join(',') : query.labels as string;
      }
      if (query.milestone !== undefined) params['milestone'] = query.milestone;
      if (query.scope !== undefined) params['scope'] = query.scope;
      if (query.author_id !== undefined) params['author_id'] = query.author_id;
      if (query.assignee_id !== undefined) params['assignee_id'] = query.assignee_id;
      if (query.search !== undefined) params['search'] = query.search;
      if (query.order_by !== undefined) params['order_by'] = query.order_by;
      if (query.sort !== undefined) params['sort'] = query.sort;
      if (query.page !== undefined) params['page'] = query.page;
      if (query.per_page !== undefined) params['per_page'] = query.per_page;
    }

    return this.client.getPaginated<Issue>(`/projects/${projectId}/issues`, {
      page: query?.page,
      perPage: query?.per_page,
    }, { query: params });
  }

  /**
   * Deletes an issue
   */
  async delete(project: ProjectRef, iid: number): Promise<void> {
    const projectId = encodeProjectRef(project);
    await this.client.delete(`/projects/${projectId}/issues/${iid}`);
  }

  /**
   * Closes an issue
   */
  async close(project: ProjectRef, iid: number): Promise<Issue> {
    return this.update(project, iid, { state_event: 'close' });
  }

  /**
   * Reopens an issue
   */
  async reopen(project: ProjectRef, iid: number): Promise<Issue> {
    return this.update(project, iid, { state_event: 'reopen' });
  }

  /**
   * Adds a note (comment) to an issue
   */
  async addNote(project: ProjectRef, iid: number, body: string): Promise<Note> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.post<Note>(
      `/projects/${projectId}/issues/${iid}/notes`,
      { body }
    );
    return response.data;
  }

  /**
   * Lists notes on an issue
   */
  async listNotes(
    project: ProjectRef,
    iid: number,
    options?: { page?: number; perPage?: number; sort?: 'asc' | 'desc' }
  ): Promise<Page<Note>> {
    const projectId = encodeProjectRef(project);
    return this.client.getPaginated<Note>(
      `/projects/${projectId}/issues/${iid}/notes`,
      { page: options?.page, perPage: options?.perPage },
      { query: { sort: options?.sort } }
    );
  }

  /**
   * Updates a note on an issue
   */
  async updateNote(project: ProjectRef, iid: number, noteId: number, body: string): Promise<Note> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.put<Note>(
      `/projects/${projectId}/issues/${iid}/notes/${noteId}`,
      { body }
    );
    return response.data;
  }

  /**
   * Deletes a note from an issue
   */
  async deleteNote(project: ProjectRef, iid: number, noteId: number): Promise<void> {
    const projectId = encodeProjectRef(project);
    await this.client.delete(`/projects/${projectId}/issues/${iid}/notes/${noteId}`);
  }

  /**
   * Adds labels to an issue
   */
  async addLabels(project: ProjectRef, iid: number, labels: string[]): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.put<Issue>(
      `/projects/${projectId}/issues/${iid}`,
      { add_labels: labels.join(',') }
    );
    return response.data;
  }

  /**
   * Removes labels from an issue
   */
  async removeLabels(project: ProjectRef, iid: number, labels: string[]): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.put<Issue>(
      `/projects/${projectId}/issues/${iid}`,
      { remove_labels: labels.join(',') }
    );
    return response.data;
  }

  /**
   * Adds assignees to an issue
   */
  async addAssignees(project: ProjectRef, iid: number, assigneeIds: number[]): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.put<Issue>(
      `/projects/${projectId}/issues/${iid}`,
      { add_assignee_ids: assigneeIds }
    );
    return response.data;
  }

  /**
   * Removes assignees from an issue
   */
  async removeAssignees(project: ProjectRef, iid: number, assigneeIds: number[]): Promise<Issue> {
    const projectId = encodeProjectRef(project);
    const response = await this.client.put<Issue>(
      `/projects/${projectId}/issues/${iid}`,
      { remove_assignee_ids: assigneeIds }
    );
    return response.data;
  }
}

/**
 * Factory function to create an IssuesService instance
 */
export function createIssuesService(client: GitLabClient): IssuesService {
  return new IssuesService(client);
}

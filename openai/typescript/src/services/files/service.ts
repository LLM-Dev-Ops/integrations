import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import { RequestBuilder } from '../../transport/request-builder.js';
import { ResponseParser } from '../../transport/response-parser.js';
import { MultipartFormBuilder } from '../../transport/multipart.js';
import type {
  FileObject,
  FileListResponse,
  FileDeleteResponse,
  FileCreateRequest,
  FileListParams,
} from './types.js';
import { FilesValidator } from './validation.js';
import type { RequestOptions } from '../../types/common.js';

export interface FilesService {
  list(params?: FileListParams, options?: RequestOptions): Promise<FileListResponse>;
  create(request: FileCreateRequest, options?: RequestOptions): Promise<FileObject>;
  retrieve(fileId: string, options?: RequestOptions): Promise<FileObject>;
  delete(fileId: string, options?: RequestOptions): Promise<FileDeleteResponse>;
  content(fileId: string, options?: RequestOptions): Promise<ArrayBuffer>;
}

export class FilesServiceImpl implements FilesService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async list(params?: FileListParams, options?: RequestOptions): Promise<FileListResponse> {
    const query: Record<string, string> = {};
    if (params?.purpose) query.purpose = params.purpose;

    const httpRequest = RequestBuilder.create()
      .setMethod('GET')
      .setPath('/v1/files')
      .setQuery(query)
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<FileListResponse>(response);
  }

  async create(request: FileCreateRequest, options?: RequestOptions): Promise<FileObject> {
    FilesValidator.validateCreate(request);

    const formData = MultipartFormBuilder.create()
      .addFile('file', request.file, 'file')
      .addField('purpose', request.purpose)
      .build();

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/files')
      .setBody(formData)
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<FileObject>(response);
  }

  async retrieve(fileId: string, options?: RequestOptions): Promise<FileObject> {
    FilesValidator.validateFileId(fileId);

    const httpRequest = RequestBuilder.create()
      .setMethod('GET')
      .setPath(`/v1/files/${encodeURIComponent(fileId)}`)
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<FileObject>(response);
  }

  async delete(fileId: string, options?: RequestOptions): Promise<FileDeleteResponse> {
    FilesValidator.validateFileId(fileId);

    const httpRequest = RequestBuilder.create()
      .setMethod('DELETE')
      .setPath(`/v1/files/${encodeURIComponent(fileId)}`)
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<FileDeleteResponse>(response);
  }

  async content(fileId: string, options?: RequestOptions): Promise<ArrayBuffer> {
    FilesValidator.validateFileId(fileId);

    const httpRequest = RequestBuilder.create()
      .setMethod('GET')
      .setPath(`/v1/files/${encodeURIComponent(fileId)}/content`)
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<ArrayBuffer>(response);
  }
}

import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import { RequestBuilder } from '../../transport/request-builder.js';
import { ResponseParser } from '../../transport/response-parser.js';
import { MultipartFormBuilder } from '../../transport/multipart.js';
import type {
  ImageGenerateRequest,
  ImageEditRequest,
  ImageVariationRequest,
  ImageResponse,
} from './types.js';
import { ImagesValidator } from './validation.js';
import type { RequestOptions } from '../../types/common.js';

export interface ImagesService {
  generate(request: ImageGenerateRequest, options?: RequestOptions): Promise<ImageResponse>;
  edit(request: ImageEditRequest, options?: RequestOptions): Promise<ImageResponse>;
  createVariation(request: ImageVariationRequest, options?: RequestOptions): Promise<ImageResponse>;
}

export class ImagesServiceImpl implements ImagesService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async generate(request: ImageGenerateRequest, options?: RequestOptions): Promise<ImageResponse> {
    ImagesValidator.validateGenerate(request);

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/images/generations')
      .setBody({ model: 'dall-e-3', ...request })
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<ImageResponse>(response);
  }

  async edit(request: ImageEditRequest, options?: RequestOptions): Promise<ImageResponse> {
    ImagesValidator.validateEdit(request);

    const formBuilder = MultipartFormBuilder.create()
      .addFile('image', request.image, 'image.png')
      .addField('prompt', request.prompt);

    if (request.mask) {
      formBuilder.addFile('mask', request.mask, 'mask.png');
    }

    if (request.model) formBuilder.addField('model', request.model);
    if (request.n) formBuilder.addField('n', String(request.n));
    if (request.size) formBuilder.addField('size', request.size);
    if (request.response_format) formBuilder.addField('response_format', request.response_format);
    if (request.user) formBuilder.addField('user', request.user);

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/images/edits')
      .setBody(formBuilder.build())
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<ImageResponse>(response);
  }

  async createVariation(request: ImageVariationRequest, options?: RequestOptions): Promise<ImageResponse> {
    ImagesValidator.validateVariation(request);

    const formBuilder = MultipartFormBuilder.create()
      .addFile('image', request.image, 'image.png');

    if (request.model) formBuilder.addField('model', request.model);
    if (request.n) formBuilder.addField('n', String(request.n));
    if (request.size) formBuilder.addField('size', request.size);
    if (request.response_format) formBuilder.addField('response_format', request.response_format);
    if (request.user) formBuilder.addField('user', request.user);

    const httpRequest = RequestBuilder.create()
      .setMethod('POST')
      .setPath('/v1/images/variations')
      .setBody(formBuilder.build())
      .setOptions(options)
      .build();

    const response = await this.orchestrator.request(httpRequest);
    return ResponseParser.parse<ImageResponse>(response);
  }
}

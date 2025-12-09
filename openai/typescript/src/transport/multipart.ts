export interface MultipartFile {
  name: string;
  content: Blob | Buffer | ReadableStream;
  filename: string;
  contentType?: string;
}

export interface MultipartField {
  name: string;
  value: string;
}

export type MultipartPart = MultipartFile | MultipartField;

export class MultipartFormBuilder {
  private parts: MultipartPart[] = [];

  addField(name: string, value: string): this {
    this.parts.push({ name, value });
    return this;
  }

  addFile(name: string, content: Blob | Buffer | ReadableStream, filename: string, contentType?: string): this {
    this.parts.push({ name, content, filename, contentType });
    return this;
  }

  build(): FormData {
    const formData = new FormData();

    for (const part of this.parts) {
      if ('value' in part) {
        formData.append(part.name, part.value);
      } else {
        const blob = part.content instanceof Blob
          ? part.content
          : new Blob([part.content as BlobPart], { type: part.contentType });
        formData.append(part.name, blob, part.filename);
      }
    }

    return formData;
  }

  static create(): MultipartFormBuilder {
    return new MultipartFormBuilder();
  }
}

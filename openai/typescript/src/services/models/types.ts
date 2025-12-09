export interface ModelObject {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface ModelListResponse {
  object: 'list';
  data: ModelObject[];
}

export interface ModelDeleteResponse {
  id: string;
  object: 'model';
  deleted: boolean;
}

export interface ModelInfo {
  id: string;
  display_name: string;
  created_at?: string;
  type: 'model';
}

export interface ModelListResponse {
  data: ModelInfo[];
  has_more: boolean;
  first_id?: string;
  last_id?: string;
}

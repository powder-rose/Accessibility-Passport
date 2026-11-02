export interface LeadRecord {
  id: string;
  createdAt: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface LeadRecord {
  id: string;
  createdAt: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface LeadPage {
  leads: LeadRecord[];
  total: number;
  nextCursor: string | null;
}

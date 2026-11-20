export type SplitBillEntityAvatar = {
  name: string;
  avatarUrl: string | null;
};

export type SplitBillPersonSummary = SplitBillEntityAvatar & {
  id: string;
};

export type SplitBillGroupSummary = SplitBillEntityAvatar & {
  id: string;
  canEdit?: boolean;
  archivedAt?: string | null;
  members: Array<{ id: string; name: string; sortOrder: number; previousNames?:string[] }>;
};

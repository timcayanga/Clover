export type SplitBillEntityAvatar = {
  name: string;
  avatarUrl: string | null;
};

export type SplitBillPersonSummary = SplitBillEntityAvatar & {
  id: string;
};

export type SplitBillGroupSummary = SplitBillEntityAvatar & {
  id: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

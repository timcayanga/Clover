export const adminRoles = ["owner", "admin", "support", "read_only"] as const;
export type AdminRole = (typeof adminRoles)[number];
export type AdminPermission =
  | "read"
  | "support"
  | "operate"
  | "entitlements"
  | "security"
  | "destructive"
  | "manage_staff";
const permissions: Record<AdminRole, readonly AdminPermission[]> = {
  owner: [
    "read",
    "support",
    "operate",
    "entitlements",
    "security",
    "destructive",
    "manage_staff",
  ],
  admin: ["read", "support", "operate", "entitlements", "security"],
  support: ["read", "support"],
  read_only: ["read"],
};
export function canAdmin(role: string, permission: AdminPermission): boolean {
  return (
    Object.hasOwn(permissions, role) &&
    permissions[role as AdminRole].includes(permission)
  );
}

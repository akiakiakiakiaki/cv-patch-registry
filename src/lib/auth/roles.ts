export const MEMBER_ROLES = ["user", "admin"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
export type AppRole = "guest" | MemberRole;
export type Capability = "manageSynths" | "importExportPatches" | "adjustBuiltInLayout";

const roleCapabilities: Record<AppRole, Record<Capability, boolean>> = {
  guest: {
    manageSynths: false,
    importExportPatches: false,
    adjustBuiltInLayout: false,
  },
  user: {
    manageSynths: true,
    importExportPatches: true,
    adjustBuiltInLayout: true,
  },
  admin: {
    manageSynths: true,
    importExportPatches: true,
    adjustBuiltInLayout: true,
  },
};

export function isMemberRole(value: unknown): value is MemberRole {
  return value === "user" || value === "admin";
}

export function roleForUser(user: { role?: unknown } | null | undefined): AppRole {
  if (!user) return "guest";
  return isMemberRole(user.role) ? user.role : "guest";
}

export function hasCapability(role: AppRole, capability: Capability): boolean {
  return roleCapabilities[role][capability];
}

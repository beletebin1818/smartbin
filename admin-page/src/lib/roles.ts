/**
 * Shared mapping between the backend's `AdminRole` enum values
 * (super_admin | admin | moderator | support | agent) and the
 * display-friendly strings used throughout the Admin Dashboard UI.
 *
 * Centralized here so the Login page and Admin Users page never
 * duplicate this translation.
 */

import type { AdminRole } from "@/types";

const BACKEND_TO_DISPLAY: Record<string, AdminRole> = {
  super_admin: "Super Admin",
  admin: "Admin",
  moderator: "Moderator",
  support: "Support",
  agent: "Agent",
};

const DISPLAY_TO_BACKEND: Record<AdminRole, string> = {
  "Super Admin": "super_admin",
  Admin: "admin",
  Moderator: "moderator",
  Support: "support",
  Agent: "agent",
};

export function roleToDisplay(role: string): AdminRole {
  return BACKEND_TO_DISPLAY[role] ?? "Admin";
}

export function displayToRole(role: AdminRole): string {
  return DISPLAY_TO_BACKEND[role];
}

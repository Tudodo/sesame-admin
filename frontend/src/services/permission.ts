/**
 * Check if the current user has a specific permission.
 *
 * Checks in order:
 * 1. Exact match in the global `permissions` array (login response)
 * 2. Exact match in `currentActions` (per-route granted actions)
 * 3. If given a short action name like "create", checks if any
 *    permission code ends with `:create` or matches the short name
 *    in `currentActions`
 */
import { safeLocalStorage } from "@/lib/utils";

export function can(perm: string): boolean {
  try {
    // Check global permissions array (from login)
    const permissions: string[] = JSON.parse(
      safeLocalStorage.getItem("permissions") || "[]",
    );
    if (permissions.includes(perm)) return true;

    // Check per-route current actions (backward compat)
    const currentActions: string[] = JSON.parse(
      safeLocalStorage.getItem("currentActions") || "[]",
    );
    if (currentActions.includes(perm)) return true;

    // If it's a short action name like "create", check if any
    // global permission ends with `:create`
    if (!perm.includes(":")) {
      for (const p of permissions) {
        if (p.endsWith(`:${perm}`)) return true;
      }
    }

    return false;
  } catch {
    // Fail closed: a corrupted permission store must not grant access.
    return false;
  }
}

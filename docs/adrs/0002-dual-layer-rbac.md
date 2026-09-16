# ADR 002: Dual-Layer Role-Based Access Control

**Date:** 2026-09-15
**Status:** Accepted

## Context
The system supports multiple distinct user roles (`SALES_COORDINATOR`, `LOGISTICS`, `TASS`, `ADMIN`, `DRIVER`). We need a secure and user-friendly way to restrict access to screens and actions.

## Decision
We will implement **Dual-Layer RBAC**. Permissions are checked in two distinct places, and both must agree:
1.  **Frontend (UI State):** `App.tsx` uses `DEFAULT_ROLE_SCOPE` to hide buttons, links, and screens that the current user should not see.
2.  **Backend (API Gatekeeper):** `server/src/middleware/auth.ts` uses `requireRole()` to explicitly reject unauthorized API requests.

## Consequences
**Positive:**
*   **True Security:** Hiding a button on the frontend is not a security measure. The backend middleware ensures that even if a user manually crafts a curl/fetch request, the data is protected.
*   **Clean UX:** The frontend UI remains clean, only showing users the tools they are authorized to use.

**Negative:**
*   **Duplication of Logic:** If a permission changes (e.g., "Logistics can now view Admin Panel"), a developer must update *both* the frontend state and the backend middleware. Modifying only one will create a security hole or a confusing UI bug.

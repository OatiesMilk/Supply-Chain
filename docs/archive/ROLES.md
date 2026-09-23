# Roles & Permissions (RBAC)

This is the detailed reference for who can do what. For the short version and *why* RBAC matters at all, see the "Roles & Permissions" section in the main `README.md`. For terms you don't recognize, see `docs/GLOSSARY.md`.

There are **five** login roles: `SALES_COORDINATOR`, `LOGISTICS`, `TASS`, `ADMIN`, `DRIVER`.

Permissions are enforced in two places, and both must agree — see [`DONT_BREAK_THIS.md`](../DONT_BREAK_THIS.md#2-permissions-are-checked-in-two-places-and-both-must-agree) before changing anything here:
- Frontend: `DEFAULT_ROLE_SCOPE` in `src/App.tsx` (controls what's shown — not a real security boundary)
- Backend: `requireAuth`/`requireRole(...)` in `server/src/middleware/auth.ts` (the real security boundary)

An Admin can grant or revoke individual screens per user on top of the role default, via `UserPermission` records.

---

## ⚠️ TASS role status: PROVISIONAL

**TASS = Technical Admin System Services.** Not Accounting. Not Finance.

Everything below describing TASS's permissions and workflow is **this project's current implementation**, based on assumptions made **before** a stakeholder meeting with the actual TASS department has happened. None of it should be treated as confirmed requirements.

| | Status |
|---|---|
| Stakeholder meeting with TASS held? | ❌ Not yet |
| Current permissions confirmed by TASS? | ❌ No — implementation is a guess |
| Expected to change after validation? | ✅ Yes, likely |

**If you're picking this project up and a TASS stakeholder meeting has since happened:** update this table, and update the permissions table below to match what was actually confirmed. Until then, don't build new features on top of TASS's current permissions assuming they're "the real requirements" — they might not survive contact with the actual department.

---

## Department Impact / Operational Workflow

| | **Sales Coordinator** | **Logistics** | **TASS** (provisional — see above) | **Admin** | **Driver** |
|---|---|---|---|---|---|
| Primary purpose | Creates and owns delivery records | Manages driver-side field operations & master data | Currently implemented as: verifies billing/collection status | System administration & demo tooling | Field execution — mobile-style app only |
| UI shell | Full sidebar + dashboard | Full sidebar + dashboard | Full sidebar + dashboard | Full sidebar + dashboard | **Dedicated full-screen `DriverDashboard`**, no sidebar |
| Create new records | ✅ (with Auto Fill) | ❌ | ❌ | ❌ (not a normal workflow role) | ❌ |
| Edit record fields (drawer) | ✅ full edit | ✅ Driver/vehicle/assistant assignment, and full edit | ❌ read-only | ✅ full edit | ✅ (own assigned records only) |
| Change record status | ❌ (server-blocked; view only) | ✅ | ❌ read-only | ✅ | ✅ (own assigned records only) |
| Verify Accounting Collection | ❌ | ❌ | ✅ exclusive (`PATCH /:id/verify-collection`) | ❌ | ❌ |
| Which categories are visible | All | All | **Accounting Collection, RMA, Procurement Pick-up** | All | Only records assigned to that driver |
| Driver Dispatch Board / Driver Board / Calendar | ❌ | ✅ | ❌ | ✅ | N/A (has its own app instead) |
| Driver Manager (driver directory CRUD) | ❌ | ✅ | ❌ | ✅ | ❌ |
| Customers / Suppliers directories | ✅ | ✅ | Suppliers only | ✅ | ❌ |
| SKU Master / Inventory / Transactions | ✅ | ✅ | ✅ | ✅ | ❌ |
| Admin Panel / Data Sampler | ❌ | ❌ | ❌ | ✅ exclusive | ❌ |
| Statistical Reports / Status History | ❌ | ✅ | ❌ | ✅ | ❌ |
| Dashboard KPIs | Delivery-focused (`GET /api/dashboard/stats`): Scheduled/Pending Driver/On-Hold/Rescheduled/Completed Today | Inventory & fulfillment-focused | Inventory & fulfillment-focused | All KPIs | N/A |

In practice, a typical delivery's lifecycle crosses three roles: Sales Coordinator creates the record; Logistics assigns a driver, vehicle, and schedule and progresses status through dispatch; and, for Accounting Collection records specifically, TASS currently performs the final collection verification step (again — implemented, not confirmed). No single role can complete that whole chain alone, by design.

## Technical Highlights

Per-user overrides live in `UserPermission` (`@@unique([userId, screen])`), layered on top of `DEFAULT_ROLE_SCOPE`, so an Admin can grant a specific user temporary access to a screen without changing their role. One screen — Warehouses — is force-excluded from every role's effective set directly in `App.tsx`, including against stale permission grants (see `DONT_BREAK_THIS.md` item 8).

## Business Benefits (why RBAC exists at all)

- **Security** — every write endpoint is gated by `requireRole(...)`, so a compromised or misused frontend session cannot perform an action outside that user's role, even by calling the API directly.
- **Separation of duties** — record *creation* (Sales Coordinator) is deliberately separated from *dispatch execution* (Logistics/Driver) and from *collection verification* (TASS exclusively), so no single role can create, ship, and verify payment on the same record unchecked.
- **Operational responsibility** — each department only sees the categories of record relevant to its job, keeping each team's screen a working tool rather than a dump of everyone else's data.

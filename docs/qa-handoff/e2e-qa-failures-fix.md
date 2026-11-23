# QA handoff: seeded E2E failures from the combined QA pass

Branch: `fix/e2e-seeded-qa-failures` (PR into `dev`). Base: `a6e4baf`.

## What changed

All 8 failures from the combined QA run were triaged. Seven were stale tests; none was a server bug. One extra real defect surfaced while re-running the suite against a LEGACY-mode seed.

| Failure | Verdict | Fix |
| --- | --- | --- |
| Admin logout then `GET /auth/me` returned 200 | Test race, not a server bug. `POST /auth/logout` clears the cookie; the UI drops the session immediately and fires the request, so the test read `/auth/me` before the request completed. | `logout()` now waits for the login form before asserting 401. It also uses the account menu for every role (the old Driver `Log Out` button no longer exists). |
| User accounts row has no Edit or Access button | Intentional: row actions moved into an `Actions for <name>` kebab menu. Access now opens the account's permission editor on Roles & Permissions. | Tests open the menu first. Access works with both the V1 policy editor and the LEGACY module-access panel. The 1280/390 test checks the menu is reachable, then the editor. |
| `RESOURCE:users:WRITE` checkbox missing | Intentional: controls are disabled selects labelled `User Management → Shared resource → Write`. Still disabled for the Admin role. | Label updated. |
| "View N Deliveries" | Singular copy `View 1 Delivery` is correct. | Regex accepts singular or plural. |
| Driver heading `John Doe` | Heading is `Driver dashboard`; the name sits in the header. | Locators updated. |
| TASS `View RMA` | Button is `View all N open RMA records`. | Locator updated. |
| RMA transport AC14 (unverified) | Code review: the Driver list uses the polled paged-records query (30 s, background off). | New client test proves an open Driver list picks up an RMA transport start by polling with no reload. |

Real defect fixed: closing the Logistics **Completed today** dialog did not return focus to the tile (the dialog unmounts, so the browser had nothing to restore from). `CompletedTodayDialog` now restores focus to the opener. Unit test added.

## Results on this branch (throwaway local DB `mgqa_test`, loopback only)

- `client`: `tsc --noEmit` pass; `npm test` 484 tests, 483 pass, 1 skipped.
- `server`: `tsc --noEmit` pass; `npm test` 591 tests, 579 pass, 12 skipped (optional PostgreSQL tests).
- `e2e`: `npm run typecheck:seeded` pass.
- Seeded E2E with `SEEDED_E2E_FIXTURES=current`: 24 of 24 pass. Without `current`, the TASS and Driver tests fail fixture validation on a plain `npm run seed` database because default screens differ from the legacy canonical set. That is a fixture setting, not an app issue.
- Note: the seed used was in LEGACY permission mode. Please re-run in the V1-activated environment Codex used, since Access and the role editor render differently there (the tests handle both).

## What to re-run

```bash
cd client && npx tsc --noEmit && npm test
cd server && npx tsc --noEmit && npm test
npm run typecheck:seeded --prefix e2e
SEEDED_E2E_TARGET=local SEEDED_E2E_FIXTURES=current BASE_URL=http://localhost:3000 \
  API_BASE_URL=http://localhost:3000/api/v1 npm run test:seeded --prefix e2e
```

Use a disposable `_test` or `_sandbox` database only. Expect 24 of 24.

Manual spot checks: Admin > User accounts > kebab menu > Access opens the permission editor; Logistics dashboard > Completed today > Esc returns focus to the tile.

## Follow-ups for a later QA pass (fixtures missing, not built here)

- Driver queue with more than 25 records (page change, AC3).
- Overdue run and long-description fixtures (driver mobile AC7, AC8).
- 375px measurements for non-driver dashboards (dashboard redesign AC14, role dashboard R2-3).
- Record numbers on manifests, PDFs, exports and audit surfaces (short record IDs AC7), and the missing-reference notification (AC10).
- Reduced-motion check across dashboards (AC13) and a pre-redesign KPI baseline (AC18).
- Live two-session AC14 check in a browser (Logistics starts, Driver card updates within 30 s). Only the unit-level polling proof exists.

## Results (for Codex to fill in)

| Check | Result | Notes |
| --- | --- | --- |
| Client typecheck and tests | | |
| Server typecheck and tests | | |
| Seeded E2E (24) | | |
| Admin Access manual check | | |
| Completed today focus return | | |

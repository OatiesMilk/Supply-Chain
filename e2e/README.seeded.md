# Seeded role smoke suite

This suite checks the running local frontend and backend using the five canonical
accounts in `server/prisma/seeds/users.ts`. It includes Sales Coordinator,
Logistics, TASS, Admin and Driver. Microsoft sign-in is excluded.

Prepare an authorized disposable local database and start the existing frontend
and backend separately. See [Getting started](../docs/GETTING_STARTED.md) for the
guarded demo/UAT seed workflows. **This runner never seeds, resets, migrates or
starts services.** Do not substitute the unguarded `seed:users-only` command:
despite its name, that script deletes operational data. The normal full seed has
RMA and collection records; a minimal users-only dataset cannot establish detail
workflow coverage. `seed:uat` provides Driver/completed-delivery fixtures but may
not contain RMA records. Supply those existing full-seed records to exercise all
detail checks; missing category fixtures are explicitly skipped.

Run from the repository root:

```bash
npm run test:seeded:list --prefix e2e
npm run typecheck:seeded --prefix e2e
SEEDED_E2E_TARGET=local BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:3000/api npm run test:seeded --prefix e2e
```

`BASE_URL` defaults to `http://localhost:3000` and must be an origin without a
path. `API_BASE_URL` defaults to that origin plus `/api`; the Vite proxy supplies
the backend. A direct backend such as `http://localhost:4000/api` is supported.
Both URLs must be loopback HTTP(S), have the same hostname for cookie sharing,
and contain no credentials, query or fragment. Do not mix `localhost` and
`127.0.0.1`. `SEEDED_E2E_TARGET=local` confirms that you prepared the intended
local seeded sandbox; it is required when executing, but not for discovery or
typechecking. These checks constrain the HTTP target; they cannot prove which
database that backend uses. Verify the backend's database target before running.

The suite uses the seed fixture passwords, not environment secrets. It verifies
the expected names, roles and default screen grants at login. Customized accounts
or policies fail fixture validation by default. For the existing local accounts,
set `SEEDED_E2E_FIXTURES=current`: role and email remain fixed, session identity
is checked against `/auth/me`, and every currently granted catalog screen is
exercised. Record-category screens additionally require category Read: tests
verify redirection when a screen grant lacks that prerequisite, and wait for
loaded record pagination on authorized list screens. Names and screen grants may differ from the canonical seed. This mode
does not change accounts or permissions and does not establish canonical role
defaults. Denied Admin reads, Driver ownership and business-write guards remain
asserted in both modes. Both LEGACY and initialized/converted V1
sessions are supported. V1 activation is an operator prerequisite, never done by
the test runner. Sessions remain in memory: no storage-state files, login traces
or videos are written. Failure screenshots go under `e2e/test-results/seeded`.

The separate `seeded.config.ts` does not include `tests/global.setup.ts`, the
older mutating UAT specs, or the RMA dispatch suite. The existing default global
setup currently only saves authentication state; business mutations and cleanup
requests occur in its dependent specs. These suites remain separate deliberately.

## Coverage and limits

| Area | What this suite asserts |
| --- | --- |
| Five role screen sets | Every server-granted default screen renders after a full navigation/reload; browser runtime errors fail the test. |
| Permission boundaries | Forbidden Admin navigation redirects; non-Admin reads of users, audit and integrations return 403; Driver reads contain assigned, non-draft records. |
| Session isolation | Admin logout clears authentication; subsequent Driver and TASS email logins show their own screens without Admin controls. |
| Admin account controls | Create/Edit/Access/Deactivate/Delete workflows open and cancel without changing accounts. Access renders outside the table. |
| Admin diagnostics | Audit filter request and integration diagnostics succeed; Admin policy preview opens with protected controls disabled. No email is sent. |
| Admin pagination | Seed count matches visible rows; page size changes work. With more than ten pre-existing fixture users, page 2/back is exercised; the five-account seed checks the disabled Next boundary. |
| Admin geometry | At 1280px and 390px, opening Access and repeatedly scrolling does not grow the document or content height; right-hand table controls remain reachable. |
| TASS handoffs | Dashboard opens RMA list; collection view loads; record reads remain RMA/collection scoped. |
| TASS detail review | Available seeded RMA/collection tabs open without completing, receiving, verifying or editing records. Missing category fixtures produce explicit skips. |

The browser request guard aborts unexpected non-read `/api` calls except
`/auth/login` and `/auth/logout`. Playwright `page.request` calls bypass browser
routing; the suite's direct API calls are GET plus the explicit authentication
POST. Do not add business mutation API helpers to this suite. Authentication may
produce ordinary server-side session/audit activity; business records, account
permissions, stock and email remain unchanged by these specs.

Passing discovery/typechecking does **not** establish browser behavior. A real
run needs the prepared database, running services and an installed Playwright
Chromium. Transaction races, rollback, account mutation, record lifecycle writes,
external delivery and unsupported inventory capabilities require their separate
unit/router/disposable PostgreSQL suites; these smoke tests do not replace them.

# Driver Demo Seed

The `seed:driver-demo` command adds demonstration delivery records for the current UTC date to your local database without resetting it. This allows active driver accounts to see runs on their mobile dashboard on the day you test them.

## Usage

```bash
npm run seed:driver-demo
```

## Behavior

- **Validates Prerequisites**: Requires `sales@microgenesis.com`, `logistics@microgenesis.com`, `admin@microgenesis.com`, and `driver@microgenesis.com` to exist and be active.
- **Directory Resolution**: Automatically resolves the `DRIVER` user account's current name and ensures there is a matching `Driver` directory entry. It creates the entry if missing.
- **Skipping Inactive Entries**: Will intentionally skip active user accounts whose corresponding `Driver` directory entry is set to `isActive: false`. It will never reactivate an inactive identity or create duplicates.
- **Run Creation**: Creates one delivery record scheduled for today (UTC) for each active seeded driver (e.g., Lando Navarro, Manny Santos, Ronald de la Cruz) plus the resolved driver account name.
- **Idempotency**: Execution is safe to repeat. Runs are generated with deterministic IDs, so it won't duplicate them, and it won't overwrite runs you have already modified or completed during your testing.

Fresh database initialization also calls this helper after the ordinary seed completes. Existing databases retain the normal seed's early return; use the command above to add today's demo runs.

## TSK-80 verification (October 2, 2026)

- Server seed and directory tests: 18 passed. Client directory tests: 3 passed.
- First local execution added four scheduled runs and the missing Leo Driver directory entry. Repeating the command added zero runs and changed zero existing rows.
- Row fingerprints confirmed that all original 5 users, 6 directory entries, and 65 delivery records were preserved.
- Authenticated API checks confirmed that Leo Driver sees one run for today and only his own records. Logistics sees four assigned runs for today and four active drivers. Unauthenticated directory access returns 401.
- Full TypeScript checks remain blocked by existing unrelated files: `server/src/notion.ts` imports the missing `@notionhq/client` dependency, and `client/fix_cust.cjs` contains a syntax error. Both workspaces pass when those files are excluded.

The seed follows the dashboard's existing UTC definition of today. Run it again on a later day when new demo runs are needed. Database application and API checks were local; browser interaction was not checked.

# Staging seed review evidence (#173)

Verified on 2026-10-14. These results concern the committed workbook and seed
implementation; no staging database was seeded, reset, migrated or inspected
during this verification.

## Original Excel accuracy

The original [route workbook](../server/prisma/data/sources/delivery-route-2026.xlsx)
is now included for independent review. Its filename is shortened in the repository;
its bytes match the originally supplied
`DELIVERY ROUTE 2026 2_f754f462-85d0-4a04-be04-72b6b657af17.xlsx`.

SHA256: `2de7b1dca588256719abb9fd97f8a7c2764b02b2895f2307708ef75c2e39ecd0`.

Reproduce the comparison from the repository root with Python 3 (standard library
only; this command makes no database connections):

```bash
python3 server/prisma/verify-staging-route-source.py
```

The verifier checks workbook SHA256, source worksheet headers and every complete
snapshot row, including raw cell strings and mapped date/driver/helper/company/
document/reference/remarks fields. It uses stored worksheet values, not formula
recalculation. Row selection is the reviewed populated company rows 7–25 on
`Sheet2`, `1`, `2`, and `3`; blank/template sheets are excluded.

| Worksheet | Verified route rows |
| --- | ---: |
| `Sheet2` | 8 |
| `1` | 4 |
| `2` | 14 |
| `3` | 6 |
| **Total** | **32** |

Result: 32/32 snapshot rows match, covering 21 exact company names. Repeated
document references remain distinct worksheet rows. Modified-row and incorrect
workbook-hash negative checks both failed verification as expected.

## Isolation and execution status

`APP_ENV`, explicit host/database confirmations and `current_database()` checks
are execution safeguards, **not independent proof of infrastructure isolation**.
The inspected Supabase database named `postgres` is still refused. Target/project/
storage isolation and the preflight release decision remain unverified, as
documented in [Cycle 3 preflight](./CYCLE3_DB_PREFLIGHT_163.md).

No claim is made that the currently deployed Render service has an isolated
database, or that the new seed has already populated staging.

## UAT suitability and approval

These are source-based historical drafts dated 2026-06-16, with explicitly assigned
PENDING/DELIVERY/default-priority values. The workbook does not verify those
business states. Inactive, unlinked personnel profiles and past-dated drafts do
not provide the active Driver account, current-day assignments, completion states
or POD fixtures required by automated Driver workflow UAT. Such fixtures must be
prepared and tested separately on an approved disposable target; the existing
local demo/UAT commands remain unchanged.

The requesting user explicitly confirmed on 2026-10-14 that the original workbook
and company/personnel details are approved both for inclusion in this branch and
for staging use. This records that confirmation; it does not replace the separate
deployment/isolation and release-owner checks. Applied seed commands require the
operator to acknowledge the source-data approval explicitly.

See [staging seed setup](./staging-seed.md) for operational reset scope, preserved
login accounts, confirmation settings, and preview/apply commands.

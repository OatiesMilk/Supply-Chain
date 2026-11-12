# Historical driver import

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`).

Driver API reads never seed or synchronize the directory. Demo roster setup remains
part of the existing explicit seed workflow.

From the repository root, preview missing names from historical delivery records:

```powershell
npm run drivers:import --workspace=mg-portal-server
```

Review the output, then explicitly apply it if needed:

```powershell
npm run drivers:import --workspace=mg-portal-server -- --apply
```

The command keeps existing active and inactive entries unchanged. It compares
trimmed, case-insensitive names within each person type and ignores malformed
assistant lists. New historical entries are inactive until an authorized operator
activates them in Driver Manager. Historical delivery records are never rewritten.

This is a maintenance operation against the database configured for the server.
It is not run automatically at startup or during deployment. Name matching is a
legacy compatibility measure. Delivery assignments themselves are stored by stable
driver profile ID (`DeliveryRecord.driverId`, TSK-100); the display name on a record
is only a snapshot.

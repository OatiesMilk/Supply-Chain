# Automated QA results: RUN-20261020-02

Status: **BLOCKED**

Build: 597bd36; branch: dev; working tree (including uncommitted tests).
Time: 2026-10-20T00:26:51.180Z; Manila day: 2026-10-20.
Requested scope: all.

Tests: 48; passed: 48; failed: 0; cancelled: 0; skipped: 0; todo: 0; pass rate: 100.0%.

| File/layer | Status | Tests | Pass | Fail | Blocker |
|---|---|---:|---:|---:|---|
| e2e/unit/attachment-and-quotas.test.ts | PASS | 8 | 8 | 0 |  |
| e2e/unit/automation-infrastructure.test.ts | PASS | 7 | 7 | 0 |  |
| e2e/unit/customer-and-sku-validation.test.ts | PASS | 7 | 7 | 0 |  |
| e2e/unit/date-and-time.test.ts | PASS | 7 | 7 | 0 |  |
| e2e/unit/delivery-lifecycle.test.ts | PASS | 6 | 6 | 0 |  |
| e2e/unit/permissions-and-scoping.test.ts | PASS | 13 | 13 | 0 |  |
| api | BLOCKED | — | — | — | Missing runtime variables: UAT_PASSWORD_SC, UAT_PASSWORD_LOGISTICS, UAT_PASSWORD_TASS, UAT_PASSWORD_ADMIN, UAT_PASSWORD_DRIVER |
| browser | BLOCKED | — | — | — | Missing runtime variables: UAT_PASSWORD_SC, UAT_PASSWORD_LOGISTICS, UAT_PASSWORD_TASS, UAT_PASSWORD_ADMIN, UAT_PASSWORD_DRIVER |

This is automated regression evidence, not full UAT sign-off. Unselected layers and requirements not asserted by these tests are not verified. Existing defects remain open until their exact acceptance criteria are retested.

[Evidence index](../../artifacts/RUN-20261020-02/index.md)

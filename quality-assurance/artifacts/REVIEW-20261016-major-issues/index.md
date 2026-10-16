# Remaining-major-issue review evidence

| Document control | Value |
|---|---|
| Date | 2026-10-16 |
| Type | Isolated handler verification; not live UAT |

| File | Coverage |
|---|---|
| [handler-probe-results.json](handler-probe-results.json) | Mocked direct-handler probes for DEF-006/007, DEF-008, DEF-010, DEF-011, DEF-017 and DEF-026. No live database reads/writes or HTTP listeners. |

The probe ran the action role guard and final handler with allowed-role fixtures. Session, module/resource, and record-scope middleware were bypassed. Prisma calls were stubbed, and selected Prisma errors were injected. Recorded response codes are handler outputs, not observed live HTTP responses. For rejected unwrapped handlers, the probe records missing response/error forwarding; it does not measure a new browser timeout. Source review links and limitations are in the [review](../../06-reports/2026-10-16-remaining-major-issues-review.md).

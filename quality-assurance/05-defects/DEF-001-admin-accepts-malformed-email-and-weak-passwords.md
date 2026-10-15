# DEF-001: Admin accepts malformed email and weak passwords

| Document control | |
|---|---|
| Title | DEF-001 Admin accepts malformed email and weak passwords |
| Version | 1.0 |
| Date | 2026-10-15 |
| Author agent | ChatGPT Codex |
| Status | Open |

## 1. Classification

| Field | Value |
|---|---|
| Defect ID | DEF-001 |
| Title | Admin accepts malformed email and weak passwords |
| Linked test case(s) | [TC-ADM-004](../02-test-design/test-cases/TC-ADM-administration.md#tc-adm-004-weak-passwords-and-malformed-emails-are-refused) |
| Linked scenario | TS-016 |
| Role and account used | Admin, admin@microgenesis.com; passwords are not recorded |
| Severity | Minor |
| Priority | P3 |
| Status | Open |
| Found in run | RUN-20261014-02 |

## 2. Environment

| Field | Value |
|---|---|
| URL | http://localhost:3000 or the API path specified in the linked case steps |
| Browser and version | Microsoft Edge 155.0.4283.45 via Playwright 1.64.1 |
| Build / commit hash | 2172fc8 |
| Date and time observed (Asia/Manila) | Exact time not retained; see execution log. |
| Database / seed | mg_portal_sandbox; npm run seed:uat |

## 3. Preconditions and data used

- TC-ADM-004: Signed in as Admin in its own browser context (session from TC-AUTH-004). Test data: None beyond preconditions

## 4. Steps to reproduce

### TC-ADM-004 — Weak passwords and malformed emails are refused

1. In the Admin session, send with the API helper (AGENTS.md §8): `POST /api/users` body `{"name":"UAT Weak","email":"not-an-email","password":"1","role":"TASS"}`
2. If created, note it for cleanup in TC-ADM-013.

## 5. Expected result

- TC-ADM-004: 400 naming the email format and/or password policy. Fail (SI-15) if 201.

## 6. Actual result (in full)

- TC-ADM-004: The Admin creation flow accepted malformed email not-an-email and a weak password for UAT Weak; the created user appeared Active. The account was later removed under TC-ADM-013.

The report records observed behavior from the linked case and does not assert an unverified root cause or prescribe a code change.

## 7. Workflow impact

| Field | Value |
|---|---|
| Where in the workflow it occurred | TS-016; see linked case steps |
| What it blocks downstream | Invalid account data can enter the user directory; the test account was removed after the probe. |
| Workaround observed | See linked case actual result; no unrecorded workaround is inferred. |

## 8. Frequency

| Field | Value |
|---|---|
| Reproducibility | Observed in this run; not re-tested after failure |
| Attempts | Case execution only; see steps for multi-attempt probes. No independent retry was made. |

## 9. Technical evidence

- Browser console errors: no finding-specific console transcript retained.
- Network request and response: No separate request/response artifact was retained for these cases.
- Server log lines: no finding-specific server log transcript retained.
- Playwright trace: not retained.

## 10. Screenshots

No screenshot was retained for the linked failure.

## 11. Retest history

| Run ID | Date | Result | Notes |
|---|---|---|---|
| | | | |

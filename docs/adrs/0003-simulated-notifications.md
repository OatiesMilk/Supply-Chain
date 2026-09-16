# ADR 003: Simulated Output Actions for Demo Environment

**Date:** 2026-09-15
**Status:** Accepted

## Context
The application includes an "Output Actions" panel designed to trigger notifications (e.g., "Notify Logistics", "Notify TASS", "Export to PDF"). Because this system is currently serving as a demo/development prototype, wiring up real API services for all these actions would cause unnecessary spam and require complex external dependencies.

## Decision
Most "notifications" triggered in the UI will be intentionally **faked (simulated)**.
*   Out of six triggers, five will only show a frontend confirmation banner but will not execute a backend action or send an email.
*   Only the **Accomplished** trigger is wired up to a real backend service (`server/src/services/notify.ts`), which acts as the reference pattern for future real integrations.
*   Even for the "real" trigger, emails are logged to the backend terminal rather than dispatched, unless `SMTP_*` environment variables are explicitly provided.

## Consequences
**Positive:**
*   Stakeholders can test the UI/UX flow without generating massive amounts of email spam.
*   Development environment setup is trivial (no SMTP server required to boot the app).

**Negative:**
*   New developers (or AI agents) might mistakenly assume that "dead code" exists in the Output Actions panel and try to "fix" the missing network requests. They must reference this ADR to understand the omission is deliberate.

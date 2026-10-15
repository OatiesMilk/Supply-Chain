# RUN-20261014-02 preflight evidence

Date: 2026-10-14 (Asia/Manila)

## Repository and run selection

- git rev-parse --short HEAD: 2172fc8 (matches the planned baseline).
- git branch --show-current: dev.
- RUN-20261014-02 was free in the execution and artifact folders before this run.
- git status --short showed only ?? quality-assurance/; all run files and tooling are inside the QA package.

## Environment checks

- server/.env exists: yes. No environment-file values were read or recorded.
- HO-004 records the server target as disposable database mg_portal_sandbox, with local seed guards matching.
- Node: v25.2.1; npm: 11.7.0. The project documents Node 20; this version difference is recorded as a deviation.
- Existing development services were reused; no second server or Docker command was started.
- GET http://localhost:4000/api/health before seeding: HTTP 200.
- GET http://localhost:3000/login: HTTP 200.
- Playwright 1.64.1 launched Microsoft Edge 155.0.4283.45 to generate the requested image and PDF fixtures.
- The login screen rendered after client hydration, and the empty email/password form appeared after clicking Sign in with email instead. Microsoft sign-in and Quick Switch were not used.
- Login form screenshots: login-preflight.png and login-email-form.png. No password was entered or captured.

## Seed authorization and result

- HO-004 records user approval to run npm run seed:uat once for RUN-20261014-02 against the disposable database.
- Command: npm run seed:uat.
- Result: completed successfully (exit code 0); run once.
- Seed date (Asia/Manila): 2026-10-14.
- Completed at (Asia/Manila): 2026-10-14 22:01:15 UTC+08.
- GET http://localhost:4000/api/health after seeding: HTTP 200.
- Seed command output was not copied into QA records; no environment values or credentials were recorded.

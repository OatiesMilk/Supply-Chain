# EXISTING SYSTEM ARCHITECTURE ANALYSIS

You are a senior software architect analyzing an existing codebase.

Your job is to understand the CURRENT system. Do not modify any code.

## 1. SYSTEM OVERVIEW

**System:** Microgenesis Supply Chain Portal
**Purpose:** An enterprise-grade, full-stack Supply Chain Management system replacing legacy SharePoint-based trackers. This portal unifies the procurement, logistics, and vendor management lifecycle into a single, centralized source of truth.
**Main users:** Sales Coordinator, Logistics, TASS, Admin, Driver
**Main business processes:** Deliveries, Inventory (Products/SKUs), Purchase Orders, Collections, Actions & Notifications (automated emails)

## 2. TECHNOLOGY STACK

**Frontend:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts
**Backend:** Node.js, Express, TypeScript, Zod (validation)
**Database:** PostgreSQL
**ORM:** Prisma
**Authentication:** Custom JWT sessions (HTTP-only cookies) + optional Microsoft Azure AD SSO
**Cache:** None (VERIFIED)
**External services:** SMTP or Microsoft Graph API (for emails)
**Testing:** None (VERIFIED)
**Deployment:** Render (via `render.yaml`), Docker Compose for local
**CI/CD:** Render (on push)

## 3. ARCHITECTURE STYLE

**Architecture:** Modular Monolith
**Examples:** Monolith, Modular Monolith, Microservices, Serverless, Hybrid

**Explain why:**
The application consists of a single backend Node.js process serving multiple domain boundaries (Deliveries, Inventory, Companies, Auth, Users) from a single relational database. It is combined with a single SPA React frontend. The codebase is organized into modules within the `server/src` and `client/src` directories.

## 4. SYSTEM COMPONENTS

| Component           | Responsibility                                         | Technology                         |
| ------------------- | ------------------------------------------------------ | ---------------------------------- |
| **Frontend SPA**    | Renders UI, handles role-based views, state management | React, Vite, Zustand, React Query  |
| **Backend API**     | Core business logic, data validation, authorization    | Node.js, Express, Zod              |
| **Database**        | Persistent data storage, relational integrity          | PostgreSQL                         |
| **Mailer Service**  | Sends automated notifications and reports              | Nodemailer, MS Graph API           |
| **Background Jobs** | Daily snapshots, 4PM/6PM reminders, weekly reports     | Node.js `setTimeout`/`setInterval` |

## 5. MODULES

```text
System
├── Frontend (Client)
│   ├── auth (Authentication context, login UI)
│   ├── dashboard (Charts and stats)
│   ├── deliveries (DeliveryRecord views and forms)
│   ├── inventory (SKU/Products and transactions)
│   ├── accounting (Collections)
│   ├── admin (User/Driver management, Settings)
│   └── reports (Statistical and operational reports)
└── Backend (Server)
    ├── auth (JWT handling, RBAC)
    ├── records (Deliveries, RMAs, Procurements logic)
    ├── skus (Inventory and Products logic)
    ├── notifications (In-app and email scheduling)
    ├── reports (Data export logic)
    └── users (User and Role management)
```

**Explain the responsibility of each module:**

- **auth:** Handles user login, issues JWT cookies, and provides RBAC middleware to protect routes.
- **records / deliveries:** Manages the core operational entities (Deliveries, RMAs, Sales Orders) using a Single Table Design.
- **skus / inventory:** Tracks products, warehouse locations, and inventory transactions (Goods Receipt, Sale, Adjustment).
- **notifications:** Manages in-app bell notifications and schedules automated emails (e.g., 4PM/6PM reminders, weekly reports).
- **reports / dashboard:** Aggregates data for analytical charts and generates exports (Excel, PDF, Docx).
- **admin / users:** Manages user accounts, permissions, drivers, companies, customers, and suppliers directories.

## 6. REQUEST FLOW

```text
Client (React SPA)
  ↓ HTTP/JSON (with JWT HTTP-only Cookie)
Express Middleware (cors, cookieParser, express.json)
  ↓
Auth Middleware (requireAuth, requireRole)
  ↓
Express Controller (Route Handlers)
  ↓
Zod Validation (Schema parsing)
  ↓
Prisma Client (ORM)
  ↓
PostgreSQL Database
```

## 7. DATABASE ARCHITECTURE

**Database:** PostgreSQL

**Main entities:**

```text
Entity
├── User
├── Company
├── Customer
├── Supplier
├── DeliveryRecord
├── Product
├── InventoryItem
├── InventoryTransaction
├── AuditLog
├── Notification
├── NotificationLog
├── RemarkLog
└── DailyStatusSnapshot
```

**Relationships:**

```text
User 1 ─── * DeliveryRecord (CreatedBy / ModifiedBy)
Company 1 ─── * DeliveryRecord
Product 1 ─── 1 InventoryItem
Product 1 ─── * InventoryTransaction
DeliveryRecord 1 ─── * DeliveryRecord (Linked Deliveries / Collections)
User 1 ─── * Comment
DeliveryRecord 1 ─── * Comment
```

**Important indexes:**

- `DeliveryRecord`: `[deletedAt, category, status]`, `[driver]`, `[deliveryDate]`, `[companyId]`, `[accountManager]`, `[linkedCollectionId]`
- `AuditLog`: `[recordId, recordType, timestamp]`

**Important constraints:**

- `DeliveryRecord` utilizes a **Single Table Design** for `Deliveries`, `RMA`, `Sales Orders`, `Procurement`, and `Accounting`.
- Soft-deletes are used on `DeliveryRecord` and `Product` (`deletedAt`).
- Enums are modeled as plain Strings due to legacy SQLite compatibility, constrained at the application layer.

**Important transactions:**

- INFERRED: Operations such as creating an inventory transaction alongside updating the inventory item balance likely use Prisma `$transaction`.

## 8. API ARCHITECTURE

| Method | Endpoint | Purpose | Authorization |
| ------ | -------- | ------- | ------------- |
| **Auth** | | | |
| POST | `/api/auth/login` | Authenticate user (Email/Password) | None |
| POST | `/api/auth/logout` | Clear session cookie | None |
| GET | `/api/auth/me` | Get current user profile | JWT |
| POST | `/api/auth/microsoft` | Initiate MS SSO | None |
| GET | `/api/auth/microsoft/callback` | MS SSO callback | None |
| GET | `/api/auth/microsoft/status` | Check MS SSO setup | None |
| **Records** | | | |
| GET | `/api/records` | Fetch delivery/operational records | JWT |
| POST | `/api/records` | Create a new record | JWT (SC, LOG) |
| GET | `/api/records/:id` | Fetch record details | JWT |
| PUT | `/api/records/:id` | Edit entire record | JWT (SC, LOG, ADM, DRV, TASS) |
| DELETE | `/api/records/:id` | Soft-delete a record | JWT (SC) |
| PATCH | `/api/records/:id/status` | Update record status | JWT (LOG, ADM, DRV, TASS) |
| PATCH | `/api/records/:id/verify-collection` | TASS collection verification | JWT (TASS) |
| GET | `/api/records/:id/audit` | Fetch record audit log | JWT |
| GET | `/api/records/:id/remarks` | Fetch record remark history | JWT |
| GET | `/api/records/:id/comments` | Fetch record comments | JWT |
| POST | `/api/records/:id/comments` | Add a comment to a record | JWT |
| GET | `/api/records/status-history-counts` | Get status counts over time | JWT |
| **SKUs / Inventory** | | | |
| GET | `/api/skus` | Fetch Inventory/Products list | JWT |
| POST | `/api/skus` | Create a new product SKU | JWT (ADMIN) |
| GET | `/api/skus/:id` | Fetch SKU details | JWT |
| PUT | `/api/skus/:id` | Update SKU | JWT (ADMIN) |
| POST | `/api/skus/:id/adjust` | Manual inventory adjustment | JWT (ADMIN, LOG) |
| GET | `/api/skus/:id/audit` | Fetch SKU audit log | JWT (ADMIN) |
| **Users** | | | |
| GET | `/api/users` | List active users | JWT (ADMIN) |
| POST | `/api/users` | Create a new user | JWT (ADMIN) |
| PATCH | `/api/users/:id` | Update user details/role | JWT (ADMIN) |
| PATCH | `/api/users/:id/activate` | Re-activate user | JWT (ADMIN) |
| PATCH | `/api/users/:id/deactivate` | Deactivate user | JWT (ADMIN) |
| GET | `/api/users/:id/permissions` | Get user UI permissions | JWT (ADMIN) |
| PUT | `/api/users/:id/permissions` | Update user UI permissions | JWT (ADMIN) |
| **Directories** | | | |
| GET | `/api/companies` | List companies | JWT |
| POST | `/api/companies` | Create company | JWT (SC, ADMIN) |
| GET | `/api/customers` | List customers | JWT |
| POST | `/api/customers` | Create customer | JWT (SC, LOG, ADM, DRV) |
| GET | `/api/suppliers` | List suppliers | JWT |
| POST | `/api/suppliers` | Create supplier | JWT (SC, LOG, ADM, DRV) |
| GET | `/api/drivers` | List managed drivers | JWT |
| POST | `/api/drivers` | Create driver | JWT (LOG, ADMIN) |
| PUT/DEL | `/api/drivers/:id` | Update or delete driver | JWT (LOG, ADMIN) |
| **Misc & Admin** | | | |
| GET | `/api/dashboard/stats` | Dashboard aggregated metrics | JWT |
| GET | `/api/reports/summary` | Statistical report summary | JWT (LOG, ADMIN) |
| GET | `/api/reports/daily-status-history`| Daily status snapshots | JWT (LOG, ADMIN) |
| GET | `/api/transactions` | Inventory transactions | JWT |
| GET | `/api/notifications` | User's in-app notifications | JWT |
| PATCH | `/api/notifications/:id/read` | Mark notification read | JWT |
| POST | `/api/notifications/send-email` | Ad-hoc email sending | JWT |
| GET | `/api/admin/audit-log` | System-wide audit log | JWT (ADMIN) |
| POST | `/api/dev/reset-seed` | Demo reset / seed data | JWT (ADMIN) |

*(Note: SC = SALES_COORDINATOR, LOG = LOGISTICS, ADM = ADMIN, DRV = DRIVER, TASS = TASS)*

## 9. AUTHENTICATION & AUTHORIZATION

**Authentication method:**
Custom JWT sessions stored securely in HTTP-only cookies (`mg_session`). Optional Microsoft Azure AD SSO integration.

**Authorization model:**
Role-Based Access Control (RBAC).

**Roles:**
`SALES_COORDINATOR`, `LOGISTICS`, `TASS`, `ADMIN`, `DRIVER`

**Permissions:**
Implemented at the API route level via `requireRole('...')` middleware. Frontend UI elements are conditionally rendered based on the user's role and `UserPermission` configuration.

**Authentication flow:**

```text
User
 ↓
Login (Email/Password or MS SSO)
 ↓
Authentication (Bcrypt comparison)
 ↓
Session/Token (JWT signed and set as HTTP-only cookie)
 ↓
Protected Resource (API endpoints protected by requireAuth)
```

## 10. EXTERNAL SERVICES

| Service      | Purpose                         | Protocol      | Failure Handling                                      |
| ------------ | ------------------------------- | ------------- | ----------------------------------------------------- |
| SMTP Server  | Email delivery (via Nodemailer) | SMTP          | Falls back to mock logging if no credentials provided |
| MS Graph API | Azure Email sending             | HTTPS / OAuth | Falls back to SMTP or mock logging                    |

## 11. INFRASTRUCTURE & DEPLOYMENT

```text
Developer
 ↓ Git Push
GitHub
 ↓ Webhook
Render
 ↓ Build (Vite + tsc) & `prisma migrate deploy`
Node.js Application (Serves API and static Frontend)
 ↓ Read / Write
Render PostgreSQL Database
```

**Hosting:** Render
**Containers:** Docker Compose for local development (`docker-compose.yml`), native Render deployment for Production.
**CI/CD:** Render automatic deployments on repository push.
**Environment management:** `.env` files for local development, Render Environment Variables for production.
**Database hosting:** PostgreSQL (likely managed on Render).

## 12. TESTING

**Unit tests:** None (VERIFIED)
**Integration tests:** None (VERIFIED)
**E2E tests:** None (VERIFIED)
**Test coverage:** 0%
**CI testing:** None

**Important untested areas:**

- All critical business logic.
- API endpoints and Prisma database queries.
- Role-based authorization middleware.
- Scheduled background jobs (e.g., 4PM/6PM notifications).

## 13. SECURITY

**Authentication:** JWT stored in HTTP-only, `sameSite=lax` cookies.
**Authorization:** Backend route protection with `requireRole`.
**Input validation:** Strict schema validation via Zod in API endpoints.
**Rate limiting:** UNKNOWN (No `express-rate-limit` package found).
**CORS:** Configured for Vite dev server locally, disabled in production (frontend and backend served from the same origin).
**CSRF:** Relies on `sameSite=lax` cookies. No explicit CSRF tokens implemented.
**Secrets:** Stored securely in `.env` / Render environment variables. Throws error if `JWT_SECRET` is missing in production.
**SQL injection protection:** Prisma ORM provides protection by parameterizing queries.
**XSS protection:** React naturally escapes variables to prevent basic DOM XSS.
**File upload security:** UNKNOWN (File storage mechanism for `documentAttachment` needs further verification).

**Potential security concerns:**

- No API rate limiting (vulnerable to brute-force attacks).
- The `/api/dev` demo reset endpoint is available in all environments, which could lead to accidental data wiping if accessed maliciously.
- In-memory background jobs may cause race conditions if the app scales to multiple instances.

## 14. ARCHITECTURE RISKS

| Risk                         | Evidence                                                           | Impact                                             | Severity |
| ---------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- | -------- |
| **Demo Reset in Prod**       | `/api/dev` endpoint is active in all environments per comments     | Accidental Data loss                               | High     |
| **Missing Automated Tests**  | No test files (`*.test.ts`, `*.spec.ts`) exist in the codebase     | High risk of regression bugs                       | High     |
| **In-Memory Scheduled Jobs** | `setTimeout`/`setInterval` used in `server/src/index.ts`           | Jobs run multiple times if scaled, lost if crashed | Medium   |
| **Unhandled Exceptions**     | Process exit blocked by handlers, but state might corrupt silently | System instability                                 | Medium   |

## 15. TECHNICAL DEBT

### Code

- Complete lack of automated tests (Unit, Integration, E2E).
- Single-table design (`DeliveryRecord`) could become overly bloated as categories diverge in required fields.

### Architecture

- Background jobs are executed via `setTimeout`/`setInterval` within the main Node.js process, which prevents horizontal scaling of the server without duplicating notifications.

### Database

- Lack of native Postgres ENUMs (uses Strings due to historical SQLite compatibility).

### Security

- No Rate Limiting on authentication endpoints.
- `/api/dev` demo endpoints active in production.

### Testing

- 100% untested codebase.

### Infrastructure

- Background tasks tied to API server instance, requiring a refactor to a worker queue (e.g., BullMQ) or cron scheduler for scalability.

## 16. UNKNOWN / UNVERIFIED

- **Azure AD SSO:** External Microsoft Azure AD SSO authentication flow is referenced in the README and dependencies, but exact implementation flows have not been fully traced.
- **File Attachments:** Storage mechanism for `documentAttachment` (e.g., S3, local disk, database blob) is unknown.

## 17. ARCHITECTURE DIAGRAM

```mermaid
flowchart TD
    User([End User\nSales / Logistics / Admin / Driver])

    subgraph "Supply Chain Portal (Monorepo)"
        Client[React Frontend\nVite + Tailwind + Zustand]

        subgraph "Node.js Express Server"
            Auth[Auth Middleware\nJWT & RBAC]
            Controllers[API Controllers\nZod Validation]
            Jobs[Scheduled Jobs\nDaily/Weekly Notifications]
        end

        DB[(PostgreSQL\nvia Prisma ORM)]
    end

    Email[MS Graph / SMTP\nEmail Service]

    User -->|HTTPS| Client
    Client -->|HTTP / JSON (JWT Cookie)| Auth
    Auth --> Controllers
    Controllers -->|Read / Write| DB
    Jobs -->|Read| DB
    Controllers -->|Send Notifications| Email
    Jobs -->|Send Notifications| Email
```

## 18. SUMMARY

### What the system currently does

The Microgenesis Supply Chain Portal unifies the procurement, logistics, and vendor management lifecycle into a single centralized system. It provides role-based tracking for deliveries, inventory, purchase orders, and collections with automated email notifications.

### Major architectural characteristics

It is a **Modular Monolith** built as a monorepo. It features a React 19 Single Page Application (SPA) on the frontend, and a Node.js/Express REST API on the backend. It uses a single PostgreSQL database via Prisma ORM, leveraging a **Single Table Design** for all operational records.

### Major risks

The codebase has **zero automated testing**, exposing the system to severe regression risks. Additionally, the `/api/dev` reset endpoint is accessible in all environments, posing a high risk of accidental data deletion. Background jobs run in memory, preventing horizontal scaling.

### Important unknowns

The exact mechanism for storing document attachments and the specific flow of the Azure AD SSO integration remain unverified.

## CONFIDENCE

| Area           | Confidence |
| -------------- | ---------- |
| Frontend       | High       |
| Backend        | High       |
| Database       | High       |
| Authentication | High       |
| Infrastructure | Medium     |
| Testing        | High       |

# Microgenesis Supply Chain Portal

An enterprise-grade, full-stack Supply Chain Management system replacing legacy SharePoint-based trackers. This portal unifies the procurement, logistics, and vendor management lifecycle into a single, centralized source of truth.

## Overview

The Supply Chain Portal provides role-based tracking for deliveries, inventory, purchase orders, and collections, minimizing disputes over fulfillment, damaged goods, and payment handoffs. 

### Key Features
- **Centralized Dashboard & Operations:** Unified workspace for Sales, Logistics, and Accounting.
- **Strict Role-Based Access Control (RBAC):** Distinct roles (Admin, Sales Coordinator, Logistics, TASS, Driver) ensure segregation of duties.
- **Inventory & SKU Master:** Real-time visibility into stock levels, allocations, and transaction ledgers.
- **Actionable Dispatch Board:** Mobile-friendly field driver capabilities.
- **Output Actions & Notifications:** Configurable triggers (e.g. Accomplished, Rescheduled) that send automated emails (via SMTP or Microsoft Graph).

## Tech Stack
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Authentication:** Custom JWT sessions + optional Microsoft Azure AD SSO
- **Monorepo:** npm workspaces (\`client/\` and \`server/\`)

## Documentation
- [Getting Started Guide](./docs/GETTING_STARTED.md) - Local setup, database initialization, and usage instructions.
- [Git Cheat Sheet](./docs/git-cheat-sheet.md) - Best practices and workflows for the development team.
- [Project Issues Report](./docs/PROJECT_ISSUES_REPORT.md) - Active audit logs and identified vulnerabilities.
- [Archive](./docs/archive) - Legacy documentation and previous architectural notes.


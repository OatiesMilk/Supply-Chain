# Getting Started

Welcome to the Supply Chain Portal development environment. The project uses **npm workspaces** to manage both the backend (\`server/\`) and the frontend (\`client/\`) together in a seamless development workflow.

## Prerequisites
- Node.js (v18+)
- PostgreSQL database
- Microsoft Authenticator (if testing Azure SSO in production)

---

## 1. Local Setup

From the root directory of the repository:

### Install Dependencies
Install all packages for both the frontend and backend simultaneously:
\`\`\`bash
npm install
\`\`\`

### Environment Configuration
Copy the sample environment file in the server directory and configure your PostgreSQL connection:
\`\`\`bash
cp server/.env.example server/.env
\`\`\`
Edit \`server/.env\` and ensure \`DATABASE_URL\` points to your local PostgreSQL instance, and a random string is provided for \`JWT_SECRET\`.

### Database Initialization & Seeding
We have provided convenient root-level scripts for managing your development database:

\`\`\`bash
npm run db:reset             # Completely wipes the DB, applies schema migrations, and runs the full data seed
npm run seed:accounts        # Exclusively seeds companies, customers, and suppliers (requires an Admin user)
npm run db:clean             # Wipes the DB clean (leaves an empty schema without data)
\`\`\`

*For a first-time setup, simply run \`npm run db:reset\` to get a fully populated environment.*

### Start the Application
Run both the frontend and backend concurrently:
\`\`\`bash
npm run dev
\`\`\`
- **Frontend:** \`http://localhost:3000\`
- **Backend API:** \`http://localhost:4000\`

---

## 2. Access and Login

Once the application is running, open your browser and navigate to \`http://localhost:3000\`.

For local development, you do not need to use the corporate SSO. You can log in using one of the pre-seeded local demo accounts (the password for all is \`password123\`):

- **Admin:** \`admin@microgenesis.com\`
- **Sales Coordinator:** \`sales@microgenesis.com\`
- **Logistics:** \`logistics@microgenesis.com\`
- **TASS / Accounting:** \`tass@microgenesis.com\`

> **Note:** By default, there is no seeded Driver account. An Admin can create Driver logins via the **Admin Panel → Users** menu.

---

## 3. Navigating the Dashboard

Upon logging in, you will land on the **Command Center Dashboard**. The layout is divided into three main areas:

*   **Left Sidebar:** Your main navigation menu containing modules like Deliveries, Inventory, Accounts, and Admin.
*   **Top Bar:** Contains global context, notification alerts, and your profile dropdown.
*   **Main Content Area:** Displays key metrics, widgets, and actionable tasks tailored to your role.

### Inventory Management
The Inventory module allows you to monitor stock levels:
1. Click on **Inventory** in the left sidebar.
2. Search by SKU (e.g., \`UTK-TAB08\`) or Category (e.g., \`Consumables\`).
3. Click a product row to open the **Item Detail View** to see on-hand quantity, historical usage, and transaction ledgers.


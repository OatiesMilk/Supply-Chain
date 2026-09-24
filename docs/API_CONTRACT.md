# System API Contract

This document outlines the detailed API contract for the Microgenesis Supply Chain Portal backend.

All endpoints are prefixed with `/api`. Unless marked otherwise, endpoints require a valid JWT session cookie (`mg_session`). 

---

## 1. Authentication (`/api/auth`)

### `POST /auth/login`
**Purpose:** Authenticate user and issue JWT cookie.
**Method:** POST
**Authorization:** None
**JSON Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```
**JSON Response (200 OK):**
```json
{
  "user": {
    "id": "cuid...",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "SALES_COORDINATOR"
  }
}
```

### `POST /auth/logout`
**Purpose:** Clear the session cookie.
**Method:** POST
**JSON Request:** None
**JSON Response (200 OK):** `{ "ok": true }`

### `GET /auth/me`
**Purpose:** Retrieve the currently authenticated user based on session cookie.
**Method:** GET
**JSON Response (200 OK):** User object matching login response.

---

## 2. Records (`/api/records`)

### `GET /records`
**Purpose:** Fetch operational records (Deliveries, RMA, Procurement, etc). Roles filter the records (e.g. TASS only sees TASS categories, DRIVER only sees assigned records).
**Method:** GET

### `POST /records`
**Purpose:** Create a new operational record.
**Method:** POST
**Authorization:** SALES_COORDINATOR, LOGISTICS
**JSON Request:**
```json
{
  "company_id": "cuid...",
  "category": "DELIVERY",
  "reference": "SO-12345",
  "is_draft": "No",
  "priority": "2 - Moderate",
  "area": "NCR",
  "account_manager": "Jane Doe",
  "delivery_date": "2026-09-24",
  "item_type": "Hardware",
  "date_time": "14:00",
  "item_description": "2x Servers",
  "remarks": "Please call upon arrival"
}
```
**JSON Response (201 Created):** Full record object.

### `PUT /records/:id`
**Purpose:** Update an existing record.
**Method:** PUT
**Authorization:** SC, LOGISTICS, ADMIN, DRIVER, TASS
**JSON Request:** (All fields are optional, requires `remarks` if changing substantive fields)
```json
{
  "driver": "Mark",
  "vehicle": "Van 1",
  "driver_assistants": "[\"Paul\"]",
  "remarks": "Assigned driver and vehicle"
}
```

### `PATCH /records/:id/status`
**Purpose:** Update the status of a record.
**Method:** PATCH
**Authorization:** LOGISTICS, ADMIN, DRIVER, TASS
**JSON Request:**
```json
{
  "status": "Accomplished",
  "remarks": "Delivered successfully",
  "time_out": "15:30",
  "received_by": "Warehouse Manager"
}
```

### `DELETE /records/:id`
**Purpose:** Soft-delete a record.
**Method:** DELETE
**Authorization:** SALES_COORDINATOR

### `POST /records/:id/comments`
**Purpose:** Add a comment/note to a record's timeline.
**Method:** POST
**JSON Request:**
```json
{
  "body": "Customer requested a delay."
}
```

---

## 3. Inventory & SKUs (`/api/skus`)

### `GET /skus`
**Purpose:** List all products/SKUs and their inventory balances.
**Method:** GET

### `POST /skus`
**Purpose:** Create a new product.
**Method:** POST
**Authorization:** ADMIN
**JSON Request:**
```json
{
  "sku_code": "SKU-999",
  "name": "ThinkPad T14",
  "category": "Hardware",
  "unit_cost": 850.00,
  "unit_price": 1200.00,
  "reorder_point": 10,
  "description": "Lenovo laptop",
  "warehouse_location": "A1"
}
```

### `POST /skus/:id/adjust`
**Purpose:** Manually adjust the inventory balance for a product.
**Method:** POST
**Authorization:** ADMIN, LOGISTICS
**JSON Request:**
```json
{
  "type": "Goods Receipt",
  "qty_change": 50,
  "reference": "PO-99221"
}
```

---

## 4. Directories (`/api/companies`, `/api/customers`, `/api/suppliers`, `/api/drivers`)

### `POST /companies`
**Purpose:** Create a new company (Customer/Supplier master list reference).
**Method:** POST
**Authorization:** SALES_COORDINATOR, ADMIN
**JSON Request:**
```json
{
  "name": "Acme Corp",
  "sap_number": "SAP-001",
  "address": "123 Main St",
  "contact_person": "Wile E. Coyote"
}
```
*(Similar endpoints exist for `customers`, `suppliers`, and `drivers`)*

---

## 5. User Management (`/api/users`)

### `GET /users`
**Purpose:** List all active users.
**Method:** GET
**Authorization:** ADMIN

### `POST /users`
**Purpose:** Create a new user.
**Method:** POST
**Authorization:** ADMIN
**JSON Request:**
```json
{
  "name": "New Logistics User",
  "email": "logistics2@example.com",
  "password": "TempPassword123",
  "role": "LOGISTICS"
}
```

### `PUT /users/:id/permissions`
**Purpose:** Update UI screen permissions for a specific user.
**Method:** PUT
**Authorization:** ADMIN
**JSON Request:**
```json
{
  "permissions": {
    "Dashboard": true,
    "Delivery Records": true,
    "Driver Board": false
  }
}
```

---

## 6. Notifications (`/api/notifications`)

### `GET /notifications`
**Purpose:** Get in-app bell notifications for the current user.
**Method:** GET

### `PATCH /notifications/:id/read`
**Purpose:** Mark a specific notification as read.
**Method:** PATCH

### `POST /notifications/send-email`
**Purpose:** Send an ad-hoc email via the mailer service.
**Method:** POST
**JSON Request:**
```json
{
  "to": "user@example.com",
  "subject": "Important Update",
  "text": "Please check the portal."
}
```

---

## 7. Reports & Dashboard (`/api/reports`, `/api/dashboard`)

### `GET /dashboard/stats`
**Purpose:** Get aggregated metrics for dashboard visual charts.
**Method:** GET

### `GET /reports/summary`
**Purpose:** Generate summary statistics for operational exports.
**Method:** GET
**Authorization:** LOGISTICS, ADMIN

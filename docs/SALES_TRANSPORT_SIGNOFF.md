# Sales Coordinator transport sign-off

## Lifecycle

For Delivery, Accounting Collection, Procurement Pick-up and Sales Orders, an
assigned Driver or Logistics (the fallback operator) submits transport proof
with `PATCH /api/v1/records/:id/status` and status `Delivered`. That request
records the server Time Out and recipient, computes Delivery lateness at the
handoff, validates a saved JPG or PNG, and changes the persisted status to
`TRANSPORT_COMPLETE` (`Transport Complete` in the UI). It does not finalize the
record or send the completion email. Active, eligible Sales Coordinators receive
an in-app notification. The request fails without changing the record when no
Sales Coordinator can review that category.

A Sales Coordinator reviews the saved proof, recipient and Time Out, then calls
`PATCH /api/v1/records/:id/complete` with:

```json
{
  "remarks": "Reviewed the delivery proof and recipient.",
  "reviewed_photo_id": "the-attachment-id-reviewed",
  "expected_edit_version": "the-current-record-edit-version"
}
```

The server rechecks the role, category permission, current record version,
recipient, timestamps and exact stored image bytes under the record lock. One
transaction sets the final database status to `ACCOMPLISHED`, records the
Sales Coordinator and sign-off time, retains the reviewed attachment ID and
remarks, and writes the audit and remark entries. The UI displays the final
status as **Complete**. For Accounting Collection, the transaction leaves
collection verification to TASS and sends TASS an in-app notice after sign-off.
The existing TASS verification action remains a separate event. A handoff audit
or in-app notification failure rolls back that handoff. A sign-off audit or
TASS notification failure rolls back the sign-off. Completion email dispatch
happens after commit; an email failure is logged and does not undo a successful
sign-off.

Time In, Time Out and recipient remain separate transport evidence. A record
waiting for Sales cannot be reassigned, reopened, returned to Draft or have
those transport fields corrected through ordinary record editing. The last
valid photo cannot be deleted after handoff; a replacement photo may be added.
The reviewed photo is pinned after sign-off. Existing historical
`ACCOMPLISHED` records remain finalized without new sign-off metadata, and
historical unverified Accounting Collections remain eligible for the existing
TASS collection-verification action. RMA receipt and final completion continue
through the existing TASS-owned flow.

## Admin permission setup

Keep at least one **active** Sales Coordinator eligible for each category that
Drivers or Logistics will hand off. Check the effective permission for each
category before relying on the workflow; a user-level Deny takes precedence
over a role-level Allow.

### LEGACY mode

In Admin Panel → User Management, edit the Sales Coordinator account's Module
Access. The account needs effective access to the category screen for each
queue it should review: Deliveries, Accounting Collection, Procurement Pick-up
and Sales Orders. The role defaults include all four screens; an explicit
screen Deny removes that category from the account. Preserve intentional
denials. LEGACY mode has no separate action-level `RECEIVE` setting; the
server still requires an active Sales Coordinator and the applicable category
screen access.

### V1 mode

Only edit V1 permissions after the coordinated V1 activation and account
conversion are complete. A read-only candidate policy does not control live
authorization. In Admin Panel → Roles & Permissions, edit the Sales Coordinator
role defaults or an individual converted account. For every category to review,
grant `CATEGORY:<category>:RECEIVE` and retain the required Read/Write path:

| Category | Required Receive grant | Screen path |
| --- | --- | --- |
| Delivery | `CATEGORY:DELIVERY:RECEIVE` | `SCREEN:deliveries:READ` and `SCREEN:deliveries:WRITE` |
| Accounting Collection | `CATEGORY:ACCOUNTING_COLLECTION:RECEIVE` | `SCREEN:accounting_collection:READ` and `SCREEN:accounting_collection:WRITE` |
| Procurement Pick-up | `CATEGORY:PROCUREMENT_PICKUP:RECEIVE` | `SCREEN:procurement_pickup:READ` and `SCREEN:procurement_pickup:WRITE` |
| Sales Orders | `CATEGORY:SALES_ORDERS:RECEIVE` | `SCREEN:sales_orders:READ` and `SCREEN:sales_orders:WRITE` |

The account also needs `RESOURCE:records:READ` and category Read and Write for
that category. V1 keeps `RECEIVE` denied by default. A user-level Deny still
blocks a role-level grant. Do not grant RMA Receive to Sales Coordinators;
the role ceiling prevents it. If no eligible approver remains, transport
handoff returns a conflict and leaves the record unchanged.

## Migration

Migration `20261113090000_sales_transport_signoff` adds nullable sign-off
metadata and an index. It does not rewrite historical records. Apply it through
the project's normal migration review and deployment process; do not run it
against a shared database as part of local validation.

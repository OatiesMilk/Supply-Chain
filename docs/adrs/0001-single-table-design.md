# ADR 001: Single Table Design for Operational Records

**Date:** 2026-09-15
**Status:** Accepted

## Context
The Supply Chain Portal needs to track various types of operational records, including Deliveries, RMA (Return Merchandise Authorization), Sales Orders, Procurement Pick-ups, and Accounting Collections. 

Initially, one might assume each of these business entities requires its own dedicated database table due to differing contextual meaning.

## Decision
We will use a **Single Table Design**. All operational records will live in the exact same database table (`DeliveryRecord`), differentiated only by a `category` string field.

## Consequences
**Positive:**
*   **Unified Reporting:** Exporting data, viewing audit trails, and generating status history becomes trivial since all records are queried from a single source.
*   **Simplified Schema:** We avoid writing five separate sets of CRUD endpoints and Prisma schemas.
*   **Easy Expansion:** Adding a new record type (e.g., "Internal Transfer") only requires adding a new `category` enum value, not a database migration.

**Negative:**
*   If future record types require wildly different data fields (e.g., accounting needs 20 unique columns that deliveries don't), the table could suffer from "sparse column" syndrome (many null fields).

## Compliance
AI agents or developers must **never** create a new table (e.g., `RMARecords`) for a new operational category. They must extend the existing `DeliveryRecord` category list.

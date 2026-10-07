# TSK-106: API completion proof and cross-driver access

Scope: UAT C-2.12/C-2.13. The isolated suite exercises the actual JWT/role/access middleware and route handlers, including streamed multipart parsing. It fails closed on unstubbed database and object-storage operations. It does not connect to a database, write real files, send email, or start a listener.

Run from `server/` with installed repository dependencies:

```text
node --import tsx --test tests/podRequirements.test.ts
```

For related driver-directory, permissions and transaction-access regressions:

```text
node --import tsx --test tests/podRequirements.test.ts tests/driverDirectory.test.ts tests/permissions.test.ts tests/transactionAccess.test.ts
```

The two existing HTTP regression suites use temporary loopback listeners and mocked persistence; the POD suite itself uses no listener.

| Criterion | Isolated evidence | Expected result |
| --- | --- | --- |
| C-2.12 missing photo | Assigned delivery with valid persisted ISO Time In, recipient and remarks; repeat Driver/Logistics/Admin | PATCH returns 400 with photo-specific error; no record, history, audit, notification or storage mutation |
| Other prerequisites | Remove only Time In, recipient, or remarks while a genuine stored photo exists | 400 specific to the missing prerequisite, no mutation |
| C-2.13 another driver's record | Driver A targets Driver B through status PATCH, record PUT and attachment POST | 403; no record, attachment, audit, remark, notification or storage write |
| Genuine owner completion | All prerequisites valid, genuine persisted PNG, authenticated owner and permitted staff roles | 200 / Delivered; server ISO Time Out falls within request interval; actor ID retained in audit and remarks |
| Counterfeit image | Empty/text/truncated images and forged PNG/JPEG framing | Rejected; filenames and image MIME types alone cannot satisfy proof |
| Multipart | Real in-memory multipart stream through Multer, valid and invalid bytes | Valid upload 201; invalid image 400 before storage |
| Reassignment interleaving | Simulate assignment changing between initial access check and locked status/edit/upload check | 403; no mutation or storage save |
| Upload compensation | Metadata creation or transaction commit throws after mocked object save | New object key removed; no success response |
| Authentication / RMA | Missing session on status/edit/upload; Logistics attempts RMA writes | 401 / 403 with no mutation |
| Timestamp spoofing / corrections | Client timestamp on completion and non-completion PATCH, Driver PUT, audited Logistics/Admin ISO correction | PATCH ignores client timestamp; completion stamps server time; Driver PUT denied; legitimate staff correction retained |

Production proof validation keeps the MIME/signature/framing checks and then decodes pixels with Sharp `stats()`, `failOn: 'warning'` and a 40-million-input-pixel bound. The existing 10 MB multipart limit remains. Stored files are decoded again at completion; missing, unreadable and corrupted storage objects do not count. Sharp native dependencies are declared in the server workspace and npm lockfile.

Manual UAT, on an approved disposable environment only:

1. Prepare separate Driver A and Driver B sessions with the required module permissions. Prepare a non-draft eligible delivery assigned to B, a valid persisted ISO Time In and recipient, and no photo. Use valid non-blank remarks so the photo guard is the only missing prerequisite.
2. As B, `PATCH /api/records/<id>/status` with `{"status":"Delivered","remarks":"POD verification","received_by":"Named recipient"}`. Expect 400 mentioning a photo. Compare the complete record, attachments, audit/remark rows, notifications and object-store keys before/after.
3. As A, submit that same PATCH; `PUT /api/records/<id>` with a valid edit payload; and `POST /api/records/<id>/attachments` with multipart field `file` containing a genuine PNG. Expect 403 for each with no side effects. Do not omit remarks or use a disallowed field that would confound ownership testing.
4. As B, upload counterfeit `.png` and `.jpg` bytes with matching declared MIME types: expect 400. A PDF/DOC may be a supporting attachment but must not enable completion.
5. As B, upload a genuine PNG/JPG (201), then repeat completion (200). Verify Delivered, server-generated ISO Time Out, recipient, remarks, and authenticated actor audit. Repeat completion prerequisites with Logistics/Admin. Verify Logistics cannot mutate RMA records.

Limitations and follow-up prerequisites:

- These tests simulate transaction interleavings and assert locked rechecks; they do **not** prove PostgreSQL isolation, actual concurrent connections, rollback behavior, or object-store availability. Run concurrency/rollback UAT against disposable PostgreSQL and storage after the prerequisite tickets settle.
- Object storage and PostgreSQL are separate systems. Upload uses a row lock and transactional metadata, with compensating object removal on failure; this is not a distributed atomic transaction. The upload transaction allows up to 30 seconds for remote storage while retaining the ownership lock. A failed cleanup retains the existing recovery log and requires reconciliation.
- Assignment still uses an exact driver/account name string. Stable driver↔user identity, collision/rename handling and its database migration remain a separate prerequisite; this ticket does not claim that migration is complete.
- Draft/future-run rules, the new In Transit lifecycle, canonical server Time In, overdue tracking and client staged uploads remain their own lifecycle/attachment tickets. Re-run this verification after those changes. No schema or production environment changes are made here.

Sharp API references: [pixel statistics](https://sharp.pixelplumbing.com/api-input/#stats), [untrusted-input failure and pixel limits](https://sharp.pixelplumbing.com/api-constructor/).

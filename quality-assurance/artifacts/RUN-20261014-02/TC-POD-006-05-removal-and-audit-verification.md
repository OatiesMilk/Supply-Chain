# TC-POD-006 removal and audit verification

- Role: Sales Coordinator, Maria Reyes.
- Record: D-DEL-07 / `UAT-R02-DEL-07`, record `REC-27816`.
- Before removal: 10 files, as last observed after the Cancel check; the Documents tab showed the 10-file count on resume.
- Selected the first displayed `uat-photo.png` (attachment ID `cmv8c1ze70081wktc7vor2aku`).
- The confirmation dialog stated: “Are you sure you want to remove uat-photo.png? This action cannot be undone and will be permanently recorded in the audit trail.” The user had approved this one removal.
- After selecting Remove, the UI displayed the toast “Attachment removed” and the Documents tab displayed “9 FILES”.
- The Audit Trail showed a new top event: `UPDATE` by Maria Reyes at Oct 15, 2026, 01:07 PM; `Attachment Removed` for attachment `cmv8c1ze70081wktc7vor2aku`; `Attachment uat-photo.png → —`.
- CUA screenshots were captured and displayed in the current QA session for the 10-file list, confirmation dialog, post-removal toast/count and audit entry. The browser security policy rejected the attempted data-URL method for saving those captures as local files and prohibited alternate workarounds. Therefore, no new PNG screenshot files were retained; the earlier confirmation and Cancel screenshots remain available as indexed artifacts.

import { Router } from 'express';
const router = Router();

// TSK-122: no destructive demo/UAT seed operations are exposed over HTTP.
// Retired reset URLs return 404; use guarded, local-only CLI commands instead.
export default router;

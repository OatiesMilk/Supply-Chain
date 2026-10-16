import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Core domain logic imports
import {
  RUN_TRANSITIONS,
  runState,
  allowedStatuses,
  transitionError,
  isValidDateOnly,
  deliveryScheduleState,
  driverDeliveryDateError,
  type RunRecord,
  type RunState,
} from '../../server/src/services/deliveryLifecycle';

import {
  ATTACHMENT_MIME_TYPES,
  attachmentMimeType,
  attachmentQuotaError,
  isPdfDocument,
  isWordDocument,
  MAX_ATTACHMENTS_PER_RECORD,
  MAX_ATTACHMENT_BYTES,
  MAX_RECORD_ATTACHMENT_BYTES,
} from '../../server/src/services/attachmentRules';

import {
  effectiveScreens,
  permissionEditor,
  permissionInputError,
  type Permission,
} from '../../server/src/services/permissions';

import {
  readableCategories,
  recordScope,
  canWriteCategory,
  isAssignedDriver,
} from '../../server/src/services/recordAccess';

import type { AuthUser, Role } from '../../server/src/middleware/auth';

/**
 * ============================================================================
 * PYRAMID BASE LAYER: UNIT TESTS
 * ============================================================================
 * Fast, isolated, deterministic tests of pure business logic and domain rules.
 * Governed by skills: testing-qa, test-guard (Rules 1, 3, 4, 5, 7, 8).
 * Traceability:
 * - TC-DEL-010, TC-DEL-017, TC-DEL-030, TC-DEL-038 (Delivery Lifecycle)
 * - TC-DEL-005, TC-DEL-006, TC-DIR-015, TC-DRV-009 (Date Semantics)
 * - TC-POD-005, TC-POD-006, TC-POD-007 (Attachment & Quota Rules)
 * - TC-ACC-001..017, TC-AUTH-001..013 (Permissions & Access Scoping)
 * ============================================================================
 */

describe('Base Layer: Unit Tests - Delivery Lifecycle & State Transitions', () => {
  // Test Rule 5: Descriptive naming pattern test_<scenario>_<expected_outcome>
  test('test_draft_status_only_transitions_to_scheduled', () => {
    const record: RunRecord = { draft: true, status: 'Draft' };
    assert.equal(runState(record), 'Draft');
    const allowed = allowedStatuses(record);
    assert.deepEqual(allowed, ['Scheduled']);
  });

  test('test_direct_transition_to_in_transit_is_blocked_requiring_time_in_action', () => {
    const record: RunRecord = { draft: false, status: 'SCHEDULED' };
    const err = transitionError(record, 'In Transit', 'LOGISTICS');
    assert.equal(err, 'Use Record Time In to start this run.');
  });

  test('test_delivered_status_is_terminal_and_permits_no_further_transitions', () => {
    const record: RunRecord = { draft: false, status: 'ACCOMPLISHED', timeIn: '2026-10-15T08:00:00.000Z', timeOut: '2026-10-15T09:00:00.000Z' };
    assert.equal(runState(record), 'Delivered');
    const allowed = allowedStatuses(record);
    assert.deepEqual(allowed, []);
  });

  // Test Rule 3: Data-driven parameterized testing for return to draft permissions
  test('test_return_to_draft_role_matrix_enforcement', () => {
    const unstartedRecord: RunRecord = { draft: false, status: 'SCHEDULED' };
    const roles: Array<{ role: Role; allowed: boolean }> = [
      { role: 'SALES_COORDINATOR', allowed: true },
      { role: 'ADMIN', allowed: true },
      { role: 'LOGISTICS', allowed: false },
      { role: 'DRIVER', allowed: false },
      { role: 'TASS', allowed: false },
    ];

    for (const { role, allowed } of roles) {
      const err = transitionError(unstartedRecord, 'Draft', role);
      if (allowed) {
        assert.equal(err, null, `Role ${role} should be allowed to return unstarted run to Draft`);
      } else {
        assert.equal(err, 'Only Sales Coordinator or Admin may return a record to Draft.', `Role ${role} must be denied returning to Draft`);
      }
    }
  });

  test('test_started_run_with_time_in_cannot_be_returned_to_draft', () => {
    const startedRecord: RunRecord = { draft: false, status: 'IN_TRANSIT', timeIn: '2026-10-15T08:30:00.000Z' };
    const err = transitionError(startedRecord, 'Draft', 'SALES_COORDINATOR');
    assert.equal(err, 'A started run cannot be returned to Draft.');
  });
});

describe('Base Layer: Unit Tests - Delivery Date & Driver Schedule Constraints', () => {
  // Test Rule 3: Data-driven date validation tests
  test('test_date_format_validator_accepts_valid_calendar_dates_and_rejects_malformed', () => {
    const validDates = ['2026-10-15', '2026-02-28', '2024-02-29', '2026-12-31'];
    const invalidDates = ['2026-02-30', '15-10-2026', '2026/10/15', 'invalid', '', null, undefined, 12345];

    for (const date of validDates) {
      assert.ok(isValidDateOnly(date), `Date ${date} should be recognized as valid`);
    }
    for (const date of invalidDates) {
      assert.ok(!isValidDateOnly(date), `Date ${date} should be recognized as invalid`);
    }
  });

  test('test_delivery_schedule_state_calculates_overdue_and_future_accurately', () => {
    // Reference day: 2026-10-15
    const now = new Date('2026-10-15T12:00:00+08:00');

    const todayState = deliveryScheduleState('2026-10-15', now);
    assert.equal(todayState.valid, true);
    assert.equal(todayState.future, false);
    assert.equal(todayState.overdue, false);
    assert.equal(todayState.daysLate, 0);

    const futureState = deliveryScheduleState('2026-10-20', now);
    assert.equal(futureState.valid, true);
    assert.equal(futureState.future, true);
    assert.equal(futureState.overdue, false);

    const overdueState = deliveryScheduleState('2026-10-12', now);
    assert.equal(overdueState.valid, true);
    assert.equal(overdueState.future, false);
    assert.equal(overdueState.overdue, true);
    assert.equal(overdueState.daysLate, 3);
  });

  test('test_driver_delivery_date_error_blocks_actions_on_future_and_invalid_dates', () => {
    const now = new Date('2026-10-15T12:00:00+08:00');
    const futureRecord: RunRecord = { category: 'DELIVERY', draft: false, deliveryDate: '2026-10-16', status: 'SCHEDULED' };
    const invalidRecord: RunRecord = { category: 'DELIVERY', draft: false, deliveryDate: 'invalid-date', status: 'SCHEDULED' };
    const todayRecord: RunRecord = { category: 'DELIVERY', draft: false, deliveryDate: '2026-10-15', status: 'SCHEDULED' };

    const futureErr = driverDeliveryDateError(futureRecord, 'DRIVER', now);
    assert.equal(futureErr, 'This delivery is scheduled for a future date and is read-only until that date.');

    const invalidErr = driverDeliveryDateError(invalidRecord, 'DRIVER', now);
    assert.equal(invalidErr, 'This delivery has no valid Delivery Date. Contact Logistics before taking action.');

    const todayErr = driverDeliveryDateError(todayRecord, 'DRIVER', now);
    assert.equal(todayErr, null);
  });
});

describe('Base Layer: Unit Tests - Attachment Policies & Magic Byte Verification', () => {
  // Test Rule 3: Data-driven MIME type mapping
  test('test_mime_type_resolution_matches_allowed_extensions_and_rejects_unauthorized', () => {
    const allowed = [
      { file: 'receipt.pdf', mime: 'application/pdf' },
      { file: 'photo.jpg', mime: 'image/jpeg' },
      { file: 'PHOTO.JPEG', mime: 'image/jpeg' },
      { file: 'proof.png', mime: 'image/png' },
      { file: 'manifest.doc', mime: 'application/msword' },
      { file: 'invoice.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    ];
    for (const item of allowed) {
      assert.equal(attachmentMimeType(item.file), item.mime);
    }

    const rejected = ['script.js', 'virus.exe', 'shell.sh', 'data.bin', 'page.html', 'file'];
    for (const file of rejected) {
      assert.equal(attachmentMimeType(file), undefined);
    }
  });

  test('test_attachment_quota_error_enforces_max_count_and_cumulative_size_limits', () => {
    // Limits: MAX_ATTACHMENTS_PER_RECORD = 10, MAX_RECORD_ATTACHMENT_BYTES = 50 MB
    assert.equal(attachmentQuotaError(9, 10 * 1024 * 1024, 1 * 1024 * 1024), null);

    // Over count limit
    const countErr = attachmentQuotaError(10, 10 * 1024 * 1024, 1 * 1024 * 1024);
    assert.ok(countErr?.includes('already has 10 attachments'));

    // Over size limit
    const sizeErr = attachmentQuotaError(5, 48 * 1024 * 1024, 3 * 1024 * 1024);
    assert.ok(sizeErr?.includes('attachment limit'));
  });

  test('test_is_pdf_document_verifies_magic_header_and_end_of_file_marker', () => {
    const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<<>>\nstartxref\n99\n%%EOF\n');
    assert.ok(isPdfDocument(validPdf));

    const corruptedHeader = Buffer.from('NOT-PDF\nstartxref\n99\n%%EOF');
    assert.ok(!isPdfDocument(corruptedHeader));

    const missingEof = Buffer.from('%PDF-1.7\ncontent without proper eof marker');
    assert.ok(!isPdfDocument(missingEof));
  });
});

describe('Base Layer: Unit Tests - Role Permissions & Access Control Scoping', () => {
  // Test Rule 8: State objects are real, never mocked
  const createTestUser = (role: Role, permissions: Permission[] = [], driverProfileId: string | null = null): AuthUser => ({
    id: `user-${role.toLowerCase()}`,
    name: `Test ${role}`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    permissions,
    effectiveScreens: [],
    resources: [],
    permissionVersion: '1.0',
    driverProfileId,
  });

  test('test_effective_screens_respects_role_defaults_and_locks_admin_screens', () => {
    // Logistics default screens: deliveries, driver, calendar, reports, etc.
    const logUser = createTestUser('LOGISTICS');
    const logScreens = effectiveScreens('LOGISTICS', []);
    assert.ok(logScreens.includes('deliveries'));
    assert.ok(logScreens.includes('driver'));
    assert.ok(logScreens.includes('calendar'));
    assert.ok(!logScreens.includes('admin'), 'Logistics must not have Admin Panel by default');

    // Attempting to grant admin to Logistics via override must be refused by security policy
    const forbiddenOverrideScreens = effectiveScreens('LOGISTICS', [{ screen: 'admin', granted: true }]);
    assert.ok(!forbiddenOverrideScreens.includes('admin'), 'Admin screen can never be granted via override to Logistics');

    // Admin role always has admin screen
    const adminScreens = effectiveScreens('ADMIN', [{ screen: 'admin', granted: false }]);
    assert.ok(adminScreens.includes('admin'), 'Admin screen cannot be removed from Admin role');
  });

  test('test_readable_categories_restricts_tass_to_rma_and_accounting_collection_only', () => {
    const tassUser = createTestUser('TASS');
    tassUser.effectiveScreens = effectiveScreens('TASS', []);
    const categories = readableCategories(tassUser);

    assert.ok(categories.includes('RMA'));
    assert.ok(categories.includes('ACCOUNTING_COLLECTION'));
    assert.ok(!categories.includes('DELIVERY'), 'TASS must never have access to Delivery category');
    assert.ok(!categories.includes('PROCUREMENT_PICKUP'), 'TASS must never have access to Procurement category');
    assert.ok(!categories.includes('SALES_ORDERS'), 'TASS must never have access to Sales Orders category');
  });

  test('test_driver_scope_is_strictly_bound_to_linked_driver_profile_and_excludes_drafts', () => {
    const linkedDriver = createTestUser('DRIVER', [], 'drv-profile-001');
    linkedDriver.effectiveScreens = ['driver_dashboard'];
    const linkedScope = recordScope(linkedDriver);

    assert.equal(linkedScope.driverId, 'drv-profile-001');
    assert.equal(linkedScope.draft, false);

    // Unlinked driver owns nothing
    const unlinkedDriver = createTestUser('DRIVER', [], null);
    unlinkedDriver.effectiveScreens = ['driver_dashboard'];
    const unlinkedScope = recordScope(unlinkedDriver);

    assert.deepEqual(unlinkedScope.id, { in: [] }, 'Unlinked driver must match empty record set');
  });

  test('test_can_write_category_enforces_category_authorization_boundaries', () => {
    const logUser = createTestUser('LOGISTICS');
    logUser.effectiveScreens = effectiveScreens('LOGISTICS', []);

    // Logistics can write deliveries, but never RMA
    assert.ok(canWriteCategory(logUser, 'DELIVERY'));
    assert.ok(!canWriteCategory(logUser, 'RMA'), 'Logistics must not be allowed to write RMA records');

    const scUser = createTestUser('SALES_COORDINATOR');
    scUser.effectiveScreens = effectiveScreens('SALES_COORDINATOR', []);
    assert.ok(canWriteCategory(scUser, 'DELIVERY'));
    assert.ok(canWriteCategory(scUser, 'RMA'));
  });

  test('test_permission_input_error_detects_malformed_and_duplicate_screen_inputs', () => {
    assert.ok(permissionInputError(null));
    assert.ok(permissionInputError({}));
    assert.ok(permissionInputError([{ screen: 'unknown_screen', granted: true }]));
    assert.ok(permissionInputError([{ screen: 'deliveries', granted: false }, { screen: 'deliveries', granted: true }])); // duplicate
    assert.equal(permissionInputError([{ screen: 'deliveries', granted: false }, { screen: 'calendar', granted: true }]), null);
  });
});

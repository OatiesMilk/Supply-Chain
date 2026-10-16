import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RUN_TRANSITIONS,
  runState,
  allowedStatuses,
  transitionError,
  type RunRecord,
  type RunState,
} from '../../../server/src/services/deliveryLifecycle';
import type { Role } from '../../../server/src/middleware/auth';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 1 (UNIT TESTS)
 * Domain Module: Delivery Lifecycle & Status Transitions
 * QA Reference: TC-DEL-010, TC-DEL-017, TC-DEL-030, TC-DEL-038
 * ============================================================================
 */

describe('Layer 1 (Unit): Delivery Lifecycle & Status Transitions', () => {
  test('test_draft_status_only_transitions_to_scheduled', () => {
    const draftRecord: RunRecord = { draft: true, status: 'Draft' };
    assert.equal(runState(draftRecord), 'Draft');
    assert.deepEqual(allowedStatuses(draftRecord), ['Scheduled']);
  });

  test('test_scheduled_status_transitions_to_on_hold_rescheduled_or_draft', () => {
    const scheduledRecord: RunRecord = { draft: false, status: 'SCHEDULED' };
    assert.equal(runState(scheduledRecord), 'Scheduled');
    const allowed = allowedStatuses(scheduledRecord);
    assert.ok(allowed.includes('On-Hold'));
    assert.ok(allowed.includes('Rescheduled'));
    assert.ok(allowed.includes('Draft'));
  });

  test('test_direct_transition_to_in_transit_is_blocked_requiring_time_in_action', () => {
    const scheduledRecord: RunRecord = { draft: false, status: 'SCHEDULED' };
    const err = transitionError(scheduledRecord, 'In Transit', 'LOGISTICS');
    assert.equal(err, 'Use Record Time In to start this run.');
  });

  test('test_delivered_status_is_terminal_and_locks_all_further_transitions', () => {
    const deliveredRecord: RunRecord = {
      draft: false,
      status: 'ACCOMPLISHED',
      timeIn: '2026-10-15T08:00:00.000Z',
      timeOut: '2026-10-15T09:00:00.000Z',
    };
    assert.equal(runState(deliveredRecord), 'Delivered');
    assert.deepEqual(allowedStatuses(deliveredRecord), []);
  });

  test('test_return_to_draft_role_matrix_permits_sc_and_admin_only', () => {
    const unstartedRecord: RunRecord = { draft: false, status: 'SCHEDULED' };
    const matrix: Array<{ role: Role; allowed: boolean }> = [
      { role: 'SALES_COORDINATOR', allowed: true },
      { role: 'ADMIN', allowed: true },
      { role: 'LOGISTICS', allowed: false },
      { role: 'DRIVER', allowed: false },
      { role: 'TASS', allowed: false },
    ];

    for (const { role, allowed } of matrix) {
      const err = transitionError(unstartedRecord, 'Draft', role);
      if (allowed) {
        assert.equal(err, null, `Role ${role} should be permitted to return unstarted run to Draft`);
      } else {
        assert.equal(err, 'Only Sales Coordinator or Admin may return a record to Draft.', `Role ${role} must be refused`);
      }
    }
  });

  test('test_started_run_with_time_in_cannot_be_returned_to_draft_by_any_role', () => {
    const startedRecord: RunRecord = { draft: false, status: 'IN_TRANSIT', timeIn: '2026-10-15T08:30:00.000Z' };
    assert.equal(transitionError(startedRecord, 'Draft', 'SALES_COORDINATOR'), 'A started run cannot be returned to Draft.');
    assert.equal(transitionError(startedRecord, 'Draft', 'ADMIN'), 'A started run cannot be returned to Draft.');
  });
});

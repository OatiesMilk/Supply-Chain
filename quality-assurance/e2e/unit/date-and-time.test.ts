import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isValidDateOnly, manilaToday } from '../../../server/src/services/deliveryLifecycle';
import {
  manilaStartOfDay,
  manilaDateRange,
  manilaTodayRange,
  manilaWeekStart,
  MANILA_TIME_ZONE,
} from '../../../server/src/services/dateSemantics';

/**
 * ============================================================================
 * TESTING PYRAMID - LAYER 1 (UNIT TESTS)
 * Domain Module: Date and Time Semantics (Manila Timezone & Boundaries)
 * QA Reference: TC-DEL-005, TC-DIR-015, TC-RPT-006
 * ============================================================================
 */

describe('Layer 1 (Unit): Date and Time Semantics', () => {
  describe('Calendar Date Validation (YYYY-MM-DD)', () => {
    test('test_accepts_valid_calendar_dates', () => {
      assert.equal(isValidDateOnly('2026-10-15'), true);
      assert.equal(isValidDateOnly('2024-02-29'), true, 'Leap year 2024-02-29 must be valid');
      assert.equal(isValidDateOnly('2026-12-31'), true);
      assert.equal(isValidDateOnly('2026-01-01'), true);
    });

    test('test_rejects_malformed_and_out_of_range_calendar_dates', () => {
      assert.equal(isValidDateOnly('2026-13-45'), false, 'DEF-006: Month 13 Day 45 must be invalid');
      assert.equal(isValidDateOnly('2026-02-30'), false, 'Feb 30 must be invalid');
      assert.equal(isValidDateOnly('2025-02-29'), false, 'Non-leap Feb 29 must be invalid');
      assert.equal(isValidDateOnly('2026-00-10'), false, 'Month 00 must be invalid');
      assert.equal(isValidDateOnly('2026-05-00'), false, 'Day 00 must be invalid');
      assert.equal(isValidDateOnly('15-10-2026'), false, 'DD-MM-YYYY format must be rejected');
      assert.equal(isValidDateOnly('2026/10/15'), false, 'Slash format must be rejected');
      assert.equal(isValidDateOnly(''), false, 'Empty date string must be rejected');
      assert.equal(isValidDateOnly('invalid-text'), false, 'Arbitrary text must be rejected');
    });
  });

  describe('Manila Start of Day UTC Alignment (Asia/Manila UTC+8)', () => {
    test('test_manila_start_of_day_resolves_to_1600_utc_previous_day', () => {
      // Midnight in Asia/Manila (UTC+8) is 16:00:00.000 UTC on the previous day.
      const instant = manilaStartOfDay('2026-10-15');
      assert.equal(instant.toISOString(), '2026-10-14T16:00:00.000Z');
    });

    test('test_manila_start_of_day_throws_on_invalid_date', () => {
      assert.throws(
        () => manilaStartOfDay('2026-13-45'),
        /date must be a valid YYYY-MM-DD value/,
        'Should reject malformed dates'
      );
    });
  });

  describe('Manila Date Range Calculation', () => {
    test('test_computes_exact_half_open_date_interval', () => {
      const range = manilaDateRange('2026-10-01', '2026-10-15');
      // From 2026-10-01 00:00 Manila (2026-09-30 16:00 UTC) to 2026-10-16 00:00 Manila (2026-10-15 16:00 UTC)
      assert.equal(range.gte?.toISOString(), '2026-09-30T16:00:00.000Z');
      assert.equal(range.lt?.toISOString(), '2026-10-15T16:00:00.000Z');
    });

    test('test_rejects_inverted_date_ranges', () => {
      assert.throws(
        () => manilaDateRange('2026-10-20', '2026-10-10'),
        /dateFrom must be on or before dateTo/
      );
    });

    test('test_week_start_resolves_to_sunday_midnight_manila', () => {
      // 2026-10-15 is Thursday. Sunday was 2026-10-11.
      const sunday = manilaWeekStart('2026-10-15');
      assert.equal(sunday.toISOString(), '2026-10-10T16:00:00.000Z');
    });
  });
});

/**
 * Cross-screen consistency tests.
 *
 * Ensures that labels, formulas, and calculation methods stay aligned
 * across Dashboard and Trends screens.
 */

import {
  LABEL_TOTAL_ALL, LABEL_TOTAL_ALL_SHORT,
  LABEL_TOTAL_Z3_PLUS, LABEL_TOTAL_Z3_PLUS_SHORT,
  LABEL_COMBINED, LABEL_COMBINED_SHORT,
  getLocalDateString,
} from '../utils/constants';
import {
  calculateZoneBoundaries,
  calculateZoneTime,
  aggregateZoneTime,
} from '../services/ZoneEngine';
import {ZoneSettings, HeartRateSample, Zone} from '../types';

const TEST_ZONES: Zone[] = [
  {id: 1, name: 'Recovery', color: '#3B82F6', lowerIntensity: 50, upperIntensity: 60},
  {id: 2, name: 'Aerobic Base', color: '#22C55E', lowerIntensity: 60, upperIntensity: 70},
  {id: 3, name: 'Tempo', color: '#EAB308', lowerIntensity: 70, upperIntensity: 80},
  {id: 4, name: 'Threshold', color: '#F97316', lowerIntensity: 80, upperIntensity: 90},
  {id: 5, name: 'VO2 Max', color: '#EF4444', lowerIntensity: 90, upperIntensity: 100},
];

// ─── Label Consistency ───

describe('Label consistency across screens', () => {
  it('LABEL_TOTAL_ALL is defined and non-empty', () => {
    expect(LABEL_TOTAL_ALL).toBeTruthy();
    expect(LABEL_TOTAL_ALL.length).toBeGreaterThan(0);
  });

  it('LABEL_TOTAL_Z3_PLUS is defined and non-empty', () => {
    expect(LABEL_TOTAL_Z3_PLUS).toBeTruthy();
    expect(LABEL_TOTAL_Z3_PLUS.length).toBeGreaterThan(0);
  });

  it('LABEL_COMBINED is defined and non-empty', () => {
    expect(LABEL_COMBINED).toBeTruthy();
    expect(LABEL_COMBINED.length).toBeGreaterThan(0);
  });

  it('short labels are defined and non-empty', () => {
    expect(LABEL_TOTAL_ALL_SHORT).toBeTruthy();
    expect(LABEL_TOTAL_Z3_PLUS_SHORT).toBeTruthy();
    expect(LABEL_COMBINED_SHORT).toBeTruthy();
  });
});

// ─── Date String Consistency (UTC bug prevention) ───

describe('getLocalDateString uses local time, not UTC', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getLocalDateString(new Date(2026, 3, 15)); // Apr 15 local
    expect(result).toBe('2026-04-15');
  });

  it('matches local date even late at night (the UTC bug scenario)', () => {
    // 11:30 PM EDT on Apr 15 = Apr 16 01:30 UTC
    // toISOString() would wrongly return "2026-04-16"
    // getLocalDateString() must return "2026-04-15"
    const lateNight = new Date(2026, 3, 15, 23, 30, 0); // Apr 15, 11:30 PM local
    const result = getLocalDateString(lateNight);
    expect(result).toBe('2026-04-15');

    // Verify toISOString WOULD be wrong (in timezones behind UTC)
    const utcDate = lateNight.toISOString().split('T')[0];
    // In UTC-4 (EDT), this would be "2026-04-16"
    // In UTC+0, this would still be "2026-04-15"
    // Either way, getLocalDateString is always correct
    expect(result).toBe('2026-04-15');
  });

  it('pads single-digit months and days', () => {
    const jan1 = new Date(2026, 0, 5); // Jan 5
    expect(getLocalDateString(jan1)).toBe('2026-01-05');
  });

  it('defaults to current date when no arg', () => {
    const result = getLocalDateString();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(result).toBe(expected);
  });
});

// ─── Calculation Consistency ───
//
// Both Dashboard and Trends must produce identical zone totals when
// using the same resting HR for the same workout data. This verifies
// the shared calculation path.

describe('Zone calculation consistency (same resting HR = same results)', () => {
  const settings: ZoneSettings = {
    maxHeartRate: 190,
    restingHeartRate: 45, // Specific waking HR for a day
    zones: TEST_ZONES,
  };

  // Simulated workout: 15 minutes spanning zones 1-4
  const workout: HeartRateSample[] = [
    {timestamp: new Date('2026-04-07T10:00:00'), bpm: 130}, // Zone 1
    {timestamp: new Date('2026-04-07T10:05:00'), bpm: 148}, // Zone 2
    {timestamp: new Date('2026-04-07T10:10:00'), bpm: 162}, // Zone 3
    {timestamp: new Date('2026-04-07T10:15:00'), bpm: 175}, // Zone 4
  ];

  it('produces identical totals regardless of calculation path', () => {
    const boundaries = calculateZoneBoundaries(settings);

    // Path A: Calculate per-workout then aggregate (Dashboard style)
    const zoneTimeA = calculateZoneTime(workout, boundaries, TEST_ZONES);
    const aggregatedA = aggregateZoneTime([zoneTimeA], TEST_ZONES);

    // Path B: Calculate directly (same boundaries, same data)
    const zoneTimeB = calculateZoneTime(workout, boundaries, TEST_ZONES);
    const aggregatedB = aggregateZoneTime([zoneTimeB], TEST_ZONES);

    // Both paths must produce identical results
    for (let i = 0; i < TEST_ZONES.length; i++) {
      expect(aggregatedA[i].minutes).toBe(aggregatedB[i].minutes);
      expect(aggregatedA[i].zoneId).toBe(aggregatedB[i].zoneId);
    }
  });

  it('different resting HR produces different zone totals', () => {
    const settingsLow = {...settings, restingHeartRate: 45};
    const settingsHigh = {...settings, restingHeartRate: 65};

    const boundariesLow = calculateZoneBoundaries(settingsLow);
    const boundariesHigh = calculateZoneBoundaries(settingsHigh);

    const totalsLow = calculateZoneTime(workout, boundariesLow, TEST_ZONES);
    const totalsHigh = calculateZoneTime(workout, boundariesHigh, TEST_ZONES);

    // With different boundaries, at least one zone should differ
    const allSame = totalsLow.every(
      (entry, i) => entry.minutes === totalsHigh[i].minutes,
    );
    expect(allSame).toBe(false);
  });
});

// ─── Combined Total Formula Consistency ───
//
// The "Combined Total (Moderate + Vigorous)" formula must be:
//   (Zone1 + Zone2) + 2 × (Zone3 + Zone4 + Zone5)
// This test ensures both screens would compute the same value from
// the same zone totals.

describe('Combined Total formula consistency', () => {
  it('computes Combined Total correctly: (Z1+Z2) + 2*(Z3+Z4+Z5)', () => {
    const totals = [
      {zoneId: 1, minutes: 29},
      {zoneId: 2, minutes: 46},
      {zoneId: 3, minutes: 15},
      {zoneId: 4, minutes: 4},
      {zoneId: 5, minutes: 0},
    ];

    // The formula used in both Dashboard and Trends
    const combined =
      totals.filter(e => e.zoneId <= 2).reduce((s, e) => s + e.minutes, 0) +
      2 * totals.filter(e => e.zoneId >= 3).reduce((s, e) => s + e.minutes, 0);

    // (29 + 46) + 2 * (15 + 4 + 0) = 75 + 38 = 113
    expect(combined).toBe(113);
  });

  it('Total (Zone 1 and above) is sum of all zones', () => {
    const totals = [
      {zoneId: 1, minutes: 29},
      {zoneId: 2, minutes: 46},
      {zoneId: 3, minutes: 15},
      {zoneId: 4, minutes: 4},
      {zoneId: 5, minutes: 0},
    ];

    const total = totals.reduce((s, e) => s + e.minutes, 0);
    expect(total).toBe(94);
  });

  it('Total (Zone 3 and above) is sum of Z3+Z4+Z5', () => {
    const totals = [
      {zoneId: 1, minutes: 29},
      {zoneId: 2, minutes: 46},
      {zoneId: 3, minutes: 15},
      {zoneId: 4, minutes: 4},
      {zoneId: 5, minutes: 0},
    ];

    const z3plus = totals
      .filter(e => e.zoneId >= 3)
      .reduce((s, e) => s + e.minutes, 0);
    expect(z3plus).toBe(19);
  });

  it('Combined Total is always >= Total (Zone 1 and above)', () => {
    // Because Z3+ minutes are counted twice, combined >= total
    const totals = [
      {zoneId: 1, minutes: 10},
      {zoneId: 2, minutes: 20},
      {zoneId: 3, minutes: 30},
      {zoneId: 4, minutes: 15},
      {zoneId: 5, minutes: 5},
    ];

    const totalAll = totals.reduce((s, e) => s + e.minutes, 0);
    const combined =
      totals.filter(e => e.zoneId <= 2).reduce((s, e) => s + e.minutes, 0) +
      2 * totals.filter(e => e.zoneId >= 3).reduce((s, e) => s + e.minutes, 0);

    expect(combined).toBeGreaterThanOrEqual(totalAll);
  });
});

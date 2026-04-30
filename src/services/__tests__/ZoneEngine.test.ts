import {
  calculateHRR,
  calculateTHR,
  calculateZoneBoundaries,
  classifyHeartRate,
  calculateZoneTime,
  aggregateZoneTime,
  getWeekStart,
  getWeekEnd,
  formatWeekRange,
} from '../ZoneEngine';
import {Zone, ZoneSettings, ZoneBoundary, HeartRateSample} from '../../types';

// Standard test zones matching the app defaults
const TEST_ZONES: Zone[] = [
  {id: 1, name: 'Recovery', color: '#3B82F6', lowerIntensity: 50, upperIntensity: 60},
  {id: 2, name: 'Aerobic Base', color: '#22C55E', lowerIntensity: 60, upperIntensity: 70},
  {id: 3, name: 'Tempo', color: '#EAB308', lowerIntensity: 70, upperIntensity: 80},
  {id: 4, name: 'Threshold', color: '#F97316', lowerIntensity: 80, upperIntensity: 90},
  {id: 5, name: 'VO2 Max', color: '#EF4444', lowerIntensity: 90, upperIntensity: 100},
];

const TEST_SETTINGS: ZoneSettings = {
  maxHeartRate: 190,
  restingHeartRate: 60,
  zones: TEST_ZONES,
};

describe('ZoneEngine', () => {
  // ─── Karvonen Formula ───

  describe('calculateHRR', () => {
    it('calculates heart rate reserve correctly', () => {
      expect(calculateHRR(190, 60)).toBe(130);
    });

    it('handles edge case with equal values', () => {
      expect(calculateHRR(60, 60)).toBe(0);
    });

    it('handles high max and low resting', () => {
      expect(calculateHRR(220, 40)).toBe(180);
    });
  });

  describe('calculateTHR', () => {
    // With maxHR=190, restingHR=60: HRR=130
    const hrr = 130;
    const restingHR = 60;

    it('calculates Zone 1 lower bound (50%)', () => {
      // THR = 60 + (50/100) * 130 = 60 + 65 = 125
      expect(calculateTHR(restingHR, hrr, 50)).toBe(125);
    });

    it('calculates Zone 1 upper bound (60%)', () => {
      // THR = 60 + (60/100) * 130 = 60 + 78 = 138
      expect(calculateTHR(restingHR, hrr, 60)).toBe(138);
    });

    it('calculates Zone 5 upper bound (100%)', () => {
      // THR = 60 + (100/100) * 130 = 60 + 130 = 190 (maxHR)
      expect(calculateTHR(restingHR, hrr, 100)).toBe(190);
    });

    it('calculates 0% intensity as resting HR', () => {
      expect(calculateTHR(restingHR, hrr, 0)).toBe(60);
    });

    it('rounds to nearest integer', () => {
      // THR = 60 + (55/100) * 130 = 60 + 71.5 = 131.5 → 132
      expect(calculateTHR(restingHR, hrr, 55)).toBe(132);
    });
  });

  describe('calculateZoneBoundaries', () => {
    it('returns correct number of boundaries', () => {
      const boundaries = calculateZoneBoundaries(TEST_SETTINGS);
      expect(boundaries).toHaveLength(5);
    });

    it('calculates correct boundaries for default settings', () => {
      const boundaries = calculateZoneBoundaries(TEST_SETTINGS);
      // HRR = 190 - 60 = 130

      expect(boundaries[0]).toEqual({zoneId: 1, lowerTHR: 125, upperTHR: 138});
      expect(boundaries[1]).toEqual({zoneId: 2, lowerTHR: 138, upperTHR: 151});
      expect(boundaries[2]).toEqual({zoneId: 3, lowerTHR: 151, upperTHR: 164});
      expect(boundaries[3]).toEqual({zoneId: 4, lowerTHR: 164, upperTHR: 177});
      expect(boundaries[4]).toEqual({zoneId: 5, lowerTHR: 177, upperTHR: 190});
    });

    it('zones are contiguous (upper of zone N = lower of zone N+1)', () => {
      const boundaries = calculateZoneBoundaries(TEST_SETTINGS);
      for (let i = 0; i < boundaries.length - 1; i++) {
        expect(boundaries[i].upperTHR).toBe(boundaries[i + 1].lowerTHR);
      }
    });

    it('adapts when resting HR changes', () => {
      const lowRestingSettings = {...TEST_SETTINGS, restingHeartRate: 45};
      const highRestingSettings = {...TEST_SETTINGS, restingHeartRate: 75};

      const lowBoundaries = calculateZoneBoundaries(lowRestingSettings);
      const highBoundaries = calculateZoneBoundaries(highRestingSettings);

      // Higher resting HR → narrower zones (smaller HRR)
      const lowZone1Range = lowBoundaries[0].upperTHR - lowBoundaries[0].lowerTHR;
      const highZone1Range = highBoundaries[0].upperTHR - highBoundaries[0].lowerTHR;
      expect(lowZone1Range).toBeGreaterThan(highZone1Range);
    });
  });

  // ─── Heart Rate Classification ───

  describe('classifyHeartRate', () => {
    const boundaries = calculateZoneBoundaries(TEST_SETTINGS);

    it('classifies heart rate below all zones as 0', () => {
      expect(classifyHeartRate(100, boundaries)).toBe(0);
      expect(classifyHeartRate(124, boundaries)).toBe(0);
    });

    it('classifies heart rate at Zone 1 lower bound', () => {
      expect(classifyHeartRate(125, boundaries)).toBe(1);
    });

    it('classifies heart rate in Zone 2', () => {
      expect(classifyHeartRate(140, boundaries)).toBe(2);
    });

    it('classifies heart rate in Zone 3', () => {
      expect(classifyHeartRate(155, boundaries)).toBe(3);
    });

    it('classifies heart rate in Zone 4', () => {
      expect(classifyHeartRate(170, boundaries)).toBe(4);
    });

    it('classifies heart rate in Zone 5', () => {
      expect(classifyHeartRate(180, boundaries)).toBe(5);
    });

    it('classifies heart rate at max HR in Zone 5', () => {
      expect(classifyHeartRate(190, boundaries)).toBe(5);
    });

    it('classifies heart rate above max HR in Zone 5', () => {
      expect(classifyHeartRate(200, boundaries)).toBe(5);
    });
  });

  // ─── Zone Time Calculation ───

  describe('calculateZoneTime', () => {
    const boundaries = calculateZoneBoundaries(TEST_SETTINGS);

    it('returns zero minutes for empty samples', () => {
      const result = calculateZoneTime([], boundaries, TEST_ZONES);
      expect(result).toHaveLength(5);
      result.forEach(entry => expect(entry.minutes).toBe(0));
    });

    it('returns near-zero minutes for single sample (5s default)', () => {
      const samples: HeartRateSample[] = [
        {timestamp: new Date('2026-04-07T10:00:00'), bpm: 150},
      ];
      const result = calculateZoneTime(samples, boundaries, TEST_ZONES);
      // Single sample gets 5 seconds (0.0833 min), rounded to 2 decimal → 0.08
      const totalMinutes = result.reduce((sum, e) => sum + e.minutes, 0);
      expect(totalMinutes).toBeGreaterThanOrEqual(0);
      expect(totalMinutes).toBeLessThan(1);
    });

    it('calculates time correctly for steady Zone 2 workout', () => {
      // 10 minutes of steady 145 bpm (Zone 2: 138-151)
      const samples: HeartRateSample[] = [];
      const start = new Date('2026-04-07T10:00:00');
      for (let i = 0; i <= 10; i++) {
        samples.push({
          timestamp: new Date(start.getTime() + i * 60 * 1000),
          bpm: 145,
        });
      }

      const result = calculateZoneTime(samples, boundaries, TEST_ZONES);
      const zone2 = result.find(e => e.zoneId === 2);
      expect(zone2!.minutes).toBeGreaterThan(9);
      expect(zone2!.minutes).toBeLessThanOrEqual(11);
    });

    it('distributes time across multiple zones', () => {
      const samples: HeartRateSample[] = [
        {timestamp: new Date('2026-04-07T10:00:00'), bpm: 130}, // Zone 1
        {timestamp: new Date('2026-04-07T10:05:00'), bpm: 145}, // Zone 2
        {timestamp: new Date('2026-04-07T10:10:00'), bpm: 160}, // Zone 3
        {timestamp: new Date('2026-04-07T10:15:00'), bpm: 175}, // Zone 4
      ];

      const result = calculateZoneTime(samples, boundaries, TEST_ZONES);
      expect(result.find(e => e.zoneId === 1)!.minutes).toBeGreaterThan(0);
      expect(result.find(e => e.zoneId === 2)!.minutes).toBeGreaterThan(0);
      expect(result.find(e => e.zoneId === 3)!.minutes).toBeGreaterThan(0);
      expect(result.find(e => e.zoneId === 4)!.minutes).toBeGreaterThan(0);
    });

    it('skips gaps longer than 5 minutes between samples', () => {
      const samples: HeartRateSample[] = [
        {timestamp: new Date('2026-04-07T10:00:00'), bpm: 145},
        {timestamp: new Date('2026-04-07T10:10:00'), bpm: 145}, // 10 min gap - skipped
        {timestamp: new Date('2026-04-07T10:11:00'), bpm: 145},
      ];

      const result = calculateZoneTime(samples, boundaries, TEST_ZONES);
      const zone2 = result.find(e => e.zoneId === 2);
      // Only 1 minute should count (10:10 → 10:11), not the 10-min gap
      expect(zone2!.minutes).toBeLessThan(2);
    });

    it('ignores heart rate below all zones', () => {
      const samples: HeartRateSample[] = [
        {timestamp: new Date('2026-04-07T10:00:00'), bpm: 80}, // Below Zone 1
        {timestamp: new Date('2026-04-07T10:05:00'), bpm: 80},
      ];

      const result = calculateZoneTime(samples, boundaries, TEST_ZONES);
      const total = result.reduce((sum, e) => sum + e.minutes, 0);
      expect(total).toBe(0);
    });
  });

  // ─── Aggregation ───

  describe('aggregateZoneTime', () => {
    it('sums zone times across multiple days', () => {
      const day1 = [{zoneId: 1, minutes: 10}, {zoneId: 2, minutes: 20}];
      const day2 = [{zoneId: 1, minutes: 5}, {zoneId: 2, minutes: 15}];

      const result = aggregateZoneTime([day1, day2], TEST_ZONES);
      expect(result.find(e => e.zoneId === 1)!.minutes).toBe(15);
      expect(result.find(e => e.zoneId === 2)!.minutes).toBe(35);
    });

    it('returns zeros for empty input', () => {
      const result = aggregateZoneTime([], TEST_ZONES);
      result.forEach(entry => expect(entry.minutes).toBe(0));
    });
  });

  // ─── Date Helpers ───

  describe('getWeekStart', () => {
    it('returns a Sunday', () => {
      const sunday = getWeekStart(0);
      expect(sunday.getDay()).toBe(0); // 0 = Sunday
    });

    it('starts at midnight', () => {
      const sunday = getWeekStart(0);
      expect(sunday.getHours()).toBe(0);
      expect(sunday.getMinutes()).toBe(0);
      expect(sunday.getSeconds()).toBe(0);
    });

    it('negative offset goes to previous week', () => {
      const thisWeek = getWeekStart(0);
      const lastWeek = getWeekStart(-1);
      const diff = thisWeek.getTime() - lastWeek.getTime();
      expect(diff).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
    });
  });

  describe('getWeekEnd', () => {
    it('returns a Saturday', () => {
      const sunday = getWeekStart(0);
      const saturday = getWeekEnd(sunday);
      expect(saturday.getDay()).toBe(6); // 6 = Saturday
    });

    it('is 6 days after week start', () => {
      const sunday = getWeekStart(0);
      const saturday = getWeekEnd(sunday);
      // Use millisecond diff so the assertion holds across month boundaries
      const dayMs = 24 * 60 * 60 * 1000;
      expect(Math.floor((saturday.getTime() - sunday.getTime()) / dayMs)).toBe(6);
    });

    it('ends at 23:59:59', () => {
      const saturday = getWeekEnd(getWeekStart(0));
      expect(saturday.getHours()).toBe(23);
      expect(saturday.getMinutes()).toBe(59);
      expect(saturday.getSeconds()).toBe(59);
    });
  });

  describe('formatWeekRange', () => {
    it('formats same-month range', () => {
      const start = new Date(2026, 2, 1); // Mar 1
      const end = new Date(2026, 2, 7);   // Mar 7
      const result = formatWeekRange(start, end);
      expect(result).toContain('Mar');
      expect(result).toContain('1');
      expect(result).toContain('7');
      expect(result).toContain('2026');
    });

    it('formats cross-month range', () => {
      const start = new Date(2026, 2, 29); // Mar 29
      const end = new Date(2026, 3, 4);    // Apr 4
      const result = formatWeekRange(start, end);
      expect(result).toContain('Mar');
      expect(result).toContain('Apr');
    });
  });
});

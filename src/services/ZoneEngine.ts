import {
  Zone,
  ZoneSettings,
  ZoneBoundary,
  HeartRateSample,
  ZoneTimeEntry,
  DailyZoneData,
  WeeklyZoneData,
} from '../types';

/**
 * ZoneEngine handles all heart rate zone calculations using the Karvonen Formula.
 *
 * Karvonen Formula:
 *   THR = Resting HR + (Intensity % × Heart Rate Reserve)
 *   Heart Rate Reserve (HRR) = Max HR - Resting HR
 */

/**
 * Calculate the Heart Rate Reserve (HRR)
 */
export function calculateHRR(maxHR: number, restingHR: number): number {
  return maxHR - restingHR;
}

/**
 * Calculate Target Heart Rate (THR) using the Karvonen Formula
 * @param restingHR - Resting heart rate in bpm
 * @param hrr - Heart rate reserve
 * @param intensityPercent - Intensity percentage (0-100)
 * @returns Target heart rate in bpm (rounded)
 */
export function calculateTHR(
  restingHR: number,
  hrr: number,
  intensityPercent: number,
): number {
  return Math.round(restingHR + (intensityPercent / 100) * hrr);
}

/**
 * Calculate zone boundaries (THR values) for all zones
 */
export function calculateZoneBoundaries(
  settings: ZoneSettings,
): ZoneBoundary[] {
  const hrr = calculateHRR(settings.maxHeartRate, settings.restingHeartRate);

  return settings.zones.map(zone => ({
    zoneId: zone.id,
    lowerTHR: calculateTHR(settings.restingHeartRate, hrr, zone.lowerIntensity),
    upperTHR: calculateTHR(settings.restingHeartRate, hrr, zone.upperIntensity),
  }));
}

/**
 * Classify a heart rate sample into a zone
 * @returns Zone ID (1-5) or 0 if below all zones, or 5 if above all zones
 */
export function classifyHeartRate(
  bpm: number,
  boundaries: ZoneBoundary[],
): number {
  // If below the lowest zone, classify as Zone 1
  if (bpm < boundaries[0].lowerTHR) {
    return 0; // Below all zones
  }

  // Check each zone from highest to lowest
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (bpm >= boundaries[i].lowerTHR) {
      return boundaries[i].zoneId;
    }
  }

  return 0;
}

/**
 * Process heart rate samples and calculate time spent in each zone
 * Assumes samples are sorted by timestamp
 */
export function calculateZoneTime(
  samples: HeartRateSample[],
  boundaries: ZoneBoundary[],
  zones: Zone[],
): ZoneTimeEntry[] {
  // Initialize time for each zone
  const zoneMinutes: Record<number, number> = {};
  zones.forEach(zone => {
    zoneMinutes[zone.id] = 0;
  });

  if (samples.length < 2) {
    return zones.map(zone => ({zoneId: zone.id, minutes: 0}));
  }

  // For each pair of consecutive samples, assign the duration to the zone
  // of the first sample
  for (let i = 0; i < samples.length - 1; i++) {
    const currentSample = samples[i];
    const nextSample = samples[i + 1];
    const durationMs =
      nextSample.timestamp.getTime() - currentSample.timestamp.getTime();
    const durationMinutes = durationMs / (1000 * 60);

    // Skip unreasonably long gaps (> 5 minutes between samples)
    if (durationMinutes > 5) {
      continue;
    }

    const zoneId = classifyHeartRate(currentSample.bpm, boundaries);
    if (zoneId > 0 && zoneMinutes[zoneId] !== undefined) {
      zoneMinutes[zoneId] += durationMinutes;
    }
  }

  // Handle the last sample (assign a default 5-second duration)
  const lastSample = samples[samples.length - 1];
  const lastZoneId = classifyHeartRate(lastSample.bpm, boundaries);
  if (lastZoneId > 0 && zoneMinutes[lastZoneId] !== undefined) {
    zoneMinutes[lastZoneId] += 5 / 60; // 5 seconds in minutes
  }

  return zones.map(zone => ({
    zoneId: zone.id,
    minutes: Math.round(zoneMinutes[zone.id] * 100) / 100, // Round to 2 decimal places
  }));
}

/**
 * Aggregate zone time entries (sum minutes per zone)
 */
export function aggregateZoneTime(
  entries: ZoneTimeEntry[][],
  zones: Zone[],
): ZoneTimeEntry[] {
  const totals: Record<number, number> = {};
  zones.forEach(zone => {
    totals[zone.id] = 0;
  });

  entries.forEach(dayEntries => {
    dayEntries.forEach(entry => {
      if (totals[entry.zoneId] !== undefined) {
        totals[entry.zoneId] += entry.minutes;
      }
    });
  });

  return zones.map(zone => ({
    zoneId: zone.id,
    minutes: Math.round(totals[zone.id] * 100) / 100,
  }));
}

/**
 * Get the Sunday start date for a given week offset (0 = current week)
 */
export function getWeekStart(weekOffset: number = 0): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

/**
 * Get the Saturday end date for a given week start
 */
export function getWeekEnd(weekStart: Date): Date {
  const saturday = new Date(weekStart);
  saturday.setDate(weekStart.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  return saturday;
}

/**
 * Format a date range for display (e.g., "Mar 1 – Mar 7, 2026")
 */
export function formatWeekRange(weekStart: Date, weekEnd: Date): string {
  const startMonth = weekStart.toLocaleString('default', {month: 'short'});
  const endMonth = weekEnd.toLocaleString('default', {month: 'short'});
  const startDay = weekStart.getDate();
  const endDay = weekEnd.getDate();
  const year = weekEnd.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

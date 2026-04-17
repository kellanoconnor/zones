import {Zone} from '../types';

// Default zone definitions with classic naming and blue-to-red gradient
export const DEFAULT_ZONES: Zone[] = [
  {
    id: 1,
    name: 'Recovery',
    color: '#3B82F6', // Blue
    lowerIntensity: 50,
    upperIntensity: 60,
  },
  {
    id: 2,
    name: 'Aerobic Base',
    color: '#22C55E', // Green
    lowerIntensity: 60,
    upperIntensity: 70,
  },
  {
    id: 3,
    name: 'Tempo',
    color: '#EAB308', // Yellow
    lowerIntensity: 70,
    upperIntensity: 80,
  },
  {
    id: 4,
    name: 'Threshold',
    color: '#F97316', // Orange
    lowerIntensity: 80,
    upperIntensity: 90,
  },
  {
    id: 5,
    name: 'VO2 Max',
    color: '#EF4444', // Red
    lowerIntensity: 90,
    upperIntensity: 100,
  },
];

export const DEFAULT_MAX_HR = 190;
export const DEFAULT_RESTING_HR = 60;

// Days of the week starting Sunday
export const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Get a date string in YYYY-MM-DD format using LOCAL time (not UTC).
 * This is critical — toISOString() converts to UTC which shifts the date
 * after ~8 PM in US timezones, causing data to be stored under the wrong day.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Total labels — full (Dashboard Weekly) and short (Trends)
export const LABEL_TOTAL_ALL = 'Total (Zone 1 and above):';
export const LABEL_TOTAL_ALL_SHORT = 'Total (Zone 1+):';
export const LABEL_TOTAL_Z3_PLUS = 'Total (Zone 3 and above):';
export const LABEL_TOTAL_Z3_PLUS_SHORT = 'Total (Zone 3+):';
export const LABEL_COMBINED = 'Combined Total (Moderate + Vigorous):';
export const LABEL_COMBINED_SHORT = 'Combined Total (Mod + Vig):';

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

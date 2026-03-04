// Heart Rate Zone Types

export interface Zone {
  id: number;
  name: string;
  color: string;
  lowerIntensity: number; // percentage (0-100)
  upperIntensity: number; // percentage (0-100)
  goalMinutes?: number; // optional weekly goal in minutes
}

export interface ZoneSettings {
  maxHeartRate: number;
  restingHeartRate: number;
  zones: Zone[];
}

export interface ZoneBoundary {
  zoneId: number;
  lowerTHR: number; // beats per minute
  upperTHR: number; // beats per minute
}

export interface HeartRateSample {
  timestamp: Date;
  bpm: number;
}

export interface WorkoutData {
  id: string;
  startDate: Date;
  endDate: Date;
  workoutType: string;
  heartRateSamples: HeartRateSample[];
}

export interface ZoneTimeEntry {
  zoneId: number;
  minutes: number;
}

export interface DailyZoneData {
  date: string; // ISO date string (YYYY-MM-DD)
  zoneTime: ZoneTimeEntry[];
  totalMinutes: number;
}

export interface WeeklyZoneData {
  weekStart: string; // ISO date string for Sunday
  weekEnd: string; // ISO date string for Saturday
  dailyData: DailyZoneData[];
  weeklyTotals: ZoneTimeEntry[];
  totalMinutes: number;
}

export type ViewMode = 'daily' | 'weekly';

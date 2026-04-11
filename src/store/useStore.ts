import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Zone, ZoneSettings, WeeklyZoneData, ViewMode, DailyRestingHR} from '../types';
import {
  DEFAULT_ZONES,
  DEFAULT_MAX_HR,
  DEFAULT_RESTING_HR,
} from '../utils/constants';

const SETTINGS_KEY = '@zones_settings';
const GOALS_KEY = '@zones_goals';
const RESTING_HR_HISTORY_KEY = '@zones_resting_hr_history';

interface AppState {
  // Settings
  settings: ZoneSettings;
  isHealthKitAuthorized: boolean;

  // Resting HR
  todayRestingHR: number | null; // Waking HR for today (from HealthKit)
  restingHRHistory: DailyRestingHR[]; // Historical daily resting HR values

  // Dashboard
  currentWeekOffset: number;
  viewMode: ViewMode;
  weeklyData: WeeklyZoneData | null;
  isLoading: boolean;

  // Actions
  setSettings: (settings: ZoneSettings) => void;
  setMaxHeartRate: (maxHR: number) => void;
  setRestingHeartRate: (restingHR: number) => void;
  updateZone: (zoneId: number, updates: Partial<Zone>) => void;
  setHealthKitAuthorized: (authorized: boolean) => void;
  setTodayRestingHR: (hr: number | null) => void;
  setDailyRestingHR: (date: string, restingHR: number) => void;
  getRestingHRForDate: (date: string) => number;
  setCurrentWeekOffset: (offset: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setWeeklyData: (data: WeeklyZoneData | null) => void;
  setIsLoading: (loading: boolean) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  loadRestingHRHistory: () => Promise<void>;
  saveRestingHRHistory: () => Promise<void>;
  resetToDefaults: () => void;
}

const useStore = create<AppState>((set, get) => ({
  // Initial state
  settings: {
    maxHeartRate: DEFAULT_MAX_HR,
    restingHeartRate: DEFAULT_RESTING_HR,
    zones: DEFAULT_ZONES,
  },
  isHealthKitAuthorized: false,
  todayRestingHR: null,
  restingHRHistory: [],
  currentWeekOffset: 0,
  viewMode: 'daily',
  weeklyData: null,
  isLoading: false,

  // Settings actions
  setSettings: (settings: ZoneSettings) => set({settings}),

  setMaxHeartRate: (maxHR: number) =>
    set(state => ({
      settings: {...state.settings, maxHeartRate: maxHR},
    })),

  setRestingHeartRate: (restingHR: number) =>
    set(state => ({
      settings: {...state.settings, restingHeartRate: restingHR},
    })),

  updateZone: (zoneId: number, updates: Partial<Zone>) =>
    set(state => ({
      settings: {
        ...state.settings,
        zones: state.settings.zones.map(zone =>
          zone.id === zoneId ? {...zone, ...updates} : zone,
        ),
      },
    })),

  setHealthKitAuthorized: (authorized: boolean) =>
    set({isHealthKitAuthorized: authorized}),

  setTodayRestingHR: (hr: number | null) => {
    set({todayRestingHR: hr});
    if (hr !== null) {
      // Also update the store's restingHeartRate for zone calculations
      set(state => ({
        settings: {...state.settings, restingHeartRate: hr},
      }));
    }
  },

  setDailyRestingHR: (date: string, restingHR: number) =>
    set(state => {
      const existing = state.restingHRHistory.find(d => d.date === date);
      if (existing && existing.locked) {
        // Don't overwrite locked days
        return state;
      }
      const filtered = state.restingHRHistory.filter(d => d.date !== date);
      const today = new Date().toISOString().split('T')[0];
      return {
        restingHRHistory: [
          ...filtered,
          {date, restingHR, locked: date < today},
        ],
      };
    }),

  getRestingHRForDate: (date: string) => {
    const state = get();
    const record = state.restingHRHistory.find(d => d.date === date);
    if (record) {
      return record.restingHR;
    }
    // Fall back to current setting
    return state.settings.restingHeartRate;
  },

  // Dashboard actions
  setCurrentWeekOffset: (offset: number) => set({currentWeekOffset: offset}),
  setViewMode: (mode: ViewMode) => set({viewMode: mode}),
  setWeeklyData: (data: WeeklyZoneData | null) => set({weeklyData: data}),
  setIsLoading: (loading: boolean) => set({isLoading: loading}),

  // Persistence
  loadSettings: async () => {
    try {
      const settingsJson = await AsyncStorage.getItem(SETTINGS_KEY);
      if (settingsJson) {
        const settings = JSON.parse(settingsJson) as ZoneSettings;
        set({settings});
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: async () => {
    try {
      const {settings} = get();
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  loadRestingHRHistory: async () => {
    try {
      const json = await AsyncStorage.getItem(RESTING_HR_HISTORY_KEY);
      if (json) {
        const history = JSON.parse(json) as DailyRestingHR[];
        set({restingHRHistory: history});
      }
    } catch (error) {
      console.error('Failed to load resting HR history:', error);
    }
  },

  saveRestingHRHistory: async () => {
    try {
      const {restingHRHistory} = get();
      await AsyncStorage.setItem(
        RESTING_HR_HISTORY_KEY,
        JSON.stringify(restingHRHistory),
      );
    } catch (error) {
      console.error('Failed to save resting HR history:', error);
    }
  },

  resetToDefaults: () =>
    set({
      settings: {
        maxHeartRate: DEFAULT_MAX_HR,
        restingHeartRate: DEFAULT_RESTING_HR,
        zones: DEFAULT_ZONES,
      },
    }),
}));

export default useStore;

import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Zone, ZoneSettings, WeeklyZoneData, ViewMode, DailyRestingHR, DailySettingsSnapshot} from '../types';
import {
  DEFAULT_ZONES,
  DEFAULT_MAX_HR,
  DEFAULT_RESTING_HR,
  getLocalDateString,
} from '../utils/constants';

const SETTINGS_KEY = '@zones_settings';
const GOALS_KEY = '@zones_goals';
const RESTING_HR_HISTORY_KEY = '@zones_resting_hr_history';
const SETTINGS_SNAPSHOTS_KEY = '@zones_settings_snapshots';

interface AppState {
  // Settings
  settings: ZoneSettings;
  isHealthKitAuthorized: boolean;

  // Resting HR
  todayRestingHR: number | null; // Waking HR for today (from HealthKit)
  restingHRHistory: DailyRestingHR[]; // Historical daily resting HR values

  // Per-day settings snapshots. The source of truth for zone calculations
  // on past dates — locked the moment a date becomes "yesterday".
  settingsSnapshots: DailySettingsSnapshot[];

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
  loadSettingsSnapshots: () => Promise<void>;
  saveSettingsSnapshots: () => Promise<void>;
  // Returns the saved snapshot for a date, or builds one from current
  // state. For dates strictly in the past, the new snapshot is saved
  // and locked so it never recomputes again. For today/future, returns
  // a transient snapshot built from current settings.
  getSettingsSnapshotForDate: (date: string) => DailySettingsSnapshot;
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
  settingsSnapshots: [],
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
      const today = getLocalDateString();
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
    // Fall back to the most recent stored value before this date
    const prior = state.restingHRHistory
      .filter(d => d.date < date)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (prior.length > 0) {
      return prior[0].restingHR;
    }
    // Last resort: global setting default
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

  loadSettingsSnapshots: async () => {
    try {
      const json = await AsyncStorage.getItem(SETTINGS_SNAPSHOTS_KEY);
      if (json) {
        const snapshots = JSON.parse(json) as DailySettingsSnapshot[];
        set({settingsSnapshots: snapshots});
      }
    } catch (error) {
      console.error('Failed to load settings snapshots:', error);
    }
  },

  saveSettingsSnapshots: async () => {
    try {
      const {settingsSnapshots} = get();
      await AsyncStorage.setItem(
        SETTINGS_SNAPSHOTS_KEY,
        JSON.stringify(settingsSnapshots),
      );
    } catch (error) {
      console.error('Failed to save settings snapshots:', error);
    }
  },

  getSettingsSnapshotForDate: (date: string) => {
    const state = get();
    const today = getLocalDateString();
    const isPast = date < today;

    const existing = state.settingsSnapshots.find(s => s.date === date);
    if (existing) return existing;

    // Build a snapshot from the best information we have for the date:
    // historical resting HR if recorded, current max HR, current zones.
    // Past max HR / zone intensities aren't tracked historically — they
    // get the current values, with the understanding that this is a
    // one-time backfill. After that the snapshot is locked.
    const restingFromHistory = state.restingHRHistory.find(d => d.date === date);
    const restingHR = restingFromHistory
      ? restingFromHistory.restingHR
      : (() => {
          const prior = state.restingHRHistory
            .filter(d => d.date < date)
            .sort((a, b) => b.date.localeCompare(a.date));
          return prior.length > 0
            ? prior[0].restingHR
            : state.settings.restingHeartRate;
        })();

    const snapshot: DailySettingsSnapshot = {
      date,
      restingHR,
      maxHeartRate: state.settings.maxHeartRate,
      // Deep copy so future updates to settings.zones don't mutate the snapshot.
      zones: state.settings.zones.map(z => ({...z})),
      locked: isPast,
    };

    if (isPast) {
      set({settingsSnapshots: [...state.settingsSnapshots, snapshot]});
      // Persist asynchronously; not awaited here because callers (per-day
      // lookup loops) shouldn't block on disk writes for each lookup.
      get().saveSettingsSnapshots();
    }
    return snapshot;
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

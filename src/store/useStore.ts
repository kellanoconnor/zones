import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Zone, ZoneSettings, WeeklyZoneData, ViewMode} from '../types';
import {
  DEFAULT_ZONES,
  DEFAULT_MAX_HR,
  DEFAULT_RESTING_HR,
} from '../utils/constants';

const SETTINGS_KEY = '@zones_settings';
const GOALS_KEY = '@zones_goals';

interface AppState {
  // Settings
  settings: ZoneSettings;
  isHealthKitAuthorized: boolean;

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
  setCurrentWeekOffset: (offset: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setWeeklyData: (data: WeeklyZoneData | null) => void;
  setIsLoading: (loading: boolean) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
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

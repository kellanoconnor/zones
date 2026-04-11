import useStore from '../useStore';
import {DEFAULT_MAX_HR, DEFAULT_RESTING_HR} from '../../utils/constants';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

describe('useStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    const {resetToDefaults} = useStore.getState();
    resetToDefaults();
    useStore.setState({
      todayRestingHR: null,
      restingHRHistory: [],
      isHealthKitAuthorized: false,
      weeklyData: null,
      isLoading: false,
      currentWeekOffset: 0,
      viewMode: 'daily',
    });
  });

  // ─── Default State ───

  describe('initial state', () => {
    it('has correct default max heart rate', () => {
      expect(useStore.getState().settings.maxHeartRate).toBe(DEFAULT_MAX_HR);
    });

    it('has correct default resting heart rate', () => {
      expect(useStore.getState().settings.restingHeartRate).toBe(DEFAULT_RESTING_HR);
    });

    it('has 5 default zones', () => {
      expect(useStore.getState().settings.zones).toHaveLength(5);
    });

    it('starts not authorized', () => {
      expect(useStore.getState().isHealthKitAuthorized).toBe(false);
    });

    it('starts with no today resting HR', () => {
      expect(useStore.getState().todayRestingHR).toBeNull();
    });

    it('starts with empty resting HR history', () => {
      expect(useStore.getState().restingHRHistory).toEqual([]);
    });
  });

  // ─── Settings Actions ───

  describe('setMaxHeartRate', () => {
    it('updates max heart rate', () => {
      useStore.getState().setMaxHeartRate(200);
      expect(useStore.getState().settings.maxHeartRate).toBe(200);
    });

    it('does not affect resting heart rate', () => {
      useStore.getState().setMaxHeartRate(200);
      expect(useStore.getState().settings.restingHeartRate).toBe(DEFAULT_RESTING_HR);
    });
  });

  describe('setRestingHeartRate', () => {
    it('updates resting heart rate', () => {
      useStore.getState().setRestingHeartRate(55);
      expect(useStore.getState().settings.restingHeartRate).toBe(55);
    });
  });

  // ─── Today's Resting HR ───

  describe('setTodayRestingHR', () => {
    it('sets today resting HR', () => {
      useStore.getState().setTodayRestingHR(48);
      expect(useStore.getState().todayRestingHR).toBe(48);
    });

    it('also updates settings.restingHeartRate when non-null', () => {
      useStore.getState().setTodayRestingHR(48);
      expect(useStore.getState().settings.restingHeartRate).toBe(48);
    });

    it('does not update settings when set to null', () => {
      useStore.getState().setRestingHeartRate(65);
      useStore.getState().setTodayRestingHR(null);
      expect(useStore.getState().settings.restingHeartRate).toBe(65);
    });
  });

  // ─── Daily Resting HR History ───

  describe('setDailyRestingHR', () => {
    it('stores resting HR for a date', () => {
      useStore.getState().setDailyRestingHR('2026-04-07', 50);
      const history = useStore.getState().restingHRHistory;
      expect(history).toHaveLength(1);
      expect(history[0].date).toBe('2026-04-07');
      expect(history[0].restingHR).toBe(50);
    });

    it('updates resting HR for same date (today, not yet locked)', () => {
      const today = new Date().toISOString().split('T')[0];
      useStore.getState().setDailyRestingHR(today, 50);
      useStore.getState().setDailyRestingHR(today, 48);
      const history = useStore.getState().restingHRHistory;
      expect(history).toHaveLength(1);
      expect(history[0].restingHR).toBe(48);
    });

    it('stores multiple dates', () => {
      useStore.getState().setDailyRestingHR('2026-04-07', 50);
      useStore.getState().setDailyRestingHR('2026-04-08', 48);
      expect(useStore.getState().restingHRHistory).toHaveLength(2);
    });

    it('does not overwrite locked entries', () => {
      // Manually set a locked entry
      useStore.setState({
        restingHRHistory: [{date: '2026-04-01', restingHR: 52, locked: true}],
      });
      useStore.getState().setDailyRestingHR('2026-04-01', 48);
      expect(useStore.getState().restingHRHistory[0].restingHR).toBe(52);
    });

    it('marks past dates as locked', () => {
      // A date in the past should be locked
      useStore.getState().setDailyRestingHR('2020-01-01', 55);
      const entry = useStore.getState().restingHRHistory.find(
        d => d.date === '2020-01-01',
      );
      expect(entry!.locked).toBe(true);
    });
  });

  describe('getRestingHRForDate', () => {
    it('returns stored HR for known date', () => {
      useStore.getState().setDailyRestingHR('2026-04-07', 50);
      expect(useStore.getState().getRestingHRForDate('2026-04-07')).toBe(50);
    });

    it('falls back to settings default for unknown date', () => {
      expect(useStore.getState().getRestingHRForDate('2099-01-01')).toBe(
        DEFAULT_RESTING_HR,
      );
    });
  });

  // ─── Dashboard Actions ───

  describe('dashboard actions', () => {
    it('setViewMode toggles between daily and weekly', () => {
      useStore.getState().setViewMode('weekly');
      expect(useStore.getState().viewMode).toBe('weekly');
      useStore.getState().setViewMode('daily');
      expect(useStore.getState().viewMode).toBe('daily');
    });

    it('setCurrentWeekOffset updates offset', () => {
      useStore.getState().setCurrentWeekOffset(-1);
      expect(useStore.getState().currentWeekOffset).toBe(-1);
    });

    it('setIsLoading updates loading state', () => {
      useStore.getState().setIsLoading(true);
      expect(useStore.getState().isLoading).toBe(true);
    });
  });

  // ─── Zone Updates ───

  describe('updateZone', () => {
    it('updates goal minutes for a zone', () => {
      useStore.getState().updateZone(1, {goalMinutes: 30});
      const zone1 = useStore.getState().settings.zones.find(z => z.id === 1);
      expect(zone1!.goalMinutes).toBe(30);
    });

    it('does not affect other zones', () => {
      useStore.getState().updateZone(1, {goalMinutes: 30});
      const zone2 = useStore.getState().settings.zones.find(z => z.id === 2);
      expect(zone2!.goalMinutes).toBeUndefined();
    });
  });

  // ─── Reset ───

  describe('resetToDefaults', () => {
    it('restores default settings', () => {
      useStore.getState().setMaxHeartRate(200);
      useStore.getState().setRestingHeartRate(45);
      useStore.getState().resetToDefaults();
      expect(useStore.getState().settings.maxHeartRate).toBe(DEFAULT_MAX_HR);
      expect(useStore.getState().settings.restingHeartRate).toBe(DEFAULT_RESTING_HR);
    });
  });
});

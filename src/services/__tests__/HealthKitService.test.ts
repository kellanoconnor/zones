/**
 * HealthKitService tests
 *
 * Mocks the @kingstinct/react-native-healthkit library to test
 * our service logic without a real device.
 */

// Mock the HealthKit library
// The code uses: import Healthkit, { requestAuthorization, ... } from '...'
// Babel transforms this so default.isHealthDataAvailable is called via Healthkit.xxx
// and named exports are called directly.
const mockIsHealthDataAvailable = jest.fn();
const mockRequestAuthorization = jest.fn();
const mockQueryWorkoutSamples = jest.fn();
const mockQueryQuantitySamples = jest.fn();
const mockQueryCategorySamples = jest.fn();

jest.mock('@kingstinct/react-native-healthkit', () => {
  const mock = {
    isHealthDataAvailable: (...args: any[]) => mockIsHealthDataAvailable(...args),
    requestAuthorization: (...args: any[]) => mockRequestAuthorization(...args),
    queryWorkoutSamples: (...args: any[]) => mockQueryWorkoutSamples(...args),
    queryQuantitySamples: (...args: any[]) => mockQueryQuantitySamples(...args),
    queryCategorySamples: (...args: any[]) => mockQueryCategorySamples(...args),
  };
  return {
    __esModule: true,
    default: mock,
    ...mock,
  };
});

jest.mock('react-native', () => ({
  Platform: {OS: 'ios'},
}));

import {
  initHealthKit,
  getWorkouts,
  getHeartRateSamples,
  getWorkoutsWithHeartRate,
  getWakingHeartRate,
  getWakingHRAverage,
} from '../HealthKitService';

beforeEach(() => {
  jest.clearAllMocks();
  mockIsHealthDataAvailable.mockReturnValue(true);
  mockRequestAuthorization.mockResolvedValue(true);
});

// ─── initHealthKit ───

describe('initHealthKit', () => {
  it('requests authorization for HR, workouts, sleep, and resting HR', async () => {
    const result = await initHealthKit();
    expect(result).toBe(true);
    expect(mockRequestAuthorization).toHaveBeenCalledWith({
      toRead: [
        'HKQuantityTypeIdentifierHeartRate',
        'HKWorkoutTypeIdentifier',
        'HKCategoryTypeIdentifierSleepAnalysis',
        'HKQuantityTypeIdentifierRestingHeartRate',
      ],
    });
  });

  it('returns false when HealthKit is not available', async () => {
    mockIsHealthDataAvailable.mockReturnValue(false);
    const result = await initHealthKit();
    expect(result).toBe(false);
  });

  it('returns false on authorization error', async () => {
    mockRequestAuthorization.mockRejectedValue(new Error('denied'));
    const result = await initHealthKit();
    expect(result).toBe(false);
  });
});

// ─── getWorkouts ───

describe('getWorkouts', () => {
  it('returns mapped workout data', async () => {
    mockQueryWorkoutSamples.mockResolvedValue([
      {
        uuid: 'w1',
        startDate: '2026-04-07T10:00:00Z',
        endDate: '2026-04-07T11:00:00Z',
        workoutActivityType: 'running',
      },
    ]);

    const workouts = await getWorkouts(
      new Date('2026-04-07'),
      new Date('2026-04-08'),
    );

    expect(workouts).toHaveLength(1);
    expect(workouts[0].id).toBe('w1');
    expect(workouts[0].workoutType).toBe('running');
    expect(workouts[0].heartRateSamples).toEqual([]);
  });

  it('returns empty array when query returns null', async () => {
    mockQueryWorkoutSamples.mockResolvedValue(null);
    const workouts = await getWorkouts(
      new Date('2026-04-07'),
      new Date('2026-04-08'),
    );
    expect(workouts).toEqual([]);
  });

  it('returns empty array on error', async () => {
    mockQueryWorkoutSamples.mockRejectedValue(new Error('fail'));
    const workouts = await getWorkouts(
      new Date('2026-04-07'),
      new Date('2026-04-08'),
    );
    expect(workouts).toEqual([]);
  });
});

// ─── getHeartRateSamples ───

describe('getHeartRateSamples', () => {
  it('returns sorted heart rate samples', async () => {
    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-07T10:05:00Z', quantity: 150},
      {startDate: '2026-04-07T10:00:00Z', quantity: 140},
      {startDate: '2026-04-07T10:10:00Z', quantity: 160},
    ]);

    const samples = await getHeartRateSamples(
      new Date('2026-04-07T10:00:00Z'),
      new Date('2026-04-07T11:00:00Z'),
    );

    expect(samples).toHaveLength(3);
    // Should be sorted by timestamp ascending
    expect(samples[0].bpm).toBe(140);
    expect(samples[1].bpm).toBe(150);
    expect(samples[2].bpm).toBe(160);
  });

  it('queries with correct unit', async () => {
    mockQueryQuantitySamples.mockResolvedValue([]);
    await getHeartRateSamples(
      new Date('2026-04-07'),
      new Date('2026-04-08'),
    );

    expect(mockQueryQuantitySamples).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierHeartRate',
      expect.objectContaining({unit: 'count/min'}),
    );
  });

  it('returns empty array on error', async () => {
    mockQueryQuantitySamples.mockRejectedValue(new Error('fail'));
    const samples = await getHeartRateSamples(
      new Date('2026-04-07'),
      new Date('2026-04-08'),
    );
    expect(samples).toEqual([]);
  });
});

// ─── getWorkoutsWithHeartRate ───

describe('getWorkoutsWithHeartRate', () => {
  it('attaches heart rate samples to each workout', async () => {
    mockQueryWorkoutSamples.mockResolvedValue([
      {
        uuid: 'w1',
        startDate: '2026-04-07T10:00:00Z',
        endDate: '2026-04-07T10:30:00Z',
        workoutActivityType: 'running',
      },
    ]);

    // HR samples for the workout time range
    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-07T10:05:00Z', quantity: 145},
      {startDate: '2026-04-07T10:10:00Z', quantity: 155},
    ]);

    const workouts = await getWorkoutsWithHeartRate(
      new Date('2026-04-07'),
      new Date('2026-04-08'),
    );

    expect(workouts).toHaveLength(1);
    expect(workouts[0].heartRateSamples).toHaveLength(2);
  });
});

// ─── getWakingHeartRate ───

describe('getWakingHeartRate', () => {
  it('finds lowest HR near wake time from sleep data', async () => {
    // Sleep session ending at 6:30 AM
    mockQueryCategorySamples.mockResolvedValue([
      {
        startDate: '2026-04-07T22:00:00',
        endDate: '2026-04-08T06:30:00',
        value: 1, // asleepUnspecified
      },
    ]);

    // HR samples in the window around 6:30 AM (6:25 - 6:40)
    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-08T06:25:00', quantity: 52},
      {startDate: '2026-04-08T06:28:00', quantity: 48},
      {startDate: '2026-04-08T06:32:00', quantity: 55},
      {startDate: '2026-04-08T06:35:00', quantity: 50},
    ]);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    expect(hr).toBe(48); // Lowest in the window
  });

  it('falls back to 4-7 AM window when no sleep data', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);

    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-08T05:00:00', quantity: 55},
      {startDate: '2026-04-08T05:30:00', quantity: 51},
      {startDate: '2026-04-08T06:00:00', quantity: 58},
    ]);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    expect(hr).toBe(51); // Lowest in 4-7 AM fallback
  });

  it('returns null when no HR samples available', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);
    mockQueryQuantitySamples.mockResolvedValue([]);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    expect(hr).toBeNull();
  });

  it('returns null when HR query returns null', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);
    mockQueryQuantitySamples.mockResolvedValue(null);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    expect(hr).toBeNull();
  });

  it('returns null on error', async () => {
    mockQueryCategorySamples.mockRejectedValue(new Error('fail'));

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    expect(hr).toBeNull();
  });

  it('rounds the result to nearest integer', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);
    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-08T05:00:00', quantity: 48.7},
    ]);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    expect(hr).toBe(49);
  });

  it('filters sleep sessions to morning of target date only', async () => {
    // Sleep session ending the day before — should be ignored
    mockQueryCategorySamples.mockResolvedValue([
      {
        startDate: '2026-04-06T22:00:00',
        endDate: '2026-04-07T06:30:00', // Ends Apr 7, not Apr 8
        value: 1,
      },
    ]);

    // Fallback to 4-7 AM
    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-08T05:00:00', quantity: 53},
    ]);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    // Should use fallback since sleep ended on wrong day
    expect(hr).toBe(53);
  });

  it('uses the latest sleep session when multiple exist', async () => {
    // Two sleep sessions — nap and main sleep
    mockQueryCategorySamples.mockResolvedValue([
      {
        startDate: '2026-04-08T01:00:00',
        endDate: '2026-04-08T03:00:00', // Nap ends at 3 AM
        value: 1,
      },
      {
        startDate: '2026-04-08T03:30:00',
        endDate: '2026-04-08T07:00:00', // Main sleep ends at 7 AM
        value: 1,
      },
    ]);

    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-08T06:58:00', quantity: 46},
      {startDate: '2026-04-08T07:02:00', quantity: 50},
    ]);

    const hr = await getWakingHeartRate(new Date('2026-04-08'));
    // Should pick lowest near 7 AM (latest session), not 3 AM
    expect(hr).toBe(46);
  });
});

// ─── getWakingHRAverage ───

describe('getWakingHRAverage', () => {
  it('averages readings across available days', async () => {
    // Mock sleep data for each call
    mockQueryCategorySamples.mockResolvedValue([]);

    // Return different HR values for sequential calls
    let callCount = 0;
    mockQueryQuantitySamples.mockImplementation(() => {
      callCount++;
      // Alternate between having data and not
      if (callCount <= 3) {
        // Days 1-3 have data: 48, 50, 52
        return Promise.resolve([
          {startDate: '2026-04-08T05:00:00', quantity: 46 + callCount * 2},
        ]);
      }
      // Days 4-7 have no data
      return Promise.resolve([]);
    });

    const avg = await getWakingHRAverage(7);
    // 3 readings: 48, 50, 52 → average 50
    expect(avg).toBe(50);
  });

  it('returns null when no days have data', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);
    mockQueryQuantitySamples.mockResolvedValue([]);

    const avg = await getWakingHRAverage(7);
    expect(avg).toBeNull();
  });

  it('returns null on error', async () => {
    mockQueryCategorySamples.mockRejectedValue(new Error('fail'));

    const avg = await getWakingHRAverage(3);
    expect(avg).toBeNull();
  });

  it('respects custom day count', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);
    mockQueryQuantitySamples.mockResolvedValue([
      {startDate: '2026-04-08T05:00:00', quantity: 50},
    ]);

    await getWakingHRAverage(3);
    // queryCategorySamples called once per day = 3 times
    expect(mockQueryCategorySamples).toHaveBeenCalledTimes(3);
  });

  it('rounds the average to nearest integer', async () => {
    mockQueryCategorySamples.mockResolvedValue([]);

    let callCount = 0;
    mockQueryQuantitySamples.mockImplementation(() => {
      callCount++;
      // 3 readings: 47, 48, 49 → avg 48
      // Or 47, 48, 50 → avg 48.33 → 48
      const values = [47, 48, 50];
      if (callCount <= 3) {
        return Promise.resolve([
          {startDate: '2026-04-08T05:00:00', quantity: values[callCount - 1]},
        ]);
      }
      return Promise.resolve([]);
    });

    const avg = await getWakingHRAverage(3);
    expect(avg).toBe(48); // Math.round(48.33)
  });
});

import {Platform} from 'react-native';
import Healthkit, {
  requestAuthorization,
  queryWorkoutSamples,
  queryQuantitySamples,
  queryCategorySamples,
} from '@kingstinct/react-native-healthkit';
import {HeartRateSample, WorkoutData} from '../types';

// HealthKit type identifiers are plain strings
const HEART_RATE_TYPE = 'HKQuantityTypeIdentifierHeartRate';
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier';
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';
const RESTING_HR_TYPE = 'HKQuantityTypeIdentifierRestingHeartRate';

/**
 * Initialize HealthKit and request permissions
 * @returns Promise that resolves to true if authorized
 */
export async function initHealthKit(): Promise<boolean> {
  try {
    if (Platform.OS !== 'ios') {
      console.warn('HealthKit is not available on this platform');
      return false;
    }

    const available = await Healthkit.isHealthDataAvailable();
    if (!available) {
      console.warn('HealthKit is not available on this device');
      return false;
    }

    await requestAuthorization({
      toRead: [HEART_RATE_TYPE, WORKOUT_TYPE, SLEEP_TYPE, RESTING_HR_TYPE],
    });

    return true;
  } catch (error) {
    console.warn('HealthKit initialization error:', error);
    return false;
  }
}

/**
 * Fetch workouts from HealthKit for a given date range
 */
export async function getWorkouts(
  startDate: Date,
  endDate: Date,
): Promise<WorkoutData[]> {
  try {
    const workouts = await queryWorkoutSamples({
      limit: 50,
      filter: {
        date: {
          startDate,
          endDate,
        },
      },
    });
    return (workouts || []).map((workout: any) => ({
      id: workout.uuid || `${workout.startDate}-${workout.endDate}`,
      startDate: new Date(workout.startDate),
      endDate: new Date(workout.endDate),
      workoutType: workout.workoutActivityType?.toString() || 'Unknown',
      heartRateSamples: [],
    }));
  } catch (error) {
    console.error('Failed to fetch workouts:', error);
    return [];
  }
}

/**
 * Fetch heart rate samples from HealthKit for a given date range
 */
export async function getHeartRateSamples(
  startDate: Date,
  endDate: Date,
): Promise<HeartRateSample[]> {
  try {
    const samples = await queryQuantitySamples(
      HEART_RATE_TYPE as any,
      {
        limit: 1000,
        ascending: true,
        unit: 'count/min',
        filter: {
          date: {
            startDate,
            endDate,
          },
        },
      },
    );

    return (samples || [])
      .map((sample: any) => ({
        timestamp: new Date(sample.startDate),
        bpm: sample.quantity,
      }))
      .sort(
        (a: HeartRateSample, b: HeartRateSample) =>
          a.timestamp.getTime() - b.timestamp.getTime(),
      );
  } catch (error) {
    console.error('Failed to fetch heart rate samples:', error);
    return [];
  }
}

/**
 * Fetch workouts with their associated heart rate data for a date range
 */
export async function getWorkoutsWithHeartRate(
  startDate: Date,
  endDate: Date,
): Promise<WorkoutData[]> {
  const workouts = await getWorkouts(startDate, endDate);

  const workoutsWithHR = await Promise.all(
    workouts.map(async workout => {
      const samples = await getHeartRateSamples(
        workout.startDate,
        workout.endDate,
      );
      return {
        ...workout,
        heartRateSamples: samples,
      };
    }),
  );

  return workoutsWithHR;
}

/**
 * Get the waking heart rate for a specific date.
 * Uses sleep analysis to find wake time, then queries HR samples
 * in a 10-minute window around waking to find the lowest reading.
 *
 * Falls back to early-morning (4-7 AM) lowest HR if no sleep data.
 * Returns null if no data available.
 */
export async function getWakingHeartRate(
  date: Date,
): Promise<number | null> {
  try {
    // Set up date range for the target day (look at sleep ending on this day)
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(12, 0, 0, 0); // Only look at morning

    // Query sleep samples that overlap with this morning
    const sleepSamples = await queryCategorySamples(
      SLEEP_TYPE as any,
      {
        limit: 50,
        ascending: false,
        filter: {
          date: {
            startDate: new Date(dayStart.getTime() - 12 * 60 * 60 * 1000), // Previous evening
            endDate: dayEnd,
          },
        },
      },
    );

    let wakeTime: Date | null = null;

    if (sleepSamples && sleepSamples.length > 0) {
      // Filter to overnight sleep sessions only (excludes naps):
      // - Must end between midnight and noon on the target day (morning wake-up)
      // - Must start before midnight (i.e. started the previous evening/night)
      // This prevents afternoon naps from being mistaken for overnight sleep
      const sortedSleep = [...sleepSamples]
        .filter((s: any) => {
          const start = new Date(s.startDate);
          const end = new Date(s.endDate);
          return end >= dayStart && end <= dayEnd && start < dayStart;
        })
        .sort((a: any, b: any) =>
          new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
        );

      if (sortedSleep.length > 0) {
        // The end of the last overnight sleep session is the wake time
        wakeTime = new Date((sortedSleep[0] as any).endDate);
      }
    }

    let hrWindowStart: Date;
    let hrWindowEnd: Date;

    if (wakeTime) {
      // Query HR in a 10-minute window around wake time
      hrWindowStart = new Date(wakeTime.getTime() - 5 * 60 * 1000);
      hrWindowEnd = new Date(wakeTime.getTime() + 10 * 60 * 1000);
    } else {
      // Fallback: query early morning HR (4-7 AM)
      hrWindowStart = new Date(dayStart);
      hrWindowStart.setHours(4, 0, 0, 0);
      hrWindowEnd = new Date(dayStart);
      hrWindowEnd.setHours(7, 0, 0, 0);
    }

    const hrSamples = await queryQuantitySamples(
      HEART_RATE_TYPE as any,
      {
        limit: 100,
        ascending: true,
        unit: 'count/min',
        filter: {
          date: {
            startDate: hrWindowStart,
            endDate: hrWindowEnd,
          },
        },
      },
    );

    if (!hrSamples || hrSamples.length === 0) {
      return null;
    }

    // Return the lowest HR in the window
    const lowestHR = Math.min(...hrSamples.map((s: any) => s.quantity));
    return Math.round(lowestHR);
  } catch (error) {
    console.error('Failed to get waking heart rate:', error);
    return null;
  }
}

/**
 * Get a 7-day rolling average of waking heart rate.
 * Queries each of the last 7 days and averages available readings.
 * Returns null if no readings available.
 */
export async function getWakingHRAverage(days: number = 7): Promise<number | null> {
  try {
    const readings: number[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const hr = await getWakingHeartRate(date);
      if (hr !== null) {
        readings.push(hr);
      }
    }

    if (readings.length === 0) {
      return null;
    }

    return Math.round(readings.reduce((sum, r) => sum + r, 0) / readings.length);
  } catch (error) {
    console.error('Failed to get waking HR average:', error);
    return null;
  }
}

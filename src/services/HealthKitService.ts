import AppleHealthKit, {
  HealthKitPermissions,
  HealthInputOptions,
} from 'react-native-health';
import {HeartRateSample, WorkoutData} from '../types';

/**
 * HealthKitService handles all interactions with Apple HealthKit
 * to read workout and heart rate data from the Apple Watch.
 */

// Permissions we need from HealthKit
const permissions: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
    write: [],
  },
};

/**
 * Initialize HealthKit and request permissions
 * @returns Promise that resolves to true if authorized
 */
export function initHealthKit(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(permissions, (error: string) => {
      if (error) {
        console.error('HealthKit initialization error:', error);
        reject(new Error(error));
        return;
      }
      resolve(true);
    });
  });
}

/**
 * Fetch workouts from HealthKit for a given date range
 */
export function getWorkouts(
  startDate: Date,
  endDate: Date,
): Promise<WorkoutData[]> {
  return new Promise((resolve, reject) => {
    const options: HealthInputOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    AppleHealthKit.getSamples(
      {
        ...options,
        type: 'Workout',
      },
      (error: string, results: any[]) => {
        if (error) {
          reject(new Error(error));
          return;
        }

        const workouts: WorkoutData[] = (results || []).map(
          (workout: any) => ({
            id: workout.id || `${workout.startDate}-${workout.endDate}`,
            startDate: new Date(workout.startDate),
            endDate: new Date(workout.endDate),
            workoutType: workout.activityName || 'Unknown',
            heartRateSamples: [], // Will be populated separately
          }),
        );

        resolve(workouts);
      },
    );
  });
}

/**
 * Fetch heart rate samples from HealthKit for a given date range
 */
export function getHeartRateSamples(
  startDate: Date,
  endDate: Date,
): Promise<HeartRateSample[]> {
  return new Promise((resolve, reject) => {
    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: true,
    };

    AppleHealthKit.getHeartRateSamples(
      options,
      (error: string, results: any[]) => {
        if (error) {
          reject(new Error(error));
          return;
        }

        const samples: HeartRateSample[] = (results || []).map(
          (sample: any) => ({
            timestamp: new Date(sample.startDate),
            bpm: sample.value,
          }),
        );

        resolve(samples);
      },
    );
  });
}

/**
 * Fetch workouts with their associated heart rate data for a date range
 */
export async function getWorkoutsWithHeartRate(
  startDate: Date,
  endDate: Date,
): Promise<WorkoutData[]> {
  const workouts = await getWorkouts(startDate, endDate);

  // Fetch heart rate samples for each workout's time range
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

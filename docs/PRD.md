# Zones - Heart Rate Zone Tracking App

## Product Requirements Document (PRD)

### Overview
Zones is a React Native iOS app that reads workout and heart rate data from Apple HealthKit (via Apple Watch) and displays time spent in each heart rate zone. It uses the **Karvonen Formula** to calculate personalized zone boundaries based on Max Heart Rate and Resting Heart Rate.

### Target Platform
- iOS (iPhone with Apple Watch)
- React Native with TypeScript

---

## Core Features

### 1. Heart Rate Zone Calculation (Karvonen Formula)
- **Formula**: THR = Resting HR + (Intensity % x Heart Rate Reserve)
- **Heart Rate Reserve (HRR)** = Max HR - Resting HR
- Five zones with fixed intensity percentages:
  - Zone 1 (Recovery): 50-60%
  - Zone 2 (Aerobic Base): 60-70%
  - Zone 3 (Tempo): 70-80%
  - Zone 4 (Threshold): 80-90%
  - Zone 5 (VO2 Max): 90-100%

### 2. Automatic Waking Heart Rate (Resting HR)
- **Source**: Apple Watch sleep tracking data via HealthKit
- **Method (Option A - Sleep-aware)**:
  1. Query `HKCategoryTypeIdentifierSleepAnalysis` to determine when the user woke up
  2. Query `HKQuantityTypeIdentifierHeartRate` samples in a 10-minute window around wake time
  3. Use the **lowest reading** from that window as the waking heart rate
  4. Fallback: If no sleep data available, query lowest HR from 4:00-7:00 AM
- **Daily Update**: A new resting HR is obtained each day and used for that day's zone calculations
- **Locking**: Once a day is completed, the resting HR and zone time data for that day are **locked** and will not retroactively change when a new resting HR is obtained
- **Manual Override**: Users can still manually set resting HR in Settings

### 3. HealthKit Integration
- **Permissions requested**:
  - `HKQuantityTypeIdentifierHeartRate` (read)
  - `HKWorkoutTypeIdentifier` (read)
  - `HKCategoryTypeIdentifierSleepAnalysis` (read)
  - `HKQuantityTypeIdentifierRestingHeartRate` (read)
- **Data flow**: Workouts fetched with associated HR samples, classified into zones using per-day resting HR

---

## Screens

### Dashboard (Tab 1)
Two sub-views toggled by Daily/Weekly buttons:

#### Daily View
- **Zone color legend** displayed **above** the stacked bar chart
- **Stacked vertical bar chart**: One bar per day (Sun-Sat), segments colored by zone
- Segment labels show time in h/m format when tall enough
- Day label and total time below each bar
- **Resting HR reading** displayed below each day's bar (in bpm)

#### Weekly View
- **"Today's Resting Heart Rate"** banner displayed above horizontal bars, showing the current day's waking HR value (or "-- bpm" if not yet available)
- **Horizontal bar chart**: One bar per zone showing weekly totals
- Goal markers shown on bars (white vertical lines)
- Bar values show minutes and goal progress (e.g., "42 min / 60 min")
- **Three totals** below the chart:
  - Total (Zone 1 and above): sum of all zone minutes
  - Total (Zone 3 and above): sum of Zone 3+ minutes
  - Combined Total (Moderate + Vigorous): (Z1+Z2) + 2x(Z3+Z4+Z5)

#### Common Elements
- Week navigation arrows (< Week Label >)
- Goals summary ("X of Y zone goals met this week")

### Trends (Tab 2)
- 12-week historical view with horizontal bars per week
- Zone filter chips to show individual zone or all zones
- Values displayed in whole minutes (e.g., "42 min")
- Below each bar:
  - "Total (Zone 1+)" left-aligned
  - "Combined (Mod+Vig)" centered

### Settings (Tab 3)
- **Max Heart Rate**: Editable, validated 60-220 bpm
- **Resting Heart Rate**: Editable, validated 40-90 bpm, must be < Max HR
  - Shows "Auto-updated from waking HR" note when HealthKit data is available
  - Manual edits are allowed as override
- **Heart Rate Reserve (HRR)**: Calculated, read-only display
- **Zone Configuration**: Read-only display of intensity percentages and calculated BPM boundaries
- **Weekly Goals**: Editable minutes per zone per week
- **Save Settings** and **Reset to Defaults** buttons

---

## Data Architecture

### State Management (Zustand + AsyncStorage)
- `settings`: maxHeartRate, restingHeartRate, zones
- `todayRestingHR`: Current day's waking HR from HealthKit
- `restingHRHistory`: Array of `{date, restingHR, locked}` records
- `weeklyData`: Processed workout data for display
- Persistence via AsyncStorage for settings and resting HR history

### Per-Day Zone Calculation
- Each day's zone boundaries are calculated using **that day's resting HR**
- Historical days use their stored resting HR (locked values)
- Current day uses the latest waking HR
- If no waking HR is available for a day, falls back to the stored settings value

### Types
- `DailyZoneData` includes `restingHR?: number` to track which resting HR was used
- `DailyRestingHR`: `{date: string, restingHR: number, locked: boolean}`

---

## Technical Stack
- React Native (TypeScript)
- `@kingstinct/react-native-healthkit` (Nitro modules)
- Zustand (state management)
- `@react-native-async-storage/async-storage` (persistence)
- Xcode with automatic code signing

---

## Build & Deploy
- Physical device builds bake JS bundle into app (Metro hot reload does not work)
- Must rebuild and reinstall for every code change
- `ENABLE_USER_SCRIPT_SANDBOXING = NO` required in Xcode project
- HealthKit entitlements configured in Zones.entitlements

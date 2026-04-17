import React, {useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
} from 'react-native';
import useStore from '../store/useStore';
import {
  getWeekStart,
  getWeekEnd,
  formatWeekRange,
  calculateZoneBoundaries,
  calculateZoneTime,
  aggregateZoneTime,
} from '../services/ZoneEngine';
import {getWorkoutsWithHeartRate, getWakingHeartRate} from '../services/HealthKitService';
import {DailyZoneData, WeeklyZoneData, ZoneTimeEntry} from '../types';
import {DAYS_OF_WEEK, LABEL_TOTAL_ALL_SHORT, LABEL_TOTAL_Z3_PLUS_SHORT, LABEL_COMBINED_SHORT, getLocalDateString} from '../utils/constants';

const DashboardScreen: React.FC = () => {
  const {
    settings,
    currentWeekOffset,
    viewMode,
    weeklyData,
    isLoading,
    isHealthKitAuthorized,
    todayRestingHR,
    setCurrentWeekOffset,
    setViewMode,
    setWeeklyData,
    setIsLoading,
    setTodayRestingHR,
    setDailyRestingHR,
    getRestingHRForDate,
    saveRestingHRHistory,
    loadRestingHRHistory,
  } = useStore();

  const weekStart = getWeekStart(currentWeekOffset);
  const weekEnd = getWeekEnd(weekStart);
  const weekLabel = formatWeekRange(weekStart, weekEnd);

  // Fetch today's waking heart rate on mount, backfill past week on first launch
  const fetchWakingHR = useCallback(async () => {
    if (!isHealthKitAuthorized) {
      return;
    }
    try {
      await loadRestingHRHistory();
      const today = new Date();
      const todayStr = getLocalDateString(today);

      // Backfill past 6 days — fetch waking HR for any day not yet locked in history
      const {restingHRHistory} = useStore.getState();
      const lockedDates = new Set(
        restingHRHistory.filter(d => d.locked).map(d => d.date),
      );
      for (let i = 6; i >= 1; i--) {
        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - i);
        const pastDateStr = getLocalDateString(pastDate);
        if (!lockedDates.has(pastDateStr)) {
          const pastWakingHR = await getWakingHeartRate(pastDate);
          if (pastWakingHR !== null) {
            setDailyRestingHR(pastDateStr, pastWakingHR);
          }
        }
      }

      const wakingHR = await getWakingHeartRate(today);
      if (wakingHR !== null) {
        setTodayRestingHR(wakingHR);
        setDailyRestingHR(todayStr, wakingHR);
      }
      await saveRestingHRHistory();
    } catch (error) {
      console.error('Failed to fetch waking HR:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHealthKitAuthorized]);

  useEffect(() => {
    fetchWakingHR();
  }, [fetchWakingHR]);

  const loadWeekData = useCallback(async () => {
    if (!isHealthKitAuthorized) {
      return;
    }

    setIsLoading(true);
    try {
      const workouts = await getWorkoutsWithHeartRate(weekStart, weekEnd);

      // Group heart rate samples by day
      const dailyMap: Record<string, DailyZoneData> = {};

      // Initialize all 7 days
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dateStr = getLocalDateString(day);
        const dayRestingHR = getRestingHRForDate(dateStr);
        dailyMap[dateStr] = {
          date: dateStr,
          zoneTime: settings.zones.map(z => ({zoneId: z.id, minutes: 0})),
          totalMinutes: 0,
          restingHR: dayRestingHR,
        };
      }

      // Process each workout using that day's resting HR for zone boundaries
      workouts.forEach(workout => {
        if (workout.heartRateSamples.length === 0) {
          return;
        }
        const dateStr = getLocalDateString(workout.startDate);
        if (dailyMap[dateStr]) {
          // Use the resting HR for this specific day
          const dayRestingHR = dailyMap[dateStr].restingHR || settings.restingHeartRate;
          const daySettings = {
            ...settings,
            restingHeartRate: dayRestingHR,
          };
          const boundaries = calculateZoneBoundaries(daySettings);
          const zoneTime = calculateZoneTime(
            workout.heartRateSamples,
            boundaries,
            settings.zones,
          );
          // Add to existing daily data
          zoneTime.forEach(entry => {
            const existing = dailyMap[dateStr].zoneTime.find(
              e => e.zoneId === entry.zoneId,
            );
            if (existing) {
              existing.minutes += entry.minutes;
            }
          });
          dailyMap[dateStr].totalMinutes = dailyMap[dateStr].zoneTime.reduce(
            (sum, e) => sum + e.minutes,
            0,
          );
        }
      });

      const dailyData = Object.values(dailyMap).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      const weeklyTotals = aggregateZoneTime(
        dailyData.map(d => d.zoneTime),
        settings.zones,
      );

      const weekly: WeeklyZoneData = {
        weekStart: getLocalDateString(weekStart),
        weekEnd: getLocalDateString(weekEnd),
        dailyData,
        weeklyTotals,
        totalMinutes: weeklyTotals.reduce((sum, e) => sum + e.minutes, 0),
      };

      setWeeklyData(weekly);
      setIsLoading(false);
    } catch (error) {
      console.error('Dashboard: Failed to load week data:', error);
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekOffset, settings, isHealthKitAuthorized]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  // Refresh data when app returns to foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        fetchWakingHR();
        loadWeekData();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [fetchWakingHR, loadWeekData]);

  const navigateWeek = (direction: number) => {
    setCurrentWeekOffset(currentWeekOffset + direction);
  };

  const formatMinutes = (mins: number): string => {
    if (mins < 1) {
      return `${Math.round(mins * 60)}s`;
    }
    const hours = Math.floor(mins / 60);
    const remaining = Math.round(mins % 60);
    if (hours > 0) {
      return `${hours}h ${remaining}m`;
    }
    return `${remaining}m`;
  };

  const formatMins = (mins: number): string => {
    return `${Math.round(mins)} min`;
  };

  const getZoneById = (zoneId: number) =>
    settings.zones.find(z => z.id === zoneId);

  const maxDailyMinutes = weeklyData
    ? Math.max(...weeklyData.dailyData.map(d => d.totalMinutes), 1)
    : 1;

  const maxWeeklyMinutes = weeklyData
    ? Math.max(...weeklyData.weeklyTotals.map(e => e.minutes), 1)
    : 1;

  // Count goals met
  const goalsMet = weeklyData
    ? settings.zones.filter(zone => {
        const total = weeklyData.weeklyTotals.find(
          e => e.zoneId === zone.id,
        );
        return zone.goalMinutes && total && total.minutes >= zone.goalMinutes;
      }).length
    : 0;

  const goalsSet = settings.zones.filter(z => z.goalMinutes).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => navigateWeek(-1)}
          style={styles.navButton}>
          <Text style={styles.navArrow}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity
          onPress={() => navigateWeek(1)}
          style={styles.navButton}>
          <Text style={styles.navArrow}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* Goals Summary */}
      {goalsSet > 0 && weeklyData && (
        <View style={styles.goalsSummary}>
          <Text style={styles.goalsSummaryText}>
            {goalsMet} of {goalsSet} zone goals met this week
          </Text>
        </View>
      )}

      {/* View Mode Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'daily' && styles.toggleActive,
          ]}
          onPress={() => setViewMode('daily')}>
          <Text
            style={[
              styles.toggleText,
              viewMode === 'daily' && styles.toggleTextActive,
            ]}>
            Daily
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'weekly' && styles.toggleActive,
          ]}
          onPress={() => setViewMode('weekly')}>
          <Text
            style={[
              styles.toggleText,
              viewMode === 'weekly' && styles.toggleTextActive,
            ]}>
            Weekly
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : !isHealthKitAuthorized ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            HealthKit access is required to display your workout data.
          </Text>
          <Text style={styles.emptySubtext}>
            Please grant access in Settings.
          </Text>
        </View>
      ) : !weeklyData ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No workout data for this week.</Text>
        </View>
      ) : viewMode === 'daily' ? (
        /* Mode A: Daily Breakdown - Stacked Bar Chart */
        <View style={styles.chartContainer}>
          {/* Zone Legend - above chart */}
          <View style={styles.legend}>
            {settings.zones.map(zone => (
              <View key={zone.id} style={styles.legendItem}>
                <View
                  style={[styles.legendDot, {backgroundColor: zone.color}]}
                />
                <Text style={styles.legendText}>Zone {zone.id}</Text>
              </View>
            ))}
          </View>

          {/* Bars + totals */}
          <View style={styles.barChart}>
            {weeklyData.dailyData.map((day, index) => (
              <View key={day.date} style={styles.barColumn}>
                <View style={styles.barWrapper}>
                  {day.zoneTime
                    .slice()
                    .reverse()
                    .map(entry => {
                      const zone = getZoneById(entry.zoneId);
                      if (!zone || entry.minutes === 0) {
                        return null;
                      }
                      const height =
                        (entry.minutes / maxDailyMinutes) * 200;
                      return (
                        <View
                          key={entry.zoneId}
                          style={[
                            styles.barSegment,
                            {
                              height,
                              backgroundColor: zone.color,
                              justifyContent: 'center',
                              alignItems: 'center',
                            },
                          ]}>
                          {height >= 16 && (
                            <Text style={styles.segmentLabel}>
                              {formatMinutes(entry.minutes)}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                </View>
                <Text style={styles.barValue}>
                  {day.totalMinutes > 0 ? formatMinutes(day.totalMinutes) : ' '}
                </Text>
              </View>
            ))}
          </View>

          {/* Separator */}
          <View style={styles.dailySeparator} />

          {/* Day labels row */}
          <View style={styles.dayLabelRow}>
            {weeklyData.dailyData.map((day, index) => (
              <View key={day.date} style={styles.dayLabelColumn}>
                <Text style={styles.barLabel}>{DAYS_OF_WEEK[index]}</Text>
              </View>
            ))}
          </View>

          {/* Separator */}
          <View style={styles.dailySeparator} />

          {/* Resting HR row */}
          <View style={styles.dayLabelRow}>
            {weeklyData.dailyData.map(day => (
              <View key={day.date} style={styles.dayLabelColumn}>
                <Text style={styles.dailyRestingHR}>
                  {day.date <= getLocalDateString() && day.restingHR
                    ? `${day.restingHR}`
                    : ' '}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.restingHRAxisLabel}>Resting HR (bpm)</Text>
        </View>
      ) : (
        /* Mode B: Weekly Zone Totals - Horizontal Bars */
        <View style={styles.chartContainer}>
          {weeklyData.weeklyTotals.map(entry => {
            const zone = getZoneById(entry.zoneId);
            if (!zone) {
              return null;
            }
            const barWidth = (entry.minutes / maxWeeklyMinutes) * 100;
            const goalProgress =
              zone.goalMinutes && zone.goalMinutes > 0
                ? (entry.minutes / zone.goalMinutes) * 100
                : null;

            return (
              <View key={entry.zoneId} style={styles.horizontalBarRow}>
                <View style={styles.horizontalBarLabel}>
                  <View
                    style={[
                      styles.legendDot,
                      {backgroundColor: zone.color},
                    ]}
                  />
                  <Text style={styles.horizontalBarName}>Zone {zone.id}</Text>
                </View>
                <View style={styles.horizontalBarTrack}>
                  <View
                    style={[
                      styles.horizontalBar,
                      {
                        width: `${Math.min(barWidth, 100)}%`,
                        backgroundColor: zone.color,
                      },
                    ]}
                  />
                  {zone.goalMinutes && zone.goalMinutes > 0 && (
                    <View
                      style={[
                        styles.goalMarker,
                        {
                          left: `${Math.min(
                            (zone.goalMinutes / maxWeeklyMinutes) * 100,
                            100,
                          )}%`,
                        },
                      ]}
                    />
                  )}
                </View>
                <Text style={styles.horizontalBarValue}>
                  {formatMins(entry.minutes)}
                  {zone.goalMinutes
                    ? ` / ${formatMins(zone.goalMinutes)}`
                    : ''}
                </Text>
              </View>
            );
          })}

          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{LABEL_TOTAL_ALL_SHORT}</Text>
              <Text style={styles.totalValue}>
                {formatMins(weeklyData.weeklyTotals.reduce((sum, e) => sum + e.minutes, 0))}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{LABEL_TOTAL_Z3_PLUS_SHORT}</Text>
              <Text style={styles.totalValue}>
                {formatMins(
                  weeklyData.weeklyTotals
                    .filter(e => e.zoneId >= 3)
                    .reduce((sum, e) => sum + e.minutes, 0)
                )}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{LABEL_COMBINED_SHORT}</Text>
              <Text style={styles.totalValue}>
                {formatMins(
                  weeklyData.weeklyTotals
                    .filter(e => e.zoneId <= 2)
                    .reduce((sum, e) => sum + e.minutes, 0) +
                  2 * weeklyData.weeklyTotals
                    .filter(e => e.zoneId >= 3)
                    .reduce((sum, e) => sum + e.minutes, 0)
                )}
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  contentContainer: {
    flexGrow: 1,
  },
  weekNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  navButton: {
    padding: 8,
  },
  navArrow: {
    fontSize: 24,
    color: '#94A3B8',
    fontWeight: '600',
  },
  weekLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  goalsSummary: {
    backgroundColor: '#1E293B',
    marginHorizontal: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  goalsSummaryText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleActive: {
    backgroundColor: '#334155',
  },
  toggleText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#F1F5F9',
  },
  loader: {
    marginTop: 60,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  chartContainer: {
    paddingHorizontal: 20,
    flex: 1,
    justifyContent: 'center',
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    alignSelf: 'center',
    width: '100%',
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    width: 30,
    height: 200,
    justifyContent: 'flex-end',
  },
  barSegment: {
    width: '100%',
    borderRadius: 2,
  },
  segmentLabel: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  barLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  barValue: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  dayLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayLabelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  dailySeparator: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 6,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  horizontalBarRow: {
    marginBottom: 16,
  },
  horizontalBarLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  horizontalBarName: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '500',
  },
  horizontalBarTrack: {
    height: 28,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  horizontalBar: {
    height: '100%',
    borderRadius: 6,
    opacity: 0.85,
  },
  goalMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#F1F5F9',
  },
  horizontalBarValue: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  totalsSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  totalValue: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  dailyRestingHR: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '500',
  },
  restingHRAxisLabel: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  restingHRBanner: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restingHRBannerLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  restingHRBannerValue: {
    color: '#3B82F6',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default DashboardScreen;

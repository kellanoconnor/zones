import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
import {getWorkoutsWithHeartRate} from '../services/HealthKitService';
import {WeeklyZoneData, ZoneTimeEntry} from '../types';

const WEEKS_TO_SHOW = 12;

interface WeekSummary {
  weekOffset: number;
  label: string;
  totals: ZoneTimeEntry[];
  totalMinutes: number;
}

const TrendsScreen: React.FC = () => {
  const {settings, isHealthKitAuthorized} = useStore();
  const [weekSummaries, setWeekSummaries] = useState<WeekSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<number | null>(
    null,
  );

  const loadTrends = useCallback(async () => {
    if (!isHealthKitAuthorized) {
      return;
    }

    setIsLoading(true);
    try {
      const boundaries = calculateZoneBoundaries(settings);
      const summaries: WeekSummary[] = [];

      for (let offset = 0; offset > -WEEKS_TO_SHOW; offset--) {
        const weekStart = getWeekStart(offset);
        const weekEnd = getWeekEnd(weekStart);

        const workouts = await getWorkoutsWithHeartRate(weekStart, weekEnd);

        const allZoneTimes: ZoneTimeEntry[][] = [];
        workouts.forEach(workout => {
          if (workout.heartRateSamples.length > 0) {
            const zoneTime = calculateZoneTime(
              workout.heartRateSamples,
              boundaries,
              settings.zones,
            );
            allZoneTimes.push(zoneTime);
          }
        });

        const totals = aggregateZoneTime(allZoneTimes, settings.zones);
        const totalMinutes = totals.reduce((sum, e) => sum + e.minutes, 0);

        summaries.push({
          weekOffset: offset,
          label: formatWeekRange(weekStart, weekEnd),
          totals,
          totalMinutes,
        });
      }

      setWeekSummaries(summaries);
    } catch (error) {
      console.error('Failed to load trends:', error);
    } finally {
      setIsLoading(false);
    }
  }, [settings, isHealthKitAuthorized]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

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

  const getZoneById = (zoneId: number) =>
    settings.zones.find(z => z.id === zoneId);

  const maxTotalMinutes = Math.max(
    ...weekSummaries.map(w => {
      if (selectedZoneFilter !== null) {
        const entry = w.totals.find(e => e.zoneId === selectedZoneFilter);
        return entry ? entry.minutes : 0;
      }
      return w.totalMinutes;
    }),
    1,
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Trends</Text>
      <Text style={styles.subtitle}>Last {WEEKS_TO_SHOW} weeks</Text>

      {/* Zone Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedZoneFilter === null && styles.filterChipActive,
          ]}
          onPress={() => setSelectedZoneFilter(null)}>
          <Text
            style={[
              styles.filterText,
              selectedZoneFilter === null && styles.filterTextActive,
            ]}>
            All Zones
          </Text>
        </TouchableOpacity>
        {settings.zones.map(zone => (
          <TouchableOpacity
            key={zone.id}
            style={[
              styles.filterChip,
              selectedZoneFilter === zone.id && styles.filterChipActive,
              selectedZoneFilter === zone.id && {
                backgroundColor: zone.color + '33',
                borderColor: zone.color,
              },
            ]}
            onPress={() => setSelectedZoneFilter(zone.id)}>
            <View
              style={[styles.filterDot, {backgroundColor: zone.color}]}
            />
            <Text
              style={[
                styles.filterText,
                selectedZoneFilter === zone.id && styles.filterTextActive,
              ]}>
              {zone.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : !isHealthKitAuthorized ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            HealthKit access is required to display trends.
          </Text>
        </View>
      ) : (
        /* Trend Bars */
        <View style={styles.trendContainer}>
          {weekSummaries.map(week => {
            const displayMinutes =
              selectedZoneFilter !== null
                ? week.totals.find(e => e.zoneId === selectedZoneFilter)
                    ?.minutes || 0
                : week.totalMinutes;

            const barWidth = (displayMinutes / maxTotalMinutes) * 100;

            return (
              <View key={week.weekOffset} style={styles.trendRow}>
                <Text style={styles.trendLabel} numberOfLines={1}>
                  {week.label}
                </Text>
                <View style={styles.trendBarTrack}>
                  {selectedZoneFilter !== null ? (
                    <View
                      style={[
                        styles.trendBar,
                        {
                          width: `${Math.min(barWidth, 100)}%`,
                          backgroundColor:
                            getZoneById(selectedZoneFilter)?.color || '#94A3B8',
                        },
                      ]}
                    />
                  ) : (
                    /* Stacked bar for all zones */
                    <View style={styles.trendBarStacked}>
                      {week.totals.map(entry => {
                        const zone = getZoneById(entry.zoneId);
                        if (!zone || entry.minutes === 0) {
                          return null;
                        }
                        const segmentWidth =
                          (entry.minutes / maxTotalMinutes) * 100;
                        return (
                          <View
                            key={entry.zoneId}
                            style={[
                              styles.trendBarSegment,
                              {
                                width: `${segmentWidth}%`,
                                backgroundColor: zone.color,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
                <Text style={styles.trendValue}>
                  {formatMinutes(displayMinutes)}
                </Text>
              </View>
            );
          })}
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F1F5F9',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
  },
  filterContainer: {
    marginBottom: 20,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
    marginRight: 8,
  },
  filterChipActive: {
    borderColor: '#94A3B8',
    backgroundColor: '#334155',
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  filterText: {
    color: '#64748B',
    fontSize: 13,
  },
  filterTextActive: {
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
  trendContainer: {
    paddingHorizontal: 20,
  },
  trendRow: {
    marginBottom: 14,
  },
  trendLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  trendBarTrack: {
    height: 24,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    overflow: 'hidden',
  },
  trendBar: {
    height: '100%',
    borderRadius: 6,
    opacity: 0.85,
  },
  trendBarStacked: {
    flexDirection: 'row',
    height: '100%',
  },
  trendBarSegment: {
    height: '100%',
  },
  trendValue: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
});

export default TrendsScreen;

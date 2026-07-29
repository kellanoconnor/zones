import React, {useEffect, useCallback, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
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
import {DailyZoneData} from '../types';
import {DAYS_OF_WEEK, getLocalDateString} from '../utils/constants';
import {T, zoneColor} from '../utils/theme';

// ─── Main component ──────────────────────────────────────────────────────────
const DashboardScreen: React.FC = () => {
  const {
    settings,
    currentWeekOffset,
    weeklyData,
    isLoading,
    isHealthKitAuthorized,
    setCurrentWeekOffset,
    setWeeklyData,
    setIsLoading,
    setTodayRestingHR,
    setDailyRestingHR,
    clearDailyRestingHR,
    getRestingHRForDate,
    saveRestingHRHistory,
    loadRestingHRHistory,
    loadSettingsSnapshots,
    getSettingsSnapshotForDate,
  } = useStore();

  // Memoize so the Date refs are stable across renders. Without this,
  // each render produces new Dates -> useCallback dep change ->
  // loadWeekData identity churn -> useEffect refires -> infinite spinner.
  const {weekStart, weekEnd, weekLabel} = useMemo(() => {
    const ws = getWeekStart(currentWeekOffset);
    const we = getWeekEnd(ws);
    return {weekStart: ws, weekEnd: we, weekLabel: formatWeekRange(ws, we)};
  }, [currentWeekOffset]);

  // Fetch today's waking HR and backfill any unlocked past 6 days. The
  // store's setTodayRestingHR also pushes the value into settings, which
  // re-triggers loadWeekData with up-to-date zone boundaries.
  const fetchWakingHR = useCallback(async () => {
    if (!isHealthKitAuthorized) return;
    try {
      await loadRestingHRHistory();
      const today = new Date();
      const todayStr = getLocalDateString(today);
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
          if (pastWakingHR !== null) setDailyRestingHR(pastDateStr, pastWakingHR);
        }
      }
      const wakingHR = await getWakingHeartRate(today);
      if (wakingHR !== null) {
        setTodayRestingHR(wakingHR);
        setDailyRestingHR(todayStr, wakingHR);
      } else {
        // No reliable waking HR for today (e.g. watch not worn overnight).
        // Clear any stale entry (including one written by the old 4-7 AM
        // fallback) and pull the prior day's value into today's display.
        clearDailyRestingHR(todayStr);
        setTodayRestingHR(getRestingHRForDate(todayStr));
      }
      await saveRestingHRHistory();
    } catch (e) {
      console.error('Failed to fetch waking HR:', e);
    }
    // Store actions are stable refs; only auth gates the work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHealthKitAuthorized]);

  useEffect(() => {
    fetchWakingHR();
  }, [fetchWakingHR]);

  const loadWeekData = useCallback(async () => {
    if (!isHealthKitAuthorized) return;
    setIsLoading(true);
    try {
      // Make sure persisted snapshots are loaded before any per-day
      // lookups; otherwise the first lookup on app start would build
      // and lock new snapshots that already existed on disk.
      await loadSettingsSnapshots();
      const fetched = await getWorkoutsWithHeartRate(weekStart, weekEnd);
      const dailyMap: Record<string, DailyZoneData> = {};
      // Build per-day snapshots up front so each day uses its own
      // locked-in resting HR / max HR / zone bounds — independent of
      // current settings.
      const snapshotByDate: Record<string, ReturnType<typeof getSettingsSnapshotForDate>> = {};
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dateStr = getLocalDateString(day);
        const snap = getSettingsSnapshotForDate(dateStr);
        snapshotByDate[dateStr] = snap;
        dailyMap[dateStr] = {
          date: dateStr,
          zoneTime: snap.zones.map(z => ({zoneId: z.id, minutes: 0})),
          totalMinutes: 0,
          restingHR: snap.restingHR,
        };
      }
      fetched.forEach(workout => {
        if (workout.heartRateSamples.length === 0) return;
        const dateStr = getLocalDateString(workout.startDate);
        const snap = snapshotByDate[dateStr];
        if (dailyMap[dateStr] && snap) {
          const dayBoundaries = calculateZoneBoundaries({
            maxHeartRate: snap.maxHeartRate,
            restingHeartRate: snap.restingHR,
            zones: snap.zones,
          });
          const zoneTime = calculateZoneTime(
            workout.heartRateSamples,
            dayBoundaries,
            snap.zones,
          );
          zoneTime.forEach(entry => {
            const ex = dailyMap[dateStr].zoneTime.find(e => e.zoneId === entry.zoneId);
            if (ex) ex.minutes += entry.minutes;
          });
          dailyMap[dateStr].totalMinutes = dailyMap[dateStr].zoneTime.reduce(
            (s, e) => s + e.minutes, 0,
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
      setWeeklyData({
        weekStart: getLocalDateString(weekStart),
        weekEnd: getLocalDateString(weekEnd),
        dailyData,
        weeklyTotals,
        totalMinutes: weeklyTotals.reduce((s, e) => s + e.minutes, 0),
      });
    } catch (e) {
      console.error('Failed to load week data:', e);
    } finally {
      setIsLoading(false);
    }
    // Zustand actions are stable references; deps intentionally omit them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekOffset, settings, isHealthKitAuthorized, weekStart, weekEnd]);

  useEffect(() => { loadWeekData(); }, [loadWeekData]);

  // Refresh on app foreground so a workout that finished while the app
  // was backgrounded shows up without a manual reload.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        next === 'active'
      ) {
        fetchWakingHR();
        loadWeekData();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [fetchWakingHR, loadWeekData]);

  const fmt = (mins: number): string => {
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const weeklyTotals = weeklyData?.weeklyTotals ?? [];
  const zone1Plus = weeklyTotals.reduce((s, e) => s + e.minutes, 0);
  const zone1to2 = weeklyTotals
    .filter(e => e.zoneId <= 2)
    .reduce((s, e) => s + e.minutes, 0);
  const zone3Plus = weeklyTotals
    .filter(e => e.zoneId >= 3)
    .reduce((s, e) => s + e.minutes, 0);
  // MOD + VIG = (Z1+Z2) + 2*(Z3+Z4+Z5) — moderate counts 1×, vigorous 2×.
  const modVig = zone1to2 + 2 * zone3Plus;
  const maxDailyMins = weeklyData
    ? Math.max(...weeklyData.dailyData.map(d => d.totalMinutes), 1)
    : 1;
  // Per-zone weekly bar: scale to 100 min by default, expand to 150 if any
  // zone exceeds 100. Anything above the cap saturates the bar.
  const peakZoneMins = weeklyTotals.length
    ? Math.max(...weeklyTotals.map(e => e.minutes), 0)
    : 0;
  const barScaleMax = peakZoneMins > 100 ? 150 : 100;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setCurrentWeekOffset(currentWeekOffset - 1)} style={styles.navBtn}>
          <Text style={styles.navChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => setCurrentWeekOffset(currentWeekOffset + 1)} style={styles.navBtn}>
          <Text style={styles.navChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={T.accent} style={{marginTop: 60}} />
      ) : !isHealthKitAuthorized ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>HealthKit access required</Text>
          <Text style={styles.emptyBody}>Please grant access in Settings.</Text>
        </View>
      ) : !weeklyData ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No workout data this week</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* ── Weekly V3 ── */}
          <View style={styles.weeklyStats}>
            {[
              {label: 'Z1+', val: zone1Plus},
              {label: 'Z3+', val: zone3Plus},
              {label: 'Mod+Vig', val: modVig},
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={styles.statDivider} />}
                <View style={{flex: 1}}>
                  <Text style={styles.sectionLabel}>{s.label}</Text>
                  <Text style={styles.weeklyStatNum}>
                    {s.val > 0 ? (
                      <>
                        {Math.round(s.val)}
                        <Text style={styles.weeklyStatUnit}> m</Text>
                      </>
                    ) : (
                      '—'
                    )}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Day-by-day stacked columns */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>By day</Text>
              <Text style={{fontSize: 10, color: T.text.tertiary}}>min</Text>
            </View>
            <WeeklyColumns
              dailyData={weeklyData.dailyData}
              maxDailyMins={maxDailyMins}
              fallbackRestingHR={settings.restingHeartRate}
            />
          </View>

          {/* Zone legend */}
          <View style={styles.zoneLegend}>
            {settings.zones.map(z => (
              <View key={z.id} style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                <View style={[styles.dot, {width: 7, height: 7, backgroundColor: zoneColor(z.id)}]} />
                <Text style={{fontSize: 11, color: T.text.tertiary}}>Z{z.id}</Text>
              </View>
            ))}
          </View>

          {/* Per-zone weekly totals */}
          <Text style={styles.subSectionLabel}>By zone · week total</Text>
          {weeklyTotals.map(entry => {
            const zone = settings.zones.find(z => z.id === entry.zoneId);
            if (!zone) return null;
            const pct = (entry.minutes / barScaleMax) * 100;
            return (
              <View key={entry.zoneId} style={{marginBottom: 14}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, justifyContent: 'space-between'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                    <View style={[styles.dot, {backgroundColor: zoneColor(entry.zoneId)}]} />
                    <Text style={{fontSize: 13, color: T.text.primary, fontWeight: '500'}}>Zone {entry.zoneId}</Text>
                  </View>
                  <Text style={{fontSize: 13, color: entry.minutes > 0 ? T.text.primary : T.text.tertiary}}>
                    {entry.minutes > 0 ? fmt(entry.minutes) : '—'}
                  </Text>
                </View>
                <View style={{height: 8, backgroundColor: T.bg.track, borderRadius: 4, overflow: 'hidden', position: 'relative'}}>
                  <View style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: '100%',
                    backgroundColor: zoneColor(entry.zoneId),
                    borderRadius: 4,
                  }} />
                  {/* 100-min reference tick when bars scale to 150 */}
                  {barScaleMax > 100 && (
                    <View style={{
                      position: 'absolute',
                      left: `${(100 / barScaleMax) * 100}%`,
                      top: -2,
                      bottom: -2,
                      width: 1,
                      backgroundColor: T.text.tertiary,
                    }} />
                  )}
                </View>
              </View>
            );
          })}
          {/* Bar-scale reference label */}
          {weeklyTotals.length > 0 && (
            <View style={{height: 18, marginTop: 4, position: 'relative'}}>
              {barScaleMax > 100 ? (
                <Text style={{
                  position: 'absolute',
                  left: `${(100 / barScaleMax) * 100}%`,
                  top: 0,
                  fontSize: 10,
                  color: T.text.tertiary,
                  transform: [{translateX: -18}],
                }}>
                  100 min
                </Text>
              ) : (
                <Text style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  fontSize: 10,
                  color: T.text.tertiary,
                }}>
                  100 min
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

// ─── Weekly column chart ─────────────────────────────────────────────────────
const BAR_H = 160;

function WeeklyColumns({
  dailyData,
  maxDailyMins,
  fallbackRestingHR,
}: {
  dailyData: DailyZoneData[];
  maxDailyMins: number;
  fallbackRestingHR: number;
}) {
  return (
    <View>
      {/* Bar row. Gridlines are absolutely-positioned siblings so they
          span the full row width, behind the bars. */}
      <View style={{height: BAR_H + 16, flexDirection: 'row', gap: 6, alignItems: 'flex-end', position: 'relative'}}>
        {[0.25, 0.5, 0.75].map(p => (
          <View
            key={p}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              bottom: BAR_H * p,
              height: 1,
              backgroundColor: T.bg.line,
            }}
          />
        ))}

        {dailyData.map(day => {
          // Pre-compute each segment's pixel height + bottom offset so we
          // can position them with absolute layout. flexDirection
          // column-reverse interacted poorly with the parent's
          // alignItems:center (collapsed width to 0 → nothing rendered).
          const segments: {zoneId: number; bottom: number; height: number; minutes: number}[] = [];
          let cursor = 0;
          day.zoneTime.forEach(entry => {
            if (entry.minutes <= 0) return;
            const h = (entry.minutes / maxDailyMins) * BAR_H;
            segments.push({zoneId: entry.zoneId, bottom: cursor, height: h, minutes: entry.minutes});
            cursor += h;
          });
          return (
            <View key={day.date} style={{flex: 1}}>
              {/* Total label above the bar (with breathing room) */}
              <View style={{height: 14, justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6}}>
                {day.totalMinutes > 0 && (
                  <Text style={{fontSize: 10, color: T.text.secondary}}>
                    {Math.round(day.totalMinutes)}
                  </Text>
                )}
              </View>
              {/* Bar container */}
              <View style={{height: BAR_H, position: 'relative', borderRadius: 4, overflow: 'hidden'}}>
                {/* Empty-day track */}
                {day.totalMinutes === 0 && (
                  <View style={{
                    position: 'absolute',
                    left: 0, right: 0, top: 0, bottom: 0,
                    backgroundColor: T.bg.track,
                    opacity: 0.4,
                  }} />
                )}
                {/* Stacked color-coded zone segments, bottom-up. Per-segment
                    minute label rendered when the segment is tall enough to
                    fit it (≥ ~14 px for a 9 px font). */}
                {segments.map(seg => (
                  <View
                    key={seg.zoneId}
                    style={{
                      position: 'absolute',
                      left: 0, right: 0,
                      bottom: seg.bottom,
                      height: seg.height,
                      backgroundColor: zoneColor(seg.zoneId),
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                    {seg.height >= 14 && (
                      <Text style={{
                        fontSize: 9,
                        color: T.bg.page,
                        fontWeight: '700',
                      }}>
                        {Math.round(seg.minutes)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {/* Day labels under the bars */}
      <View style={{flexDirection: 'row', gap: 6, marginTop: 4}}>
        {dailyData.map((day, i) => (
          <View key={day.date} style={{flex: 1, alignItems: 'center'}}>
            <Text style={{fontSize: 11, color: T.text.tertiary}}>
              {DAYS_OF_WEEK[i]?.[0] ?? ''}
            </Text>
          </View>
        ))}
      </View>

      {/* Resting HR row */}
      <View style={{
        flexDirection: 'row',
        gap: 6,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: T.bg.line,
      }}>
        {dailyData.map(day => {
          const show = day.totalMinutes > 0;
          const hr = day.restingHR ?? fallbackRestingHR;
          return (
            <View key={day.date} style={{flex: 1, alignItems: 'center'}}>
              <Text style={{
                fontSize: 12,
                fontWeight: '600',
                color: show ? T.accent : T.text.quat,
              }}>
                {show ? hr : '–'}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{
        textAlign: 'center',
        fontSize: 9,
        color: T.text.tertiary,
        letterSpacing: 1,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginTop: 4,
      }}>
        Resting HR
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: T.bg.page},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
  },
  navBtn: {padding: 8},
  navChevron: {fontSize: 38, color: T.text.secondary, lineHeight: 40, fontWeight: '300'},
  weekLabel: {fontSize: 19, fontWeight: '400', color: T.text.primary, letterSpacing: -0.2},
  scrollContent: {paddingHorizontal: 16, paddingBottom: 40},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40},
  emptyTitle: {color: T.text.secondary, fontSize: 16, textAlign: 'center'},
  emptyBody: {color: T.text.tertiary, fontSize: 14, textAlign: 'center', marginTop: 6},

  sectionLabel: {
    fontSize: 11,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Card (used for the day-by-day chart)
  card: {
    backgroundColor: T.bg.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: T.bg.line,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  dot: {width: 10, height: 10, borderRadius: 5, flexShrink: 0},

  // Weekly stats header
  weeklyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  statDivider: {width: 1, height: 36, backgroundColor: T.bg.line, marginHorizontal: 12},
  weeklyStatNum: {fontSize: 28, fontWeight: '500', color: T.text.primary, letterSpacing: -0.5, marginTop: 4},
  weeklyStatUnit: {fontSize: 14, fontWeight: '400', color: T.text.tertiary, letterSpacing: 0},
  zoneLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 10,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  subSectionLabel: {
    fontSize: 11,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});

export default DashboardScreen;

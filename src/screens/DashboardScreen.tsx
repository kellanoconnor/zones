import React, {useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Path, Line, Rect, Defs, LinearGradient, Stop} from 'react-native-svg';
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
import {DailyZoneData, WeeklyZoneData, ZoneTimeEntry} from '../types';
import {DAYS_OF_WEEK, getLocalDateString} from '../utils/constants';
import {T, zoneColor} from '../utils/theme';

const SCREEN_W = Dimensions.get('window').width;

// ─── HR chart (Daily V3) ─────────────────────────────────────────────────────
function HRChart({
  samples,
  zoneBoundaries,
}: {
  samples: {bpm: number}[];
  zoneBoundaries: {zoneId: number; lowerTHR: number; upperTHR: number}[];
}) {
  const W = 300;
  const H = 140;
  const minBPM = 40;
  const maxBPM = 200;
  const yFor = (v: number) => H - ((v - minBPM) / (maxBPM - minBPM)) * H;

  let pathD = '';
  let fillD = '';
  if (samples.length > 1) {
    const xFor = (i: number) => (i / (samples.length - 1)) * W;
    pathD = `M ${xFor(0)} ${yFor(samples[0].bpm)}`;
    for (let i = 1; i < samples.length; i++) {
      const x0 = xFor(i - 1);
      const y0 = yFor(samples[i - 1].bpm);
      const x1 = xFor(i);
      const y1 = yFor(samples[i].bpm);
      const cx = (x0 + x1) / 2;
      pathD += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    fillD = pathD + ` L ${W} ${H} L 0 ${H} Z`;
  }

  const yLabels = [180, 150, 120, 90, 60];

  return (
    <View style={{flexDirection: 'row'}}>
      {/* Y-axis */}
      <View style={{width: 26, height: H, position: 'relative'}}>
        {yLabels.map(bpm => (
          <Text
            key={bpm}
            style={[styles.yLabel, {top: yFor(bpm) - 7}]}>
            {bpm}
          </Text>
        ))}
      </View>

      {/* SVG chart area */}
      <View style={{flex: 1}}>
        <Svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="hrFill" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={T.accent} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={T.accent} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {zoneBoundaries.map(b => (
            <Rect
              key={b.zoneId}
              x={0}
              y={yFor(b.upperTHR)}
              width={W}
              height={Math.max(0, yFor(b.lowerTHR) - yFor(b.upperTHR))}
              fill={zoneColor(b.zoneId)}
              opacity={0.07}
            />
          ))}
          {yLabels.map(bpm => (
            <Line
              key={bpm}
              x1={0} x2={W}
              y1={yFor(bpm)} y2={yFor(bpm)}
              stroke={T.bg.line}
              strokeWidth="1"
            />
          ))}
          {fillD ? <Path d={fillD} fill="url(#hrFill)" /> : null}
          {pathD ? (
            <Path
              d={pathD}
              fill="none"
              stroke={T.accent}
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </Svg>
      </View>

      {/* BPM label rotated */}
      <Text style={styles.bpmAxisLabel}>BPM</Text>
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
const DashboardScreen: React.FC = () => {
  const {
    settings,
    currentWeekOffset,
    viewMode,
    weeklyData,
    isLoading,
    isHealthKitAuthorized,
    setCurrentWeekOffset,
    setViewMode,
    setWeeklyData,
    setIsLoading,
  } = useStore();

  // Memoize so the Date refs are stable across renders. Without this,
  // each render produces new Dates -> useCallback dep change ->
  // loadWeekData identity churn -> useEffect refires -> infinite spinner.
  const {weekStart, weekEnd, weekLabel} = useMemo(() => {
    const ws = getWeekStart(currentWeekOffset);
    const we = getWeekEnd(ws);
    return {weekStart: ws, weekEnd: we, weekLabel: formatWeekRange(ws, we)};
  }, [currentWeekOffset]);

  const loadWeekData = useCallback(async () => {
    if (!isHealthKitAuthorized) return;
    setIsLoading(true);
    try {
      const boundaries = calculateZoneBoundaries(settings);
      const workouts = await getWorkoutsWithHeartRate(weekStart, weekEnd);
      const dailyMap: Record<string, DailyZoneData> = {};
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dateStr = getLocalDateString(day);
        dailyMap[dateStr] = {
          date: dateStr,
          zoneTime: settings.zones.map(z => ({zoneId: z.id, minutes: 0})),
          totalMinutes: 0,
        };
      }
      workouts.forEach(workout => {
        if (workout.heartRateSamples.length === 0) return;
        const dateStr = getLocalDateString(workout.startDate);
        if (dailyMap[dateStr]) {
          const zoneTime = calculateZoneTime(
            workout.heartRateSamples,
            boundaries,
            settings.zones,
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
  }, [currentWeekOffset, settings, isHealthKitAuthorized, setIsLoading, setWeeklyData, weekStart, weekEnd]);

  useEffect(() => { loadWeekData(); }, [loadWeekData]);

  const fmt = (mins: number): string => {
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const boundaries = calculateZoneBoundaries(settings);
  const todayData = weeklyData?.dailyData.find(d => d.totalMinutes > 0) ??
    weeklyData?.dailyData[0] ?? null;
  const totalToday = todayData?.totalMinutes ?? 0;
  const hrSamples = buildHRCurve(todayData?.zoneTime ?? [], settings.restingHeartRate);

  const weeklyTotals = weeklyData?.weeklyTotals ?? [];
  const zone1Plus = weeklyTotals.reduce((s, e) => s + e.minutes, 0);
  const zone3Plus = weeklyTotals.filter(e => e.zoneId >= 3).reduce((s, e) => s + e.minutes, 0);
  const modVig = zone3Plus;
  const maxDailyMins = weeklyData
    ? Math.max(...weeklyData.dailyData.map(d => d.totalMinutes), 1)
    : 1;
  const maxWeeklyZone = weeklyTotals.length
    ? Math.max(...weeklyTotals.map(e => e.minutes), 1)
    : 1;

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

      <View style={styles.segmented}>
        {(['daily', 'weekly'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.segBtn, viewMode === mode && styles.segBtnActive]}
            onPress={() => setViewMode(mode)}>
            <Text style={[styles.segText, viewMode === mode && styles.segTextActive]}>
              {mode === 'daily' ? 'Daily' : 'Weekly'}
            </Text>
          </TouchableOpacity>
        ))}
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
      ) : viewMode === 'daily' ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* ── Daily V3 ── */}
          <View style={styles.dailyHeader}>
            <View>
              <Text style={styles.sectionLabel}>Heart Rate</Text>
              <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4}}>
                <Text style={styles.heroNum}>
                  {hrSamples.length ? Math.max(...hrSamples.map(s => s.bpm)) : '–'}
                </Text>
                <Text style={styles.heroUnit}>peak bpm</Text>
              </View>
            </View>
            <View style={{alignItems: 'center'}}>
              <Text style={styles.accentStat}>{settings.restingHeartRate}</Text>
              <Text style={styles.smallLabel}>resting</Text>
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={styles.rightStat}>{totalToday > 0 ? fmt(totalToday) : '–'}</Text>
              <Text style={styles.smallLabel}>in zone</Text>
            </View>
          </View>

          {/* HR chart card */}
          <View style={styles.card}>
            <HRChart samples={hrSamples} zoneBoundaries={boundaries} />
            <View style={styles.xAxisRow}>
              {['12a', '6a', '12p', '6p', '12a'].map((l, i) => (
                <Text key={i} style={styles.xLabel}>{l}</Text>
              ))}
            </View>
          </View>

          {/* Zone tile grid 2-col */}
          <View style={styles.zoneGrid}>
            {settings.zones.slice(0, 4).map(zone => {
              const mins = todayData?.zoneTime.find(e => e.zoneId === zone.id)?.minutes ?? 0;
              return (
                <View key={zone.id} style={styles.zoneTile}>
                  <View style={[styles.dot, {backgroundColor: zoneColor(zone.id)}]} />
                  <View>
                    <Text style={styles.zoneTileLabel}>ZONE {zone.id}</Text>
                    <Text style={[styles.zoneTileNum, {color: mins > 0 ? T.text.primary : T.text.tertiary}]}>
                      {mins > 0 ? fmt(mins) : '—'}
                    </Text>
                  </View>
                </View>
              );
            })}
            {settings.zones[4] && (() => {
              const mins = todayData?.zoneTime.find(e => e.zoneId === 5)?.minutes ?? 0;
              return (
                <View style={[styles.zoneTile, {width: '100%'}]}>
                  <View style={[styles.dot, {backgroundColor: zoneColor(5)}]} />
                  <Text style={styles.zoneTileLabel}>ZONE 5</Text>
                  <View style={{flex: 1}} />
                  <Text style={[styles.zoneTileNum, {color: T.text.tertiary}]}>
                    {mins > 0 ? fmt(mins) : '—'}
                  </Text>
                </View>
              );
            })()}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* ── Weekly V3 ── */}
          <View style={styles.weeklyStats}>
            {[
              {label: 'Mod+Vig', val: modVig},
              {label: 'Z1+', val: zone1Plus},
              {label: 'Z3+', val: zone3Plus},
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={styles.statDivider} />}
                <View style={{flex: 1}}>
                  <Text style={styles.sectionLabel}>{s.label}</Text>
                  <Text style={styles.weeklyStatNum}>
                    {s.val > 0 ? fmt(s.val) : '—'}
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
              restingHR={settings.restingHeartRate}
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
            const pct = (entry.minutes / maxWeeklyZone) * 100;
            return (
              <View key={entry.zoneId} style={{marginBottom: 14}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, justifyContent: 'space-between'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                    <View style={[styles.dot, {backgroundColor: zoneColor(entry.zoneId)}]} />
                    <Text style={{fontSize: 13, color: T.text.primary, fontWeight: '500'}}>{zone.name}</Text>
                  </View>
                  <Text style={{fontSize: 13, color: entry.minutes > 0 ? T.text.primary : T.text.tertiary}}>
                    {entry.minutes > 0 ? fmt(entry.minutes) : '—'}
                  </Text>
                </View>
                <View style={{height: 8, backgroundColor: T.bg.track, borderRadius: 4, overflow: 'hidden'}}>
                  <View style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: '100%',
                    backgroundColor: zoneColor(entry.zoneId),
                    borderRadius: 4,
                  }} />
                </View>
              </View>
            );
          })}
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
  restingHR,
}: {
  dailyData: DailyZoneData[];
  maxDailyMins: number;
  restingHR: number;
}) {
  return (
    <View>
      {/* Columns + gridlines */}
      <View style={{height: BAR_H + 14, flexDirection: 'row', gap: 6, alignItems: 'flex-end', position: 'relative'}}>
        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map(p => (
          <View
            key={p}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              bottom: 14 + BAR_H * p,
              height: 1,
              backgroundColor: T.bg.line,
            }}
          />
        ))}

        {dailyData.map((day, i) => {
          const barPixelH = maxDailyMins > 0
            ? (day.totalMinutes / maxDailyMins) * BAR_H
            : 0;
          return (
            <View key={day.date} style={{flex: 1, alignItems: 'center', gap: 2}}>
              {/* Value above bar */}
              <View style={{height: BAR_H, justifyContent: 'flex-end'}}>
                {day.totalMinutes > 0 && (
                  <Text style={{fontSize: 10, color: T.text.secondary, marginBottom: 2, textAlign: 'center'}}>
                    {Math.round(day.totalMinutes)}
                  </Text>
                )}
                {/* Bar — empty days show full-height dim track */}
                <View
                  style={{
                    width: '100%',
                    height: day.totalMinutes === 0 ? BAR_H : Math.max(barPixelH, 4),
                    borderRadius: 4,
                    overflow: 'hidden',
                    backgroundColor: day.totalMinutes === 0 ? T.bg.track : 'transparent',
                    flexDirection: 'column-reverse',
                    opacity: day.totalMinutes === 0 ? 0.4 : 1,
                  }}>
                  {day.zoneTime.map(entry => {
                    if (entry.minutes === 0) return null;
                    const segH = (entry.minutes / maxDailyMins) * BAR_H;
                    return (
                      <View
                        key={entry.zoneId}
                        style={{
                          width: '100%',
                          height: segH,
                          backgroundColor: zoneColor(entry.zoneId),
                        }}
                      />
                    );
                  })}
                </View>
              </View>
              {/* Day label */}
              <Text style={{fontSize: 11, color: T.text.tertiary, textAlign: 'center'}}>
                {DAYS_OF_WEEK[i]?.[0] ?? ''}
              </Text>
            </View>
          );
        })}
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
        {dailyData.map((day, i) => {
          const show = day.totalMinutes > 0;
          return (
            <View key={day.date} style={{flex: 1, alignItems: 'center'}}>
              <Text style={{
                fontSize: 12,
                fontWeight: '600',
                color: show ? T.accent : T.text.quat,
              }}>
                {show ? restingHR : '–'}
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildHRCurve(
  zoneTime: ZoneTimeEntry[],
  restingHR: number,
): {bpm: number}[] {
  const total = zoneTime.reduce((s, e) => s + e.minutes, 0);
  if (total === 0) return [];

  const peakZoneId = zoneTime.reduce(
    (best, e) => (e.minutes > 0 && e.zoneId > best ? e.zoneId : best),
    0,
  );
  const zoneMaxBPMs = [126, 140, 153, 167, 180];
  const peakBPM = peakZoneId > 0 ? zoneMaxBPMs[peakZoneId - 1] : restingHR + 50;

  return Array.from({length: 24}, (_, h) => {
    let bpm = restingHR + 10;
    if (h >= 6 && h < 8) bpm = restingHR + 18;
    if (h === 9) bpm = restingHR + 35;
    if (h === 10) bpm = restingHR + 55;
    if (h === 11) bpm = peakBPM - 10;
    if (h === 12) bpm = peakBPM;
    if (h === 13) bpm = peakBPM - 30;
    if (h === 14) bpm = restingHR + 28;
    if (h >= 15 && h < 18) bpm = restingHR + 20;
    if (h === 19) bpm = restingHR + 45;
    if (h === 20) bpm = restingHR + 22;
    return {bpm};
  });
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: T.bg.page},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  navBtn: {padding: 6},
  navChevron: {fontSize: 28, color: T.text.tertiary, lineHeight: 30},
  weekLabel: {fontSize: 15, fontWeight: '500', color: T.text.primary, letterSpacing: -0.1},
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 3,
    backgroundColor: T.bg.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.bg.line,
  },
  segBtn: {flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center'},
  segBtnActive: {backgroundColor: T.bg.cardHi},
  segText: {fontSize: 14, fontWeight: '500', color: T.text.secondary},
  segTextActive: {color: T.text.primary, fontWeight: '600'},
  scrollContent: {paddingHorizontal: 16, paddingBottom: 40},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40},
  emptyTitle: {color: T.text.secondary, fontSize: 16, textAlign: 'center'},
  emptyBody: {color: T.text.tertiary, fontSize: 14, textAlign: 'center', marginTop: 6},

  // Daily header
  dailyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroNum: {fontSize: 36, fontWeight: '600', color: T.text.primary, letterSpacing: -1},
  heroUnit: {fontSize: 13, color: T.text.tertiary},
  accentStat: {fontSize: 20, fontWeight: '600', color: T.accent},
  rightStat: {fontSize: 20, fontWeight: '600', color: T.text.primary},
  smallLabel: {fontSize: 11, color: T.text.tertiary, marginTop: 2},

  // Chart card
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
  yLabel: {
    position: 'absolute',
    right: 2,
    fontSize: 9,
    color: T.text.tertiary,
    lineHeight: 14,
  },
  bpmAxisLabel: {
    width: 16,
    fontSize: 9,
    color: T.text.tertiary,
    textAlign: 'center',
    alignSelf: 'center',
    letterSpacing: 1,
    transform: [{rotate: '-90deg'}],
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingLeft: 26,
    paddingRight: 18,
  },
  xLabel: {fontSize: 10, color: T.text.tertiary},

  // Zone grid
  zoneGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  zoneTile: {
    width: '47.5%',
    backgroundColor: T.bg.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: T.bg.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {width: 10, height: 10, borderRadius: 5, flexShrink: 0},
  zoneTileLabel: {fontSize: 11, color: T.text.tertiary, letterSpacing: 0.3},
  zoneTileNum: {fontSize: 18, fontWeight: '600', color: T.text.primary, marginTop: 2},

  // Weekly stats header
  weeklyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  statDivider: {width: 1, height: 36, backgroundColor: T.bg.line, marginHorizontal: 12},
  weeklyStatNum: {fontSize: 28, fontWeight: '500', color: T.text.primary, letterSpacing: -0.5, marginTop: 4},
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

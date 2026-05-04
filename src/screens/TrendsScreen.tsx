import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Path, Line, Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
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
import {ZoneTimeEntry} from '../types';
import {T, zoneColor} from '../utils/theme';

const WEEKS_TO_SHOW = 9;

interface WeekSummary {
  weekOffset: number;
  label: string;
  totals: ZoneTimeEntry[];
  totalMinutes: number;
  modVig: number;
}

// ─── Sparkline chart ─────────────────────────────────────────────────────────
function SparklineChart({summaries}: {summaries: WeekSummary[]}) {
  const W = 300;
  const H = 110;

  const chronological = [...summaries].reverse();
  const maxMV = Math.max(...chronological.map(w => w.modVig), 1);
  const yFor = (v: number) => H - (v / maxMV) * H * 0.85 + 4;
  const xFor = (i: number) =>
    chronological.length > 1 ? (i / (chronological.length - 1)) * W : W / 2;

  let pathD = '';
  let fillD = '';
  if (chronological.length > 1) {
    pathD = `M ${xFor(0)} ${yFor(chronological[0].modVig)}`;
    for (let i = 1; i < chronological.length; i++) {
      const x0 = xFor(i - 1);
      const y0 = yFor(chronological[i - 1].modVig);
      const x1 = xFor(i);
      const y1 = yFor(chronological[i].modVig);
      const cx = (x0 + x1) / 2;
      pathD += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    fillD = pathD + ` L ${W} ${H} L 0 ${H} Z`;
  }

  const yLabels = [0, 50, 100, 150, 200].filter(v => v <= Math.ceil(maxMV / 50) * 50);

  return (
    <View style={{flexDirection: 'row', marginTop: 10}}>
      {/* Y-axis */}
      <View style={{width: 26, height: H, position: 'relative'}}>
        {yLabels.map(v => (
          <Text
            key={v}
            style={{
              position: 'absolute',
              right: 2,
              top: yFor(v) - 7,
              fontSize: 9,
              color: T.text.tertiary,
              lineHeight: 14,
            }}>
            {v}
          </Text>
        ))}
      </View>

      {/* Chart */}
      <View style={{flex: 1}}>
        <Svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0%" stopColor={T.accent} stopOpacity="0.35" />
              <Stop offset="100%" stopColor={T.accent} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {yLabels.map(v => (
            <Line
              key={v}
              x1={0} x2={W}
              y1={yFor(v)} y2={yFor(v)}
              stroke={T.bg.line}
              strokeWidth="1"
            />
          ))}
          {fillD ? <Path d={fillD} fill="url(#trendFill)" /> : null}
          {pathD ? (
            <Path
              d={pathD}
              fill="none"
              stroke={T.accent}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {chronological.map((w, i) => (
            <Circle
              key={i}
              cx={xFor(i)}
              cy={yFor(w.modVig)}
              r={i === chronological.length - 1 ? 4 : 2}
              fill={T.accent}
            />
          ))}
        </Svg>
      </View>

      {/* MIN label */}
      <Text style={styles.minAxisLabel}>MIN</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
const TrendsScreen: React.FC = () => {
  const {settings, isHealthKitAuthorized} = useStore();
  const [summaries, setSummaries] = useState<WeekSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadTrends = useCallback(async () => {
    if (!isHealthKitAuthorized) return;
    setIsLoading(true);
    try {
      const boundaries = calculateZoneBoundaries(settings);
      const results: WeekSummary[] = [];
      for (let offset = 0; offset > -WEEKS_TO_SHOW; offset--) {
        const weekStart = getWeekStart(offset);
        const weekEnd = getWeekEnd(weekStart);
        const workouts = await getWorkoutsWithHeartRate(weekStart, weekEnd);
        const allZoneTimes: ZoneTimeEntry[][] = [];
        workouts.forEach(w => {
          if (w.heartRateSamples.length > 0) {
            allZoneTimes.push(
              calculateZoneTime(w.heartRateSamples, boundaries, settings.zones),
            );
          }
        });
        const totals = aggregateZoneTime(allZoneTimes, settings.zones);
        const totalMinutes = totals.reduce((s, e) => s + e.minutes, 0);
        const modVig = totals
          .filter(e => e.zoneId >= 3)
          .reduce((s, e) => s + e.minutes, 0);
        results.push({
          weekOffset: offset,
          label: formatWeekRange(weekStart, weekEnd),
          totals,
          totalMinutes,
          modVig,
        });
      }
      setSummaries(results);
    } catch (e) {
      console.error('Failed to load trends:', e);
    } finally {
      setIsLoading(false);
    }
  }, [settings, isHealthKitAuthorized]);

  useEffect(() => { loadTrends(); }, [loadTrends]);

  const fmt = (mins: number) => {
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const avgMV =
    summaries.length > 0
      ? Math.round(summaries.reduce((s, w) => s + w.modVig, 0) / summaries.length)
      : 0;
  const bestMV = summaries.length > 0
    ? Math.max(...summaries.map(w => w.modVig))
    : 0;

  const maxTotal = Math.max(
    ...summaries.map(w => w.totalMinutes),
    1,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Title */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>Trends</Text>
        <Text style={styles.subtitle}>Last {WEEKS_TO_SHOW} weeks · Mod+Vig</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={T.accent} style={{marginTop: 60}} />
      ) : !isHealthKitAuthorized ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>HealthKit access required to display trends.</Text>
        </View>
      ) : (
        <>
          {/* Sparkline card */}
          <View style={[styles.card, {marginHorizontal: 20}]}>
            <View style={styles.chartStatRow}>
              <View>
                <Text style={styles.sectionLabel}>Avg / week</Text>
                <Text style={styles.chartBigNum}>
                  {avgMV}
                  <Text style={styles.chartUnit}> m</Text>
                </Text>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={styles.sectionLabel}>Best</Text>
                <Text style={styles.chartSmallNum}>
                  {bestMV}
                  <Text style={styles.chartUnit}> m</Text>
                </Text>
              </View>
            </View>
            <SparklineChart summaries={summaries} />
            {/* X-axis week labels */}
            <View style={styles.xAxisRow}>
              {summaries.length > 0 &&
                [0, Math.floor(summaries.length / 3), Math.floor((2 * summaries.length) / 3), summaries.length - 1].map(
                  i => (
                    <Text key={i} style={styles.xLabel}>
                      {summaries[summaries.length - 1 - i]?.label.split(' – ')[0] ?? ''}
                    </Text>
                  ),
                )}
            </View>
          </View>

          {/* Table */}
          <View style={styles.tableContainer}>
            {/* Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.colHead, {flex: 1}]}>Week</Text>
              <Text style={[styles.colHead, styles.colRight, {width: 54}]}>Z1+</Text>
              <Text style={[styles.colHead, styles.colRight, {width: 54}]}>M+V</Text>
            </View>

            {summaries.map((week, i) => (
              <View key={week.weekOffset} style={styles.tableRow}>
                <View style={{flex: 1, gap: 5}}>
                  <Text style={styles.rowLabel}>{week.label}</Text>
                  {/* Mini stacked bar */}
                  <View style={{
                    height: 3,
                    flexDirection: 'row',
                    borderRadius: 2,
                    overflow: 'hidden',
                    backgroundColor: T.bg.track,
                  }}>
                    {week.totals.map(entry => {
                      if (entry.minutes === 0) return null;
                      const w = (entry.minutes / maxTotal) * 100;
                      return (
                        <View
                          key={entry.zoneId}
                          style={{
                            width: `${w}%`,
                            height: '100%',
                            backgroundColor: zoneColor(entry.zoneId),
                          }}
                        />
                      );
                    })}
                  </View>
                </View>
                <Text style={[styles.rowNum, {width: 54, color: T.text.secondary}]}>
                  {week.totalMinutes > 0 ? fmt(week.totalMinutes) : '—'}
                </Text>
                <Text style={[styles.rowNum, {width: 54, fontWeight: '500'}]}>
                  {week.modVig > 0 ? fmt(week.modVig) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: T.bg.page},
  titleRow: {paddingHorizontal: 20, paddingTop: 16, marginBottom: 14},
  title: {fontSize: 32, fontWeight: '600', color: T.text.primary, letterSpacing: -1},
  subtitle: {fontSize: 13, color: T.text.tertiary, marginTop: 2},
  empty: {alignItems: 'center', marginTop: 60, paddingHorizontal: 40},
  emptyText: {color: T.text.secondary, fontSize: 16, textAlign: 'center'},

  card: {
    backgroundColor: T.bg.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: T.bg.line,
    marginBottom: 16,
  },
  chartStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chartBigNum: {
    fontSize: 26,
    fontWeight: '600',
    color: T.text.primary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  chartSmallNum: {
    fontSize: 18,
    fontWeight: '500',
    color: T.text.primary,
    marginTop: 2,
  },
  chartUnit: {fontSize: 12, color: T.text.tertiary, fontWeight: '400'},
  minAxisLabel: {
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
    paddingLeft: 28,
    paddingRight: 18,
  },
  xLabel: {fontSize: 9, color: T.text.tertiary},

  // Table
  tableContainer: {paddingHorizontal: 20, paddingBottom: 40},
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: T.bg.line,
  },
  colHead: {
    fontSize: 10,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  colRight: {textAlign: 'right'},
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: T.bg.line,
    gap: 4,
  },
  rowLabel: {fontSize: 13, color: T.text.primary},
  rowNum: {
    fontSize: 13,
    color: T.text.primary,
    textAlign: 'right',
  },
});

export default TrendsScreen;

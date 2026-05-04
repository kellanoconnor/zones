import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import useStore from '../store/useStore';
import {calculateTHR, calculateHRR, calculateZoneBoundaries} from '../services/ZoneEngine';
import {T, zoneColor} from '../utils/theme';

const ZONE_NAMES = ['Recovery', 'Aerobic Base', 'Tempo', 'Threshold', 'VO₂ Max'];

const SettingsScreen: React.FC = () => {
  const {
    settings,
    setMaxHeartRate,
    setRestingHeartRate,
    updateZone,
    saveSettings,
    resetToDefaults,
  } = useStore();

  const [editingHR, setEditingHR] = useState(false);
  // Buffers so partial typing isn't rejected by the range check on each
  // keystroke. Synced from the store when entering edit mode.
  const [maxHRText, setMaxHRText] = useState(String(settings.maxHeartRate));
  const [restingHRText, setRestingHRText] = useState(
    String(settings.restingHeartRate),
  );
  useEffect(() => {
    if (editingHR) {
      setMaxHRText(String(settings.maxHeartRate));
      setRestingHRText(String(settings.restingHeartRate));
    }
  }, [editingHR, settings.maxHeartRate, settings.restingHeartRate]);

  const hrr = calculateHRR(settings.maxHeartRate, settings.restingHeartRate);
  const boundaries = calculateZoneBoundaries(settings);

  const handleSave = useCallback(async () => {
    await saveSettings();
    setEditingHR(false);
    Alert.alert('Saved', 'Settings saved.');
  }, [saveSettings]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      'Reset all heart rate and zone settings?',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Reset', style: 'destructive', onPress: resetToDefaults},
      ],
    );
  }, [resetToDefaults]);

  const parseNum = (v: string, min: number, max: number) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= min && n <= max ? n : null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Settings</Text>

      {/* ── HR stat tiles ── */}
      <View style={styles.hrTiles}>
        <TouchableOpacity
          style={styles.hrTile}
          onPress={() => setEditingHR(!editingHR)}>
          <Text style={styles.tileLabel}>Max</Text>
          {editingHR ? (
            <TextInput
              style={styles.tileInput}
              keyboardType="number-pad"
              value={maxHRText}
              onChangeText={v => {
                setMaxHRText(v);
                const n = parseNum(v, 100, 250);
                if (n !== null) setMaxHeartRate(n);
              }}
              autoFocus
              selectTextOnFocus
            />
          ) : (
            <Text style={styles.tileBig}>{settings.maxHeartRate}</Text>
          )}
          <Text style={styles.tileHint}>{editingHR ? 'done' : 'tap to edit'}</Text>
        </TouchableOpacity>

        <View style={styles.hrTile}>
          <Text style={styles.tileLabel}>Resting</Text>
          {editingHR ? (
            <TextInput
              style={styles.tileInput}
              keyboardType="number-pad"
              value={restingHRText}
              onChangeText={v => {
                setRestingHRText(v);
                const n = parseNum(v, 30, 120);
                if (n !== null) setRestingHeartRate(n);
              }}
              selectTextOnFocus
            />
          ) : (
            <Text style={styles.tileBig}>{settings.restingHeartRate}</Text>
          )}
          <Text style={styles.tileHint}>auto</Text>
        </View>

        <View style={styles.hrTile}>
          <Text style={styles.tileLabel}>Reserve</Text>
          <Text style={[styles.tileBig, {color: T.accent}]}>{hrr}</Text>
          <Text style={styles.tileHint}>bpm</Text>
        </View>
      </View>

      {/* ── Zone Ladder ── */}
      <Text style={styles.sectionLabel}>Zone Ladder</Text>
      <View style={styles.ladderCard}>
        {[...settings.zones].reverse().map((zone, i) => {
          const b = boundaries.find(bd => bd.zoneId === zone.id);
          const lo = b?.lowerTHR ?? calculateTHR(settings.restingHeartRate, hrr, zone.lowerIntensity);
          const hi = b?.upperTHR ?? calculateTHR(settings.restingHeartRate, hrr, zone.upperIntensity);
          const isLast = i === settings.zones.length - 1;
          return (
            <View
              key={zone.id}
              style={[styles.ladderRow, !isLast && styles.ladderRowBorder]}>
              <View
                style={[
                  styles.zoneSquare,
                  {backgroundColor: zoneColor(zone.id)},
                ]}>
                <Text style={styles.zoneSquareNum}>{zone.id}</Text>
              </View>

              <View style={{flex: 1}}>
                <Text style={styles.zoneName}>{ZONE_NAMES[zone.id - 1]}</Text>
                <Text style={styles.zonePct}>
                  {zone.lowerIntensity}–{zone.upperIntensity}%
                </Text>
              </View>

              <Text style={styles.zoneBPM}>{lo}–{hi}</Text>
              <Text style={styles.zoneBPMUnit}>bpm</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.formulaNote}>
        Boundaries calculated from Max and Resting heart rate using the Karvonen formula.
      </Text>

      {/* ── Zone intensity config ── */}
      <Text style={styles.sectionLabel}>Zone Intensity %</Text>
      <View style={styles.ladderCard}>
        {settings.zones.map((zone, i) => {
          const isLast = i === settings.zones.length - 1;
          return (
            <View
              key={zone.id}
              style={[styles.intensityRow, !isLast && styles.ladderRowBorder]}>
              <View style={[styles.dot, {backgroundColor: zoneColor(zone.id)}]} />
              <Text style={styles.intensityZoneName}>{ZONE_NAMES[zone.id - 1]}</Text>
              <View style={styles.intensityInputs}>
                <TextInput
                  style={styles.pctInput}
                  keyboardType="number-pad"
                  value={String(zone.lowerIntensity)}
                  onChangeText={v => {
                    const n = parseNum(v, 0, 100);
                    if (n !== null) updateZone(zone.id, {lowerIntensity: n});
                  }}
                  selectTextOnFocus
                />
                <Text style={styles.pctDash}>–</Text>
                <TextInput
                  style={styles.pctInput}
                  keyboardType="number-pad"
                  value={String(zone.upperIntensity)}
                  onChangeText={v => {
                    const n = parseNum(v, 0, 100);
                    if (n !== null) updateZone(zone.id, {upperIntensity: n});
                  }}
                  selectTextOnFocus
                />
                <Text style={styles.pctUnit}>%</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Weekly Goals ── */}
      <Text style={styles.sectionLabel}>Weekly Goals</Text>
      <View style={styles.ladderCard}>
        {settings.zones.map((zone, i) => {
          const isLast = i === settings.zones.length - 1;
          return (
            <View
              key={zone.id}
              style={[styles.intensityRow, !isLast && styles.ladderRowBorder]}>
              <View style={[styles.dot, {backgroundColor: zoneColor(zone.id)}]} />
              <Text style={styles.intensityZoneName}>{ZONE_NAMES[zone.id - 1]}</Text>
              <View style={styles.intensityInputs}>
                <TextInput
                  style={styles.pctInput}
                  keyboardType="number-pad"
                  value={zone.goalMinutes ? String(zone.goalMinutes) : ''}
                  onChangeText={v => {
                    const n = parseInt(v, 10);
                    updateZone(zone.id, {goalMinutes: isNaN(n) ? undefined : n});
                  }}
                  placeholder="—"
                  placeholderTextColor={T.text.tertiary}
                  selectTextOnFocus
                />
                <Text style={styles.pctUnit}>min</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: T.bg.page},
  scrollContent: {paddingBottom: 48},
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: T.text.primary,
    paddingHorizontal: 20,
    paddingTop: 16,
    letterSpacing: -1,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 22,
  },

  hrTiles: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  hrTile: {
    flex: 1,
    backgroundColor: T.bg.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: T.bg.line,
    alignItems: 'center',
  },
  tileLabel: {
    fontSize: 10,
    color: T.text.tertiary,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tileBig: {
    fontSize: 26,
    fontWeight: '500',
    color: T.text.primary,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  tileInput: {
    fontSize: 26,
    fontWeight: '500',
    color: T.text.primary,
    marginTop: 4,
    letterSpacing: -0.5,
    minWidth: 60,
    textAlign: 'center',
    padding: 0,
  },
  tileHint: {fontSize: 9, color: T.text.tertiary, marginTop: 2},

  ladderCard: {
    backgroundColor: T.bg.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.bg.line,
    marginHorizontal: 20,
    padding: 16,
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  ladderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: T.bg.line,
  },
  zoneSquare: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  zoneSquareNum: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0D12',
  },
  zoneName: {
    fontSize: 13,
    color: T.text.primary,
    fontWeight: '500',
  },
  zonePct: {
    fontSize: 11,
    color: T.text.tertiary,
    marginTop: 1,
  },
  zoneBPM: {
    fontSize: 14,
    color: T.accent,
    fontWeight: '500',
  },
  zoneBPMUnit: {
    fontSize: 10,
    color: T.text.tertiary,
  },

  formulaNote: {
    fontSize: 11,
    color: T.text.tertiary,
    paddingHorizontal: 20,
    marginTop: 10,
    lineHeight: 16,
  },

  intensityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  dot: {width: 10, height: 10, borderRadius: 5, flexShrink: 0},
  intensityZoneName: {
    flex: 1,
    fontSize: 13,
    color: T.text.primary,
  },
  intensityInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pctInput: {
    backgroundColor: T.bg.cardHi,
    color: T.text.primary,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 48,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: T.bg.line,
  },
  pctDash: {color: T.text.tertiary, fontSize: 14},
  pctUnit: {color: T.text.tertiary, fontSize: 12, marginLeft: 2},

  actions: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: T.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {color: '#0A0D12', fontSize: 16, fontWeight: '700'},
  resetBtn: {
    backgroundColor: T.bg.card,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.bg.line,
  },
  resetBtnText: {color: '#D96E7A', fontSize: 16, fontWeight: '500'},
});

export default SettingsScreen;

import React, {useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import useStore from '../store/useStore';
import {calculateTHR, calculateHRR} from '../services/ZoneEngine';

const SettingsScreen: React.FC = () => {
  const {settings, setMaxHeartRate, setRestingHeartRate, updateZone, saveSettings, resetToDefaults} =
    useStore();

  const hrr = calculateHRR(settings.maxHeartRate, settings.restingHeartRate);

  const handleSave = useCallback(async () => {
    await saveSettings();
    Alert.alert('Saved', 'Your settings have been saved.');
  }, [saveSettings]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      'This will reset all heart rate and zone settings to their default values. Are you sure?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetToDefaults();
          },
        },
      ],
    );
  }, [resetToDefaults]);

  const handleNumberInput = (
    value: string,
    setter: (n: number) => void,
    min: number,
    max: number,
  ) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      setter(num);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* Heart Rate Inputs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Heart Rate</Text>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Max Heart Rate (bpm)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(settings.maxHeartRate)}
            onChangeText={v =>
              handleNumberInput(v, setMaxHeartRate, 100, 250)
            }
            placeholder="190"
            placeholderTextColor="#475569"
          />
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Resting Heart Rate (bpm)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={String(settings.restingHeartRate)}
            onChangeText={v =>
              handleNumberInput(v, setRestingHeartRate, 30, 120)
            }
            placeholder="60"
            placeholderTextColor="#475569"
          />
        </View>

        <View style={styles.hrrDisplay}>
          <Text style={styles.hrrLabel}>Heart Rate Reserve (HRR)</Text>
          <Text style={styles.hrrValue}>{hrr} bpm</Text>
        </View>
      </View>

      {/* Zone Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone Configuration</Text>
        <Text style={styles.sectionSubtitle}>
          Adjust intensity percentages for each zone. THR values update
          automatically using the Karvonen Formula.
        </Text>

        {settings.zones.map(zone => {
          const lowerTHR = calculateTHR(
            settings.restingHeartRate,
            hrr,
            zone.lowerIntensity,
          );
          const upperTHR = calculateTHR(
            settings.restingHeartRate,
            hrr,
            zone.upperIntensity,
          );

          return (
            <View key={zone.id} style={styles.zoneCard}>
              <View style={styles.zoneHeader}>
                <View
                  style={[styles.zoneDot, {backgroundColor: zone.color}]}
                />
                <Text style={styles.zoneName}>
                  Zone {zone.id}: {zone.name}
                </Text>
              </View>

              <View style={styles.zoneInputs}>
                <View style={styles.zoneInputGroup}>
                  <Text style={styles.zoneInputLabel}>Lower %</Text>
                  <TextInput
                    style={styles.zoneInput}
                    keyboardType="number-pad"
                    value={String(zone.lowerIntensity)}
                    onChangeText={v => {
                      const num = parseInt(v, 10);
                      if (!isNaN(num) && num >= 0 && num <= 100) {
                        updateZone(zone.id, {lowerIntensity: num});
                      }
                    }}
                    placeholderTextColor="#475569"
                  />
                  <Text style={styles.thrPreview}>{lowerTHR} bpm</Text>
                </View>

                <Text style={styles.zoneDash}>–</Text>

                <View style={styles.zoneInputGroup}>
                  <Text style={styles.zoneInputLabel}>Upper %</Text>
                  <TextInput
                    style={styles.zoneInput}
                    keyboardType="number-pad"
                    value={String(zone.upperIntensity)}
                    onChangeText={v => {
                      const num = parseInt(v, 10);
                      if (!isNaN(num) && num >= 0 && num <= 100) {
                        updateZone(zone.id, {upperIntensity: num});
                      }
                    }}
                    placeholderTextColor="#475569"
                  />
                  <Text style={styles.thrPreview}>{upperTHR} bpm</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Weekly Goals */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly Goals</Text>
        <Text style={styles.sectionSubtitle}>
          Set target minutes per zone per week. Leave blank for no goal.
        </Text>

        {settings.zones.map(zone => (
          <View key={zone.id} style={styles.goalRow}>
            <View style={styles.goalLabel}>
              <View
                style={[styles.zoneDot, {backgroundColor: zone.color}]}
              />
              <Text style={styles.goalName}>{zone.name}</Text>
            </View>
            <View style={styles.goalInputWrapper}>
              <TextInput
                style={styles.goalInput}
                keyboardType="number-pad"
                value={zone.goalMinutes ? String(zone.goalMinutes) : ''}
                onChangeText={v => {
                  const num = parseInt(v, 10);
                  updateZone(zone.id, {
                    goalMinutes: isNaN(num) ? undefined : num,
                  });
                }}
                placeholder="—"
                placeholderTextColor="#475569"
              />
              <Text style={styles.goalUnit}>min</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />
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
    marginBottom: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  inputLabel: {
    fontSize: 15,
    color: '#CBD5E1',
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    textAlign: 'center',
  },
  hrrDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  hrrLabel: {
    fontSize: 15,
    color: '#94A3B8',
  },
  hrrValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  zoneCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  zoneDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  zoneInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneInputGroup: {
    alignItems: 'center',
    flex: 1,
  },
  zoneInputLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  zoneInput: {
    backgroundColor: '#0F172A',
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 70,
    textAlign: 'center',
  },
  thrPreview: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 6,
    fontWeight: '500',
  },
  zoneDash: {
    color: '#64748B',
    fontSize: 20,
    marginHorizontal: 12,
    marginTop: 16,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  goalLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalName: {
    fontSize: 15,
    color: '#CBD5E1',
  },
  goalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalInput: {
    backgroundColor: '#1E293B',
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 70,
    textAlign: 'center',
  },
  goalUnit: {
    color: '#64748B',
    fontSize: 13,
    marginLeft: 8,
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 40,
  },
});

export default SettingsScreen;

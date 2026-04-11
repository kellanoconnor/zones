import React, {useCallback, useState, useEffect} from 'react';
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
  const {settings, setMaxHeartRate, setRestingHeartRate, updateZone, saveSettings, resetToDefaults, todayRestingHR} =
    useStore();

  const [maxHRInput, setMaxHRInput] = useState(String(settings.maxHeartRate));
  const [restingHRInput, setRestingHRInput] = useState(String(settings.restingHeartRate));
  const [maxHRWarning, setMaxHRWarning] = useState<string | null>(null);
  const [restingHRWarning, setRestingHRWarning] = useState<string | null>(null);

  // Sync resting HR input when auto-updated from HealthKit
  useEffect(() => {
    setRestingHRInput(String(settings.restingHeartRate));
  }, [settings.restingHeartRate]);

  const hrr = calculateHRR(settings.maxHeartRate, settings.restingHeartRate);

  const handleSave = useCallback(async () => {
    if (maxHRWarning || restingHRWarning) {
      Alert.alert('Invalid Settings', 'Please fix the warnings before saving.');
      return;
    }
    await saveSettings();
    Alert.alert('Saved', 'Your settings have been saved.');
  }, [saveSettings, maxHRWarning, restingHRWarning]);

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
            setMaxHRInput('190');
            setRestingHRInput('60');
            setMaxHRWarning(null);
            setRestingHRWarning(null);
          },
        },
      ],
    );
  }, [resetToDefaults]);

  const validateMaxHR = (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      setMaxHRWarning('Please enter a valid number');
      return;
    }
    if (num < 60 || num > 220) {
      setMaxHRWarning('Max HR must be between 60 and 220 bpm');
      return;
    }
    if (num <= settings.restingHeartRate) {
      setMaxHRWarning('Max HR must be greater than Resting HR');
      return;
    }
    setMaxHRWarning(null);
    setMaxHeartRate(num);
    // Re-validate resting HR since max changed
    const restNum = parseInt(restingHRInput, 10);
    if (!isNaN(restNum) && restNum >= num) {
      setRestingHRWarning('Resting HR must be less than Max HR');
    } else if (!isNaN(restNum) && restNum >= 40 && restNum <= 90) {
      setRestingHRWarning(null);
    }
  };

  const validateRestingHR = (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      setRestingHRWarning('Please enter a valid number');
      return;
    }
    if (num < 40 || num > 90) {
      setRestingHRWarning('Resting HR must be between 40 and 90 bpm');
      return;
    }
    if (num >= settings.maxHeartRate) {
      setRestingHRWarning('Resting HR must be less than Max HR');
      return;
    }
    setRestingHRWarning(null);
    setRestingHeartRate(num);
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
            style={[styles.input, maxHRWarning ? styles.inputError : null]}
            keyboardType="number-pad"
            value={maxHRInput}
            onChangeText={setMaxHRInput}
            onBlur={() => validateMaxHR(maxHRInput)}
            placeholder="190"
            placeholderTextColor="#475569"
          />
        </View>
        {maxHRWarning && (
          <Text style={styles.warningText}>{maxHRWarning}</Text>
        )}

        <View style={styles.inputRow}>
          <View style={styles.inputLabelGroup}>
            <Text style={styles.inputLabel}>Resting Heart Rate (bpm)</Text>
            {todayRestingHR !== null && (
              <Text style={styles.autoUpdateNote}>
                Auto-updated from waking HR
              </Text>
            )}
          </View>
          <TextInput
            style={[styles.input, restingHRWarning ? styles.inputError : null]}
            keyboardType="number-pad"
            value={restingHRInput}
            onChangeText={setRestingHRInput}
            onBlur={() => validateRestingHR(restingHRInput)}
            placeholder="60"
            placeholderTextColor="#475569"
          />
        </View>
        {restingHRWarning && (
          <Text style={styles.warningText}>{restingHRWarning}</Text>
        )}

        <View style={styles.hrrDisplay}>
          <Text style={styles.hrrLabel}>Heart Rate Reserve (HRR)</Text>
          <Text style={styles.hrrValue}>{hrr} bpm</Text>
        </View>
      </View>

      {/* Zone Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zone Configuration</Text>
        <Text style={styles.sectionSubtitle}>
          Zone boundaries are calculated using the Karvonen Formula based on your Max and Resting heart rates.
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
                  Zone {zone.id}
                </Text>
              </View>

              <View style={styles.zoneInputs}>
                <View style={styles.zoneInputGroup}>
                  <Text style={styles.zoneInputLabel}>Lower</Text>
                  <Text style={styles.zonePercentLocked}>{zone.lowerIntensity}%</Text>
                  <Text style={styles.thrPreview}>{lowerTHR} bpm</Text>
                </View>

                <Text style={styles.zoneDash}>–</Text>

                <View style={styles.zoneInputGroup}>
                  <Text style={styles.zoneInputLabel}>Upper</Text>
                  <Text style={styles.zonePercentLocked}>{zone.upperIntensity}%</Text>
                  <Text style={styles.thrPreview}>{upperTHR} bpm</Text>
                </View>
              </View>
            </View>
          );
        })}
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
  inputLabelGroup: {
    flex: 1,
    marginRight: 12,
  },
  inputLabel: {
    fontSize: 15,
    color: '#CBD5E1',
  },
  autoUpdateNote: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
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
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  warningText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    paddingLeft: 4,
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
  zonePercentLocked: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 10,
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

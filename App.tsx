import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import DashboardScreen from './src/screens/DashboardScreen';
import TrendsScreen from './src/screens/TrendsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import useStore from './src/store/useStore';
import {initHealthKit} from './src/services/HealthKitService';

const Tab = createBottomTabNavigator();

function App() {
  const {loadSettings, setHealthKitAuthorized} = useStore();

  useEffect(() => {
    // Load saved settings on app start
    loadSettings();

    // Initialize HealthKit
    initHealthKit()
      .then(() => {
        setHealthKitAuthorized(true);
      })
      .catch(error => {
        console.error('HealthKit auth failed:', error);
        setHealthKitAuthorized(false);
      });
  }, [loadSettings, setHealthKitAuthorized]);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: {
                backgroundColor: '#0F172A',
                borderTopColor: '#1E293B',
                borderTopWidth: 1,
                paddingBottom: 4,
                height: 84,
              },
              tabBarActiveTintColor: '#3B82F6',
              tabBarInactiveTintColor: '#64748B',
              tabBarLabelStyle: {
                fontSize: 12,
                fontWeight: '500',
              },
            }}>
            <Tab.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{
                tabBarLabel: 'Dashboard',
              }}
            />
            <Tab.Screen
              name="Trends"
              component={TrendsScreen}
              options={{
                tabBarLabel: 'Trends',
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarLabel: 'Settings',
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;

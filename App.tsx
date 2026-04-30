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

    // Initialize HealthKit (not available on Simulator)
    initHealthKit()
      .then(authorized => {
        setHealthKitAuthorized(authorized);
      })
      .catch(() => {
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
                backgroundColor: '#0A0D12',
                borderTopColor: 'rgba(255,255,255,0.06)',
                borderTopWidth: 1,
                paddingBottom: 4,
                height: 84,
              },
              tabBarActiveTintColor: '#7AA9E0',
              tabBarInactiveTintColor: 'rgba(242,243,245,0.38)',
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

import { FontAwesome5 } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { brand, surface } from '@/constants/design';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.primary,
        tabBarInactiveTintColor: isDark ? surface.dark.muted : surface.light.muted,
        tabBarStyle: {
          backgroundColor: isDark ? surface.dark.card : surface.light.card,
          borderTopWidth: 1,
          borderTopColor: isDark ? surface.dark.border : surface.light.border,
          elevation: 14,
          shadowColor: '#0F172A',
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -4 },
          height: 68,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <FontAwesome5 name="tachometer-alt" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color }) => <FontAwesome5 name="taxi" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <FontAwesome5 name="cog" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}

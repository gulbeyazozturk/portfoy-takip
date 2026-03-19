import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { FABTabButton } from '@/components/fab-tab-button';
import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/context/auth';

const TAB_BG = '#000000';
const PASSIVE = '#888A96';
const ACTIVE = '#2979FF';

export default function TabLayout() {
  const { session, loading } = useAuth();
  if (!loading && !session) {
    return <Redirect href="/auth" />;
  }

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopColor: 'rgba(255,255,255,0.08)',
        },
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: PASSIVE,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Portföy',
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="pie-chart-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Ara',
          tabBarButton: FABTabButton,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ayarlar',
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="explore"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="following"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="insights"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="asset-entry"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="asset-list"
        options={{ href: null }}
      />
    </Tabs>
  );
}

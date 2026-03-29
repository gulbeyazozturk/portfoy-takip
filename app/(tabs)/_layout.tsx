import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { FABTabButton } from '@/components/fab-tab-button';
import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/context/auth';
import { useTranslation } from 'react-i18next';

const TAB_BG = '#000000';
const PASSIVE = '#888A96';
const ACTIVE = '#2979FF';

export default function TabLayout() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  if (!loading && !session) {
    return <Redirect href="/auth" />;
  }

  return (
    <Tabs
      initialRouteName="home"
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
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.portfolio'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="briefcase-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarButton: FABTabButton,
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="trend"
        options={{
          title: t('tabs.trend'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="analytics-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={24} color={color} />,
        }}
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

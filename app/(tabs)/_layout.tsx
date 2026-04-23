import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

import { FABTabButton } from '@/components/fab-tab-button';
import { HapticTab } from '@/components/haptic-tab';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/context/auth';
import { useTranslation } from 'react-i18next';

export const unstable_settings = {
  initialRouteName: 'home',
};

const TAB_BG = '#000000';
const PASSIVE = '#888A96';
const ACTIVE = Brand.primary;

export default function TabLayout() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const isPad = Platform.OS === 'ios' && Platform.isPad;
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
          tabBarButton: isPad ? undefined : HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: t('tabs.portfolio'),
          tabBarButton: isPad ? undefined : HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="briefcase-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarButton: isPad ? undefined : FABTabButton,
          tabBarIcon: ({ color }) => (isPad ? <Ionicons name="add-circle-outline" size={24} color={color} /> : null),
        }}
      />
      <Tabs.Screen
        name="trend"
        options={{
          title: t('tabs.trend'),
          tabBarButton: isPad ? undefined : HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="analytics-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarButton: isPad ? undefined : HapticTab,
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
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

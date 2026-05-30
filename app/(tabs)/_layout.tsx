import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, useWindowDimensions } from 'react-native';

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

function TabIcon({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View pointerEvents="none">
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const { width, height } = useWindowDimensions();
  const isTabletLike =
    Platform.OS === 'ios' &&
    (Platform.isPad === true || Math.min(width, height) >= 768);

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
          tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: t('tabs.portfolio'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <TabIcon name="briefcase-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarButton: isTabletLike ? HapticTab : FABTabButton,
          tabBarIcon: ({ color }) =>
            isTabletLike ? <TabIcon name="add-circle-outline" color={color} /> : null,
        }}
      />
      <Tabs.Screen
        name="trend"
        options={{
          title: t('tabs.trend'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <TabIcon name="analytics-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarButton: HapticTab,
          tabBarIcon: ({ color }) => <TabIcon name="settings-outline" color={color} />,
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
      <Tabs.Screen
        name="asset-chart"
        options={{ href: null }}
      />
    </Tabs>
  );
}

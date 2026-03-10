import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const CATEGORIES = [
  { id: 'tl', label: 'TL', icon: 'flag-outline', color: '#e11d48' },
  { id: 'bist', label: 'BIST', icon: 'stats-chart-outline', color: '#6366f1' },
  { id: 'commodity', label: 'Emtia', icon: 'flame-outline', color: '#f97316' },
  { id: 'fx', label: 'Döviz', icon: 'cash-outline', color: '#10b981' },
  { id: 'fund', label: 'Fon', icon: 'layers-outline', color: '#22c55e' },
  { id: 'eurobond', label: 'Eurobond', icon: 'ellipse-outline', color: '#facc15' },
  { id: 'crypto', label: 'Kripto', icon: 'logo-bitcoin', color: '#f97316' },
  { id: 'usa', label: 'ABD', icon: 'bar-chart-outline', color: '#ef4444' },
];

export default function CategorySelectionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#4a4e69" darkColor="#4a4e69">
        {/* Üst bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.push('/(tabs)')}
            activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color="#f9fafb" />
          </TouchableOpacity>
          <ThemedText type="subtitle" style={styles.headerTitle}>
            Kategori Seç
          </ThemedText>
          <View style={{ width: 32 }} />
        </View>

        {/* Kategori listesi */}
        <FlatList
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/asset-list',
                  params: { categoryId: item.id, label: item.label },
                })
              }>
              <View style={styles.cardLeft}>
                <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                  <Ionicons name={item.icon as any} size={18} color="#f9fafb" />
                </View>
                <ThemedText style={styles.cardLabel}>{item.label}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#e5e7eb" />
            </TouchableOpacity>
          )}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#4a4e69',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  headerTitle: {
    color: '#f9fafb',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    color: '#f9fafb',
  },
});



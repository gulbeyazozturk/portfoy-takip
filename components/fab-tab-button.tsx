import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

const ACCENT = '#2979FF';

export function FABTabButton(props: BottomTabBarButtonProps) {
  const { onPress, style } = props;
  return (
    <View style={[styles.wrapper, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={styles.fab}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});

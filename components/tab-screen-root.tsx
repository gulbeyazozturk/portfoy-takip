import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet, View, type StyleProp, ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Tab ekranı kök sarmalayıcı: gövde yüksekliğini tab bar altına taşmaz (iPad + New Arch dokunuş yutma).
 */
export function TabScreenRoot({ children, style }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  return (
    <View style={[styles.root, tabBarHeight > 0 ? { paddingBottom: tabBarHeight } : null, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

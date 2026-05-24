import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_FOOTER_BOTTOM_PAD = 12;

export type ScreenWithFooterProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Sabit üst blok (geri, başlık vb.) — kaydırılmaz. */
  header?: React.ReactNode;
  /** Sağ üst mutlak overlay (dil seçici). */
  headerOverlay?: React.ReactNode;
  /** true (varsayılan): gövde ScrollView. false: gövde flex View (FlatList ekranları). */
  scroll?: boolean;
  keyboardAvoid?: boolean;
  keyboardVerticalOffset?: number;
  scrollRef?: React.RefObject<ScrollView | null>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<
    ScrollViewProps,
    'children' | 'style' | 'contentContainerStyle' | 'ref' | 'keyboardShouldPersistTaps' | 'keyboardDismissMode'
  >;
  backgroundColor?: string;
  footerBackgroundColor?: string;
  testID?: string;
};

/**
 * Tam ekran düzeni: üst safe area + (opsiyonel) klavye kaçınma + kaydırılabilir gövde + sabit alt footer.
 * Birincil CTA butonları footer slot'una konmalı; ScrollView içine koyma.
 */
export function ScreenWithFooter({
  children,
  footer,
  header,
  headerOverlay,
  scroll = true,
  keyboardAvoid = false,
  keyboardVerticalOffset,
  scrollRef,
  contentContainerStyle,
  bodyStyle,
  footerStyle,
  scrollProps,
  backgroundColor = '#000',
  footerBackgroundColor,
  testID,
}: ScreenWithFooterProps) {
  const insets = useSafeAreaInsets();
  const footerBg = footerBackgroundColor ?? backgroundColor;
  const bottomPad = Math.max(insets.bottom, MIN_FOOTER_BOTTOM_PAD);

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={[styles.flex, bodyStyle]}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="on-drag"
      {...scrollProps}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, bodyStyle]}>{children}</View>
  );

  const layout = (
    <View style={styles.flex} testID={testID}>
      {header}
      {body}
      {footer != null ? (
        <View
          style={[styles.footer, { paddingBottom: bottomPad, backgroundColor: footerBg }, footerStyle]}
          collapsable={false}>
          {footer}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={['top', 'left', 'right']}>
      {headerOverlay ? (
        <View pointerEvents="box-none" style={[styles.headerOverlay, { top: insets.top + 8 }]}>
          {headerOverlay}
        </View>
      ) : null}
      {keyboardAvoid ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={keyboardVerticalOffset ?? insets.top}>
          {layout}
        </KeyboardAvoidingView>
      ) : (
        layout
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  footer: {
    paddingTop: 8,
  },
  headerOverlay: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
});

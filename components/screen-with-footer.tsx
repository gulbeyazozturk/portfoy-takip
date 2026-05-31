import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_FOOTER_BOTTOM_PAD = 12;
/** Scroll içeriği ile footer arasında görsel nefes payı (footer zaten flex ile ayrı). */
const SCROLL_BOTTOM_GAP = 12;

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
  /** Boş alana dokununca klavyeyi kapat (ScrollView gövdesi). */
  dismissKeyboardOnPress?: boolean;
};

/**
 * Tam ekran düzeni: üst safe area + (opsiyonel) klavye kaçınma + kaydırılabilir gövde + sabit alt footer.
 *
 * Yapı (flex sütun, absolute/zIndex yok):
 *   [header?]
 *   [body — flex:1, minHeight:0 → ScrollView veya FlatList alanı]
 *   [footer? — doğal akışta en altta, dokunuşları ScrollView kapamaz]
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
  dismissKeyboardOnPress = false,
}: ScreenWithFooterProps) {
  const insets = useSafeAreaInsets();
  /** Tab dışı ekranlarda (auth vb.) hook hata fırlatır; context yoksa 0. */
  const tabBarHeight = React.useContext(BottomTabBarHeightContext) ?? 0;
  const footerBg = footerBackgroundColor ?? backgroundColor;
  const bottomPad = Math.max(insets.bottom, MIN_FOOTER_BOTTOM_PAD);

  const scrollContentStyles = [
    footer != null ? styles.scrollContentWithFooter : styles.scrollContent,
    dismissKeyboardOnPress ? styles.scrollContentDismissTap : null,
    { paddingBottom: SCROLL_BOTTOM_GAP },
    contentContainerStyle,
  ];

  const bodyChildren =
    dismissKeyboardOnPress && scroll ? (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.dismissTapFill} collapsable={false}>
          {children}
        </View>
      </TouchableWithoutFeedback>
    ) : (
      children
    );

  const scrollBody = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={[styles.flex, bodyStyle]}
      contentContainerStyle={scrollContentStyles}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps={dismissKeyboardOnPress ? 'handled' : 'always'}
      keyboardDismissMode="on-drag"
      removeClippedSubviews={false}
      {...scrollProps}>
      {bodyChildren}
    </ScrollView>
  ) : (
    <View style={[styles.flex, bodyStyle]}>{children}</View>
  );

  /** Klavye kaçınma yalnızca gövdede — footer dışarıda kalır (iOS’ta alt CTA dokunuş çakışması önlenir). */
  const body = keyboardAvoid ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset ?? insets.top}>
      {scrollBody}
    </KeyboardAvoidingView>
  ) : (
    scrollBody
  );

  const layout = (
    <View
      style={[styles.flex, styles.column, tabBarHeight > 0 ? { paddingBottom: tabBarHeight } : null]}
      testID={testID}>
      {header}
      <View style={styles.bodySlot} pointerEvents="box-none">
        <View style={styles.bodyClip} collapsable={false}>
          {body}
        </View>
      </View>
      {footer != null ? (
        <View
          pointerEvents="box-none"
          style={[styles.footer, { paddingBottom: bottomPad, backgroundColor: footerBg }, footerStyle]}
          collapsable={false}>
          <View pointerEvents="auto" style={styles.footerTouchLayer}>
            {footer}
          </View>
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
      {layout}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  /** minHeight:0 — ScrollView/FlatList’in footer ile çakışmadan kalan yüksekliğe sığması için gerekli. */
  column: { flexDirection: 'column' },
  bodySlot: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  /** ScrollView/FlatList dokunuş alanının footer/tab bar altına taşmasını sınırla (iPad + New Arch). */
  bodyClip: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 1,
  },
  /** Footer varken flexGrow kapalı — iOS’ta ScrollView’un alt CTA ile çakışmasını azaltır. */
  scrollContentWithFooter: {},
  scrollContentDismissTap: { flexGrow: 1 },
  dismissTapFill: { flexGrow: 1 },
  footer: {
    paddingTop: 8,
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
    elevation: 10,
  },
  footerTouchLayer: {
    zIndex: 11,
    elevation: 11,
  },
  headerOverlay: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
});

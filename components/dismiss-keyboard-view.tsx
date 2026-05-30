import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Klavye kapatma: ScrollView / ScreenWithFooter (`dismissKeyboardOnPress`) kullanın; tam ekran TouchableWithoutFeedback iPad’de alt CTA’ları yutabiliyor. */
export function DismissKeyboardView({ children, style }: Props) {
  return (
    <View style={[{ flex: 1 }, style]} collapsable={false}>
      {children}
    </View>
  );
}

import React from 'react';
import {
  Keyboard,
  StyleProp,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Boş alana dokununca klavyeyi kapatır; input ve butonlar normal çalışır. */
export function DismissKeyboardView({ children, style }: Props) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[{ flex: 1 }, style]} collapsable={false}>
        {children}
      </View>
    </TouchableWithoutFeedback>
  );
}

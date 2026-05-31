import { Platform, useWindowDimensions, type TextInputProps } from 'react-native';

/** iPad / geniş iOS yüzey (simülatörde Platform.isPad bazen false). */
export function useTabletLike(): boolean {
  const { width, height } = useWindowDimensions();
  return Platform.OS === 'ios' && (Platform.isPad === true || Math.min(width, height) >= 768);
}

/**
 * iPad simülatörde keyboardType="email-address" bazen yalnızca aksesuar çubuğu açar;
 * orada default daha güvenilir. Android'de email-address (@ tuşu) şart.
 */
export function emailTextInputProps(tabletLike: boolean): Pick<
  TextInputProps,
  | 'keyboardType'
  | 'inputMode'
  | 'textContentType'
  | 'autoComplete'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'showSoftInputOnFocus'
  | 'importantForAutofill'
> {
  return {
    keyboardType: tabletLike ? 'default' : 'email-address',
    inputMode: 'email',
    textContentType: 'emailAddress',
    autoComplete: 'email',
    autoCapitalize: 'none',
    autoCorrect: false,
    showSoftInputOnFocus: true,
    importantForAutofill: 'yes',
  };
}

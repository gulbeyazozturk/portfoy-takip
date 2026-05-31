import { Platform, useWindowDimensions, type TextInputProps } from 'react-native';

/** iPad / geniş iOS yüzey (simülatörde Platform.isPad bazen false). */
export function useTabletLike(): boolean {
  const { width, height } = useWindowDimensions();
  return Platform.OS === 'ios' && (Platform.isPad === true || Math.min(width, height) >= 768);
}

/**
 * iPad’de keyboardType="email-address" bazen yalnızca küçük aksesuar çubuğu gösterir (tam klavye yok).
 * Tablet benzeri ekranda default klavye + e-posta autofill kullanılır.
 */
export function emailTextInputProps(tabletLike: boolean): Pick<
  TextInputProps,
  'keyboardType' | 'textContentType' | 'autoComplete' | 'autoCapitalize' | 'autoCorrect'
> {
  return {
    keyboardType: tabletLike ? 'default' : 'email-address',
    textContentType: 'emailAddress',
    autoComplete: 'email',
    autoCapitalize: 'none',
    autoCorrect: false,
  };
}

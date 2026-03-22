import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * EAS production build'de EXPO_PUBLIC_SUPABASE_* yoksa gösterilir (çökme yerine).
 */
export function MissingSupabaseConfigScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}>
      <Text style={styles.title}>{t('errors.missingSupabaseBuildConfigTitle')}</Text>
      <Text style={styles.body}>{t('errors.missingSupabaseBuildConfigBody')}</Text>
      <Text style={styles.hint}>{t('errors.missingSupabaseBuildConfigHint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 24, backgroundColor: '#0a0a0a' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  body: { color: '#cbd5e1', fontSize: 16, lineHeight: 24, marginBottom: 20 },
  hint: { color: '#64748b', fontSize: 13, lineHeight: 20 },
});

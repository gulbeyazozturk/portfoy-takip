import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { OmnifolioBrand } from '@/components/omnifolio-brand';
import { ScreenWithFooter } from '@/components/screen-with-footer';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/context/auth';
import { setWelcomeDismissedForUser } from '@/lib/welcome-dismissed';
import { useTranslation } from 'react-i18next';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) router.replace('/auth');
  }, [router, session]);

  const onContinue = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      router.replace('/auth');
      return;
    }
    setBusy(true);
    try {
      await setWelcomeDismissedForUser(uid);
    } catch {
      // Kaydetme hatası kullanıcıyı engellemesin; yine de devam ettir.
    } finally {
      setBusy(false);
      router.replace('/home');
    }
  }, [router, session?.user?.id]);

  if (!session) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loading}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenWithFooter
      headerOverlay={<LanguageToggle />}
      contentContainerStyle={styles.scrollContent}
      footer={
        <View style={styles.footerInner}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
            onPress={onContinue}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('welcome.continue')}>
            {busy ? (
              <ActivityIndicator color={Brand.onPrimarySolid} />
            ) : (
              <Text style={styles.primaryBtnText}>{t('welcome.continue')}</Text>
            )}
          </TouchableOpacity>
        </View>
      }>
      <OmnifolioBrand />

      <Text style={styles.lead}>{t('welcome.lead')}</Text>

      <Text style={styles.sectionTitle}>{t('welcome.whatTitle')}</Text>
      <Bullet text={t('welcome.bullet1')} />
      <Bullet text={t('welcome.bullet2')} />
      <Bullet text={t('welcome.bullet3')} />

      <Text style={styles.sectionTitle}>{t('welcome.dataTitle')}</Text>
      <Text style={styles.paragraph}>{t('welcome.dataBody')}</Text>

      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimer}>{t('welcome.disclaimer')}</Text>
      </View>
    </ScreenWithFooter>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 56,
  },
  footerInner: {
    paddingHorizontal: 22,
  },
  lead: {
    marginTop: 8,
    marginBottom: 22,
    color: '#d1d5db',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
    paddingRight: 4,
  },
  bulletDot: {
    color: Brand.primary,
    fontSize: 18,
    lineHeight: 24,
    width: 14,
    textAlign: 'center',
  },
  bulletText: {
    flex: 1,
    color: '#e5e7eb',
    fontSize: 15,
    lineHeight: 22,
  },
  paragraph: {
    color: '#e5e7eb',
    fontSize: 15,
    lineHeight: 22,
  },
  disclaimerBox: {
    marginTop: 22,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.infoBoxBorder,
    backgroundColor: Brand.infoBoxBg,
  },
  disclaimer: {
    color: Brand.infoBoxText,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: Brand.primarySolid,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Brand.primaryBorder,
    minHeight: 50,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    color: Brand.onPrimarySolid,
    fontSize: 16,
    fontWeight: '700',
  },
});

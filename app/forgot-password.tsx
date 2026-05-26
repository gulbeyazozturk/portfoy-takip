import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { LanguageToggle } from '@/components/language-toggle';
import { DismissKeyboardView } from '@/components/dismiss-keyboard-view';
import { OmnifolioBrand } from '@/components/omnifolio-brand';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth';

const AUTH_THREE_LINES = 20 * 3;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail = typeof params.email === 'string' ? params.email : '';
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isEmailValid = useMemo(() => email.trim().includes('@') && email.trim().includes('.'), [email]);
  const canSend = useMemo(() => isEmailValid && !busy, [isEmailValid, busy]);

  const withTimeout = async <T,>(promise: Promise<T>, ms = 20000): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(t('auth.timeout'))), ms);
      }),
    ]);
  };

  const sendReset = async () => {
    if (busy || !isEmailValid) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: resetError } = await withTimeout(requestPasswordReset(email.trim()));
      if (resetError) {
        setError(resetError);
        return;
      }
      setInfo(t('auth.resetEmailSent'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <DismissKeyboardView>
        <View style={[styles.langCorner, { top: insets.top + 8 }]}>
          <LanguageToggle />
        </View>
        <View style={styles.container}>
        <OmnifolioBrand compact />
        <ThemedText style={styles.hint}>{t('auth.forgotPasswordHint')}</ThemedText>

        <View style={styles.card}>
          <ThemedText style={styles.label}>{t('auth.email')}</ThemedText>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!canSend}
            style={[styles.primaryBtn, !canSend && styles.disabledBtn]}
            onPress={sendReset}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>{t('auth.sendResetLink')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <ThemedText style={styles.backLinkText}>{t('auth.backToSignIn')}</ThemedText>
        </TouchableOpacity>

        {info ? <ThemedText style={styles.infoText}>{info}</ThemedText> : null}
        {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
        </View>
      </DismissKeyboardView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  langCorner: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 24 + AUTH_THREE_LINES },
  hint: {
    marginTop: 16,
    marginBottom: 16,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 14,
    padding: 12,
  },
  label: { color: '#9ca3af', fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#0f172a',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 10,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#00b863',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,230,119,0.45)',
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkText: { color: '#00e677', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#ef4444', marginTop: 12, textAlign: 'center', fontSize: 13 },
  infoText: { color: '#22c55e', marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 19 },
});

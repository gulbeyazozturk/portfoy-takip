import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { OmnifolioBrand } from '@/components/omnifolio-brand';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

type Mode = 'signin' | 'signup';

/** Tagline / alt başlık satır yüksekliği — “3 satır boşluk” için çarpan. */
const AUTH_LINE_HEIGHT = 20;
const AUTH_THREE_LINES = AUTH_LINE_HEIGHT * 3;

export default function AuthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const showAppleButton = Platform.OS === 'ios' || Platform.OS === 'web';

  const isEmailValid = useMemo(() => email.trim().includes('@') && email.trim().includes('.'), [email]);
  const isPasswordValid = useMemo(() => password.trim().length >= 6, [password]);
  const canSubmit = useMemo(() => isEmailValid && isPasswordValid && !busy, [isEmailValid, isPasswordValid, busy]);

  const withTimeout = async <T,>(promise: Promise<T>, ms = 15000): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(t('auth.timeout'))), ms);
      }),
    ]);
  };

  const submit = async () => {
    if (busy) return;
    if (!isEmailValid) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (!isPasswordValid) {
      setError(t('auth.passwordShort'));
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error: authError, hasSession } = await withTimeout(signInWithEmail(email.trim(), password.trim()));
        if (authError) {
          setError(authError);
          return;
        }
        if (hasSession) router.replace('/(tabs)');
        return;
      }

      const { error: signUpError } = await withTimeout(signUpWithEmail(email.trim(), password.trim()));
      if (signUpError) {
        setError(signUpError);
        return;
      }

      // Confirm-email kapalı akışta kullanıcıyı direkt girişe al.
      const { error: signInError, hasSession } = await withTimeout(signInWithEmail(email.trim(), password.trim()), 10000);
      if (signInError) {
        setInfo(t('auth.signupThenSignIn'));
        setMode('signin');
        return;
      }
      setInfo(t('auth.signupSuccess'));
      if (hasSession) router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message ?? t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'google' | 'apple') => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const fn = provider === 'google' ? signInWithGoogle : signInWithApple;
      const { error: authError } = await withTimeout(fn(), 60000);
      if (authError) {
        setError(authError);
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      if (data.session) {
        router.replace('/(tabs)');
        return;
      }
      setError(t('auth.sessionFailed'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('auth.socialError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.langCorner, { top: insets.top + 8 }]}>
        <LanguageToggle />
      </View>
      <View style={styles.container}>
        <OmnifolioBrand />
        <ThemedText style={styles.subtitle}>{t('auth.subtitle')}</ThemedText>

        <View style={styles.modeRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
            onPress={() => setMode('signin')}
          >
            <ThemedText style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>{t('auth.signIn')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
            onPress={() => setMode('signup')}
          >
            <ThemedText style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>{t('auth.signUp')}</ThemedText>
          </TouchableOpacity>
        </View>

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

          <ThemedText style={[styles.label, { marginTop: 10 }]}>{t('auth.password')}</ThemedText>
          <TextInput
            secureTextEntry
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={busy}
            style={[styles.primaryBtn, (!canSubmit || busy) && styles.disabledBtn]}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>
                {mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.orText}>{t('auth.or')}</ThemedText>

        <TouchableOpacity activeOpacity={0.85} style={styles.socialBtn} onPress={() => social('google')} disabled={busy}>
          <Ionicons name="logo-google" size={18} color="#e5e7eb" />
          <ThemedText style={styles.socialText}>{t('auth.googleContinue')}</ThemedText>
        </TouchableOpacity>

        {showAppleButton ? (
          <TouchableOpacity activeOpacity={0.85} style={styles.socialBtn} onPress={() => social('apple')} disabled={busy}>
            <Ionicons name="logo-apple" size={18} color="#e5e7eb" />
            <ThemedText style={styles.socialText}>{t('auth.appleContinue')}</ThemedText>
          </TouchableOpacity>
        ) : null}

        {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
        {info ? <ThemedText style={styles.infoText}>{info}</ThemedText> : null}
      </View>
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
  subtitle: {
    marginTop: 4 + AUTH_THREE_LINES,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: AUTH_LINE_HEIGHT,
  },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: '#00e677', backgroundColor: 'rgba(0,230,119,0.12)' },
  modeText: { color: '#9ca3af', fontWeight: '600' },
  modeTextActive: { color: '#fff' },
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
  orText: { textAlign: 'center', color: '#6b7280', marginVertical: 14 },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: '#111827',
  },
  socialText: { color: '#e5e7eb', fontWeight: '600' },
  errorText: { color: '#ef4444', marginTop: 8, textAlign: 'center', fontSize: 13 },
  infoText: { color: '#22c55e', marginTop: 8, textAlign: 'center', fontSize: 13 },
});

import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { OmnifolioBrand } from '@/components/omnifolio-brand';
import { ThemedText } from '@/components/themed-text';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/context/auth';
import type { OAuthPrepared } from '@/lib/oauth-native-sign-in';
import { waitForSignedInAfterOAuth } from '@/lib/oauth-session-wait';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

type Mode = 'signin' | 'signup' | 'forgot';

/** Tagline / alt başlık satır yüksekliği — “3 satır boşluk” için çarpan. */
const AUTH_LINE_HEIGHT = 20;
const AUTH_THREE_LINES = AUTH_LINE_HEIGHT * 3;

export default function AuthScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithApple,
    signInWithGooglePrepared,
    prepareGoogleOAuth,
    requestPasswordReset,
  } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<'google' | 'apple' | null>(null);
  const socialInFlightRef = useRef<'google' | 'apple' | null>(null);
  const googlePreparedRef = useRef<OAuthPrepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const showAppleButton = Platform.OS === 'ios';

  const anyBusy = submitBusy || socialBusy !== null;

  const isEmailValid = useMemo(() => email.trim().includes('@') && email.trim().includes('.'), [email]);
  const isPasswordValid = useMemo(() => password.trim().length >= 6, [password]);
  const canSubmit = useMemo(
    () => isEmailValid && isPasswordValid && !anyBusy,
    [isEmailValid, isPasswordValid, anyBusy],
  );
  const canSendReset = useMemo(() => isEmailValid && !anyBusy, [isEmailValid, anyBusy]);

  const prefetchGoogleOAuth = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const { prepared, error: prepError } = await prepareGoogleOAuth();
    if (prepared) {
      googlePreparedRef.current = prepared;
    } else if (prepError) {
      googlePreparedRef.current = null;
    }
  }, [prepareGoogleOAuth]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    void prefetchGoogleOAuth();
  }, [prefetchGoogleOAuth]);

  const withTimeout = async <T,>(promise: Promise<T>, ms = 15000): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(t('auth.timeout'))), ms);
      }),
    ]);
  };

  const submit = async () => {
    if (anyBusy) return;
    if (!isEmailValid) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (!isPasswordValid) {
      setError(t('auth.passwordShort'));
      return;
    }

    Keyboard.dismiss();
    setSubmitBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const { error: authError, hasSession } = await withTimeout(signInWithEmail(email.trim(), password.trim()));
        if (authError) {
          setError(authError);
          return;
        }
        if (hasSession) return;
        return;
      }

      const { error: signUpError } = await withTimeout(signUpWithEmail(email.trim(), password.trim()));
      if (signUpError) {
        setError(signUpError);
        return;
      }

      const { error: signInError, hasSession } = await withTimeout(signInWithEmail(email.trim(), password.trim()), 10000);
      if (signInError) {
        setInfo(t('auth.signupThenSignIn'));
        setMode('signin');
        return;
      }
      setInfo(t('auth.signupSuccess'));
      if (hasSession) return;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('auth.genericError'));
    } finally {
      setSubmitBusy(false);
    }
  };

  const sendReset = async () => {
    if (anyBusy || !isEmailValid) {
      setError(t('auth.invalidEmail'));
      return;
    }
    Keyboard.dismiss();
    setSubmitBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: e } = await withTimeout(requestPasswordReset(email.trim()), 20000);
      if (e) {
        setError(e);
        return;
      }
      setInfo(t('auth.resetEmailSent'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.genericError'));
    } finally {
      setSubmitBusy(false);
    }
  };

  const ensureSessionAfterSocial = useCallback(async (): Promise<void> => {
    let { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      setError(sessionError.message);
      return;
    }
    if (!data.session) {
      await waitForSignedInAfterOAuth();
      const again = await supabase.auth.getSession();
      data = again.data;
      sessionError = again.error;
    }
    if (sessionError) {
      setError(sessionError.message);
      return;
    }
    if (data.session) return;
    setError(t('auth.sessionFailed'));
  }, [t]);

  const runAppleSignIn = useCallback(() => {
    if (socialInFlightRef.current || submitBusy) return;
    Keyboard.dismiss();
    socialInFlightRef.current = 'apple';
    setSocialBusy('apple');
    setError(null);
    setInfo(null);
    void (async () => {
      try {
        await withTimeout(
          (async () => {
            const { error: authError, hasSession } = await signInWithApple();
            if (authError) {
              setError(authError);
              return;
            }
            if (hasSession) return;
            await ensureSessionAfterSocial();
          })(),
          65000,
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t('auth.socialError'));
      } finally {
        socialInFlightRef.current = null;
        setSocialBusy(null);
      }
    })();
  }, [ensureSessionAfterSocial, signInWithApple, submitBusy, t]);

  const finishGoogleSession = useCallback(
    async (signInPromise: Promise<{ error: string | null; hasSession: boolean }>) => {
      try {
        const { error: authError, hasSession } = await withTimeout(signInPromise, 65000);
        if (authError) {
          setError(authError);
          return;
        }
        if (hasSession) return;
        await ensureSessionAfterSocial();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : t('auth.socialError'));
      } finally {
        socialInFlightRef.current = null;
        setSocialBusy(null);
        void prefetchGoogleOAuth();
      }
    },
    [ensureSessionAfterSocial, prefetchGoogleOAuth, t],
  );

  /** Google: URL önceden hazır → tarayıcıyı setState’ten önce aç (iOS kullanıcı jesti). */
  const runGoogleSignIn = useCallback(() => {
    if (socialInFlightRef.current || submitBusy) return;
    Keyboard.dismiss();
    socialInFlightRef.current = 'google';
    setError(null);
    setInfo(null);

    const cached = googlePreparedRef.current;
    if (cached) {
      googlePreparedRef.current = null;
      const signInPromise = signInWithGooglePrepared(cached);
      setSocialBusy('google');
      void finishGoogleSession(signInPromise);
      return;
    }

    void (async () => {
      const { prepared, error: prepError } = await prepareGoogleOAuth();
      if (prepError || !prepared) {
        setError(prepError ?? t('auth.socialError'));
        socialInFlightRef.current = null;
        return;
      }
      const signInPromise = signInWithGooglePrepared(prepared);
      setSocialBusy('google');
      await finishGoogleSession(signInPromise);
    })();
  }, [
    finishGoogleSession,
    prepareGoogleOAuth,
    signInWithGooglePrepared,
    submitBusy,
    t,
  ]);

  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View pointerEvents="box-none" style={[styles.headerOverlay, { top: insets.top + 8 }]}>
        <LanguageToggle />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <OmnifolioBrand />
          <ThemedText style={styles.subtitle}>{t('auth.subtitle')}</ThemedText>

          {mode !== 'forgot' ? (
            <View style={styles.modeRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
                onPress={() => setMode('signin')}>
                <ThemedText style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>
                  {t('auth.signIn')}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
                onPress={() => setMode('signup')}>
                <ThemedText style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>
                  {t('auth.signUp')}
                </ThemedText>
              </TouchableOpacity>
            </View>
          ) : null}

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

            {mode !== 'forgot' ? (
              <>
                <ThemedText style={[styles.label, { marginTop: 10 }]}>{t('auth.password')}</ThemedText>
                <TextInput
                  secureTextEntry
                  placeholder={t('auth.passwordPlaceholder')}
                  placeholderTextColor="#6b7280"
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                />
                {mode === 'signin' ? (
                  <TouchableOpacity
                    style={styles.forgotLinkWrap}
                    onPress={() => {
                      setMode('forgot');
                      setError(null);
                      setInfo(null);
                    }}
                    disabled={anyBusy}>
                    <ThemedText style={styles.forgotLink}>{t('auth.forgotPassword')}</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <ThemedText style={styles.forgotHint}>{t('auth.forgotPasswordHint')}</ThemedText>
            )}
          </View>

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
          {mode !== 'forgot' && info ? <ThemedText style={styles.infoText}>{info}</ThemedText> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          disabled={anyBusy || (mode === 'forgot' ? !canSendReset : !canSubmit)}
          style={[
            styles.primaryBtn,
            ((mode === 'forgot' ? !canSendReset : !canSubmit) || anyBusy) && styles.disabledBtn,
          ]}
          onPress={mode === 'forgot' ? () => void sendReset() : () => void submit()}>
          {submitBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.primaryBtnText}>
              {mode === 'forgot' ? t('auth.sendResetLink') : mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
            </ThemedText>
          )}
        </TouchableOpacity>

        {mode === 'forgot' && info ? (
          <View style={styles.infoBox}>
            <ThemedText style={styles.infoBoxText}>{info}</ThemedText>
          </View>
        ) : null}

        {mode === 'forgot' ? (
          <TouchableOpacity
            style={styles.backForgot}
            onPress={() => {
              setMode('signin');
              setError(null);
              setInfo(null);
            }}
            disabled={anyBusy}>
            <ThemedText style={styles.forgotLink}>{t('auth.backToSignIn')}</ThemedText>
          </TouchableOpacity>
        ) : null}

        {mode !== 'forgot' ? (
          <>
            <ThemedText style={styles.orText}>{t('auth.or')}</ThemedText>
            <View style={styles.socialStack}>
              {showAppleButton ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  style={[
                    styles.socialBtn,
                    (submitBusy || (socialBusy !== null && socialBusy !== 'apple')) && styles.disabledBtn,
                  ]}
                  onPress={runAppleSignIn}
                  disabled={submitBusy || (socialBusy !== null && socialBusy !== 'apple')}>
                  {socialBusy === 'apple' ? (
                    <ActivityIndicator color="#e5e7eb" size="small" />
                  ) : (
                    <Ionicons name="logo-apple" size={18} color="#e5e7eb" />
                  )}
                  <ThemedText style={styles.socialText}>{t('auth.appleContinue')}</ThemedText>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.85}
                accessibilityRole="button"
                style={[
                  styles.socialBtn,
                  (submitBusy || (socialBusy !== null && socialBusy !== 'google')) && styles.disabledBtn,
                ]}
                onPress={runGoogleSignIn}
                disabled={submitBusy || (socialBusy !== null && socialBusy !== 'google')}>
                {socialBusy === 'google' ? (
                  <ActivityIndicator color="#e5e7eb" size="small" />
                ) : (
                  <Ionicons name="logo-google" size={18} color="#e5e7eb" />
                )}
                <ThemedText style={styles.socialText}>{t('auth.googleContinue')}</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
  },
  container: { paddingHorizontal: 20, paddingTop: 24 + AUTH_THREE_LINES, paddingBottom: 16 },
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
  modeBtnActive: { borderColor: Brand.primaryBorder, backgroundColor: Brand.primaryMuted },
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
  bottomBar: {
    flexShrink: 0,
    paddingTop: 8,
    paddingHorizontal: 20,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#000',
    zIndex: 20,
    elevation: 20,
  },
  primaryBtn: {
    backgroundColor: Brand.primarySolid,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Brand.primaryBorder,
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  orText: { textAlign: 'center', color: '#6b7280', marginTop: 4 },
  socialStack: {
    gap: 14,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 10,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#111827',
  },
  socialText: { color: '#e5e7eb', fontWeight: '600' },
  errorText: { color: '#ef4444', marginTop: 8, textAlign: 'center', fontSize: 13 },
  infoText: { color: Brand.infoText, marginTop: 8, textAlign: 'center', fontSize: 13 },
  infoBox: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.infoBoxBorder,
    backgroundColor: Brand.infoBoxBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoBoxText: { color: Brand.infoBoxText, textAlign: 'center', fontSize: 12 },
  forgotLinkWrap: { alignSelf: 'flex-end', marginTop: 8 },
  forgotLink: { color: Brand.primary, fontSize: 13, fontWeight: '600' },
  forgotHint: { color: '#9ca3af', fontSize: 13, marginTop: 10, lineHeight: 18 },
  backForgot: { marginTop: 12, alignItems: 'center' },
});

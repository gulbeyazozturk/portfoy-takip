import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
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
        setTimeout(() => reject(new Error('İstek zaman aşımına uğradı. Lütfen tekrar dene.')), ms);
      }),
    ]);
  };

  const submit = async () => {
    if (busy) return;
    if (!isEmailValid) {
      setError('Geçerli bir e-posta adresi gir.');
      return;
    }
    if (!isPasswordValid) {
      setError('Şifre en az 6 karakter olmalı.');
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
        setInfo('Kaydın oluşturuldu. Giriş için "Giriş Yap" sekmesinden devam et.');
        setMode('signin');
        return;
      }
      setInfo('Kaydın oluşturuldu ve giriş yapıldı.');
      if (hasSession) router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message ?? 'İşlem sırasında bir hata oluştu.');
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'google' | 'apple') => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const fn = provider === 'google' ? signInWithGoogle : signInWithApple;
    const { error: authError } = await fn();
    setBusy(false);
    if (authError) setError(authError);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <Ionicons name="pie-chart" size={28} color="#3b82f6" />
        </View>
        <ThemedText style={styles.title}>Portfoy Takip</ThemedText>
        <ThemedText style={styles.subtitle}>Hesabina giris yap veya yeni bir hesap olustur.</ThemedText>

        <View style={styles.modeRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
            onPress={() => setMode('signin')}
          >
            <ThemedText style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>Giris Yap</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
            onPress={() => setMode('signup')}
          >
            <ThemedText style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>Uye Ol</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.label}>E-posta</ThemedText>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="ornek@mail.com"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />

          <ThemedText style={[styles.label, { marginTop: 10 }]}>Sifre</ThemedText>
          <TextInput
            secureTextEntry
            placeholder="En az 6 karakter"
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
              <ThemedText style={styles.primaryBtnText}>{mode === 'signin' ? 'Giris Yap' : 'Uye Ol'}</ThemedText>
            )}
          </TouchableOpacity>
        </View>

        <ThemedText style={styles.orText}>veya</ThemedText>

        <TouchableOpacity activeOpacity={0.85} style={styles.socialBtn} onPress={() => social('google')} disabled={busy}>
          <Ionicons name="logo-google" size={18} color="#e5e7eb" />
          <ThemedText style={styles.socialText}>Google ile devam et</ThemedText>
        </TouchableOpacity>

        {showAppleButton ? (
          <TouchableOpacity activeOpacity={0.85} style={styles.socialBtn} onPress={() => social('apple')} disabled={busy}>
            <Ionicons name="logo-apple" size={18} color="#e5e7eb" />
            <ThemedText style={styles.socialText}>Apple ile devam et</ThemedText>
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
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59,130,246,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { marginTop: 10, textAlign: 'center', color: '#f9fafb', fontWeight: '700', fontSize: 24 },
  subtitle: { marginTop: 6, textAlign: 'center', color: '#9ca3af', fontSize: 13, marginBottom: 18 },
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
  modeBtnActive: { borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.18)' },
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
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
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

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { OmnifolioBrand } from '@/components/omnifolio-brand';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth';
import { mapAuthErrorMessage } from '@/lib/auth-error-map';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { loading, session, passwordRecoveryPending, completePasswordRecoveryFlow, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (password.length < 6) return false;
    return password === confirm;
  }, [busy, password, confirm]);

  const submit = async () => {
    if (!canSubmit) {
      if (password.length < 6) {
        setError(t('auth.passwordShort'));
        return;
      }
      setError(t('auth.resetPasswordMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: upd } = await supabase.auth.updateUser({ password });
      if (upd) {
        setError(mapAuthErrorMessage(upd.message));
        return;
      }
      completePasswordRecoveryFlow();
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setError(mapAuthErrorMessage(e instanceof Error ? e.message : t('auth.genericError')));
    } finally {
      setBusy(false);
    }
  };

  const goAuth = async () => {
    completePasswordRecoveryFlow();
    await signOut();
    router.replace('/auth');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator color="#60a5fa" />
        </View>
      </SafeAreaView>
    );
  }

  if (!session || !passwordRecoveryPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, { paddingTop: 24 + insets.top }]}>
          <OmnifolioBrand />
          <ThemedText style={styles.err}>{t('auth.resetLinkInvalid')}</ThemedText>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void goAuth()}>
            <ThemedText style={styles.secondaryBtnText}>{t('auth.backToSignIn')}</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, { paddingTop: 24 + insets.top }]}>
        <OmnifolioBrand />
        <ThemedText style={styles.title}>{t('auth.resetPasswordTitle')}</ThemedText>
        <ThemedText style={styles.hint}>{t('auth.resetPasswordHint')}</ThemedText>

        <View style={styles.card}>
          <ThemedText style={styles.label}>{t('auth.password')}</ThemedText>
          <TextInput
            secureTextEntry
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          <ThemedText style={[styles.label, { marginTop: 10 }]}>{t('auth.resetPasswordConfirm')}</ThemedText>
          <TextInput
            secureTextEntry
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor="#6b7280"
            value={confirm}
            onChangeText={setConfirm}
            style={styles.input}
          />

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!canSubmit}
            style={[styles.primaryBtn, !canSubmit && styles.disabledBtn]}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>{t('auth.resetPasswordSubmit')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>

        {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

        <TouchableOpacity style={styles.linkWrap} onPress={() => void goAuth()} disabled={busy}>
          <ThemedText style={styles.link}>{t('auth.backToSignIn')}</ThemedText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, paddingHorizontal: 20 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  hint: { color: '#9ca3af', fontSize: 13, marginTop: 8, marginBottom: 16, textAlign: 'center' },
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
  errorText: { color: '#ef4444', marginTop: 12, textAlign: 'center', fontSize: 13 },
  err: { color: '#ef4444', textAlign: 'center', marginTop: 24, fontSize: 14 },
  secondaryBtn: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
  },
  secondaryBtnText: { color: '#e5e7eb', fontWeight: '600' },
  linkWrap: { marginTop: 20, alignItems: 'center' },
  link: { color: '#60a5fa', fontSize: 14 },
});

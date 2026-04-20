import * as LocalAuthentication from 'expo-local-authentication';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppLock } from '@/context/app-lock';
import { useAuth } from '@/context/auth';
import type { PortfolioRow } from '@/context/portfolio';
import { usePortfolio } from '@/context/portfolio';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

const APP_VERSION = '1.0.0';

type AppExtra = {
  githubUsername?: string;
  githubRepoSlug?: string;
};

const extra = Constants.expoConfig?.extra as AppExtra | undefined;
const githubUsername = extra?.githubUsername ?? 'gulbeyazozturk';
const githubRepoSlug = extra?.githubRepoSlug ?? 'portfoy-takip';
/** GitHub Pages: `docs/privacy-policy.html`, branch `main`, klasör `/docs` — bkz. docs/HESAP-DEVRI.md */
const PRIVACY_POLICY_URL = `https://${githubUsername}.github.io/${githubRepoSlug}/privacy-policy.html`;

/** Portföy sekmesi (index) ile aynı seçim / hap paleti */
const PRIMARY = '#89acff';
const ON_PRIMARY = '#002b6a';
const SURFACE_CONTAINER = '#191919';
const SURFACE_CONTAINER_HIGH = '#1f1f1f';
const ON_SURFACE_VARIANT = '#ababab';
const OUTLINE_VARIANT = '#484848';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const { appLockEnabled, setAppLockEnabled, biometricSupported, refreshBiometricSupport } = useAppLock();
  const { portfolios, refresh, addPortfolio, renamePortfolio } = usePortfolio();
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renameTarget, setRenameTarget] = useState<PortfolioRow | null>(null);
  const [portfolioBusy, setPortfolioBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshBiometricSupport();
      void refresh();
    }, [refreshBiometricSupport, refresh]),
  );

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut();
      router.replace('/auth');
    } catch (e: any) {
      Alert.alert(t('settings.signOutError'), e?.message ?? t('settings.signOutErrorBody'));
    } finally {
      setSigningOut(false);
    }
  };

  const performDeleteAccount = async () => {
    try {
      setDeletingAccount(true);
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        Alert.alert(t('settings.deleteAccountErrorTitle'), error.message || t('settings.deleteAccountErrorBody'));
        return;
      }
      await signOut();
      router.replace('/auth');
      Alert.alert(t('settings.deleteAccountDoneTitle'), t('settings.deleteAccountDoneBody'));
    } catch (e: any) {
      Alert.alert(t('settings.deleteAccountErrorTitle'), e?.message ?? t('settings.deleteAccountErrorBody'));
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    if (deletingAccount) return;
    Alert.alert(
      t('settings.deleteAccountConfirmTitle'),
      t('settings.deleteAccountConfirmBody'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccountConfirmContinue'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('settings.deleteAccountLastConfirmTitle'),
              t('settings.deleteAccountLastConfirmBody'),
              [
                { text: t('settings.cancel'), style: 'cancel' },
                {
                  text: t('settings.deleteAccountAction'),
                  style: 'destructive',
                  onPress: () => void performDeleteAccount(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleAppLockToggle = async (value: boolean) => {
    if (lockBusy) return;
    if (!value) {
      await setAppLockEnabled(false);
      return;
    }

    setLockBusy(true);
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!has || !enrolled) {
        Alert.alert(t('appLock.unavailableTitle'), t('appLock.unavailableBody'));
        return;
      }
      /** Doğrulamayı AppLockGate tek seferde yapar (çift Face ID istemini önler). */
      await setAppLockEnabled(true);
      await refreshBiometricSupport();
    } finally {
      setLockBusy(false);
    }
  };

  const openRename = (p: PortfolioRow) => {
    setRenameTarget(p);
    setNameDraft(p.name);
    setRenameModalOpen(true);
  };

  const submitAddPortfolio = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert(t('settings.portfolioSaveError'), t('settings.portfolioNameRequired'));
      return;
    }
    setPortfolioBusy(true);
    try {
      const res = await addPortfolio(trimmed);
      if (res.error === 'empty_name') {
        Alert.alert(t('settings.portfolioSaveError'), t('settings.portfolioNameRequired'));
        return;
      }
      if (res.error === 'duplicate_name') {
        Alert.alert(t('settings.portfolioSaveError'), t('settings.portfolioDuplicateName'));
        return;
      }
      if (res.error) {
        Alert.alert(t('settings.portfolioSaveError'), res.error);
        return;
      }
      setAddModalOpen(false);
      setNameDraft('');
    } finally {
      setPortfolioBusy(false);
    }
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert(t('settings.portfolioSaveError'), t('settings.portfolioNameRequired'));
      return;
    }
    setPortfolioBusy(true);
    try {
      const res = await renamePortfolio(renameTarget.id, trimmed);
      if (res.error === 'empty_name') {
        Alert.alert(t('settings.portfolioSaveError'), t('settings.portfolioNameRequired'));
        return;
      }
      if (res.error === 'duplicate_name') {
        Alert.alert(t('settings.portfolioSaveError'), t('settings.portfolioDuplicateName'));
        return;
      }
      if (res.error) {
        Alert.alert(t('settings.portfolioSaveError'), res.error);
        return;
      }
      setRenameModalOpen(false);
      setRenameTarget(null);
      setNameDraft('');
    } finally {
      setPortfolioBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container} lightColor="#000000" darkColor="#000000">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ThemedText type="subtitle">{t('settings.title')}</ThemedText>
          <ThemedText style={styles.version}>{t('settings.version', { v: APP_VERSION })}</ThemedText>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>{t('settings.portfoliosSection')}</ThemedText>
            <ThemedText style={styles.mutedSmall}>{t('settings.portfoliosHint')}</ThemedText>
            <View style={styles.portfolioList}>
              {portfolios.map((p) => (
                <View key={p.id} style={styles.portfolioRow}>
                  <ThemedText style={styles.portfolioName} numberOfLines={2}>
                    {p.name}
                  </ThemedText>
                  <Pressable style={styles.renameBtn} onPress={() => openRename(p)} hitSlop={8}>
                    <ThemedText style={styles.renameBtnText}>{t('settings.renamePortfolio')}</ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable
              style={styles.addPortfolioBtn}
              onPress={() => {
                setNameDraft('');
                setAddModalOpen(true);
              }}>
              <ThemedText style={styles.addPortfolioBtnText}>{t('settings.addPortfolio')}</ThemedText>
            </Pressable>
          </View>

          <View style={styles.langRow}>
            <ThemedText style={styles.langLabel}>{t('settings.language')}</ThemedText>
            <LanguageToggle compact />
          </View>

          <View style={styles.lockSection}>
            {biometricSupported ? (
              <View style={styles.lockRow}>
                <View style={styles.lockTextCol}>
                  <ThemedText style={styles.lockTitle}>{t('settings.appLock')}</ThemedText>
                  <ThemedText style={styles.mutedSmall}>{t('settings.appLockHint')}</ThemedText>
                </View>
                {lockBusy ? (
                  <ActivityIndicator color={PRIMARY} />
                ) : (
                  <Switch
                    value={appLockEnabled}
                    onValueChange={(v) => void handleAppLockToggle(v)}
                    trackColor={{ false: '#374151', true: PRIMARY }}
                    thumbColor="#f9fafb"
                    ios_backgroundColor="#374151"
                  />
                )}
              </View>
            ) : (
              <ThemedText style={styles.muted}>{t('settings.appLockUnavailable')}</ThemedText>
            )}
          </View>

          {PRIVACY_POLICY_URL ? (
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <ThemedText style={styles.link}>{t('settings.privacy')}</ThemedText>
            </Pressable>
          ) : (
            <ThemedText style={styles.muted}>{t('settings.privacyStore')}</ThemedText>
          )}
          <Pressable style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut}>
            {signingOut ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signOutText}>{t('settings.signOut')}</ThemedText>
            )}
          </Pressable>
          <Pressable
            style={[styles.deleteAccountBtn, deletingAccount && styles.deleteAccountBtnDisabled]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}>
            {deletingAccount ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.deleteAccountText}>{t('settings.deleteAccountAction')}</ThemedText>
            )}
          </Pressable>
          <ThemedText style={styles.deleteAccountHint}>{t('settings.deleteAccountHint')}</ThemedText>
        </ScrollView>

        <Modal visible={addModalOpen} transparent animationType="fade" onRequestClose={() => setAddModalOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => !portfolioBusy && setAddModalOpen(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <ThemedText style={styles.modalLabel}>{t('settings.addPortfolio')}</ThemedText>
              <TextInput
                style={styles.input}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder={t('settings.portfolioNamePlaceholder')}
                placeholderTextColor="#6b7280"
                autoFocus
                editable={!portfolioBusy}
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalBtnGhost} onPress={() => setAddModalOpen(false)} disabled={portfolioBusy}>
                  <ThemedText style={styles.modalBtnGhostText}>{t('settings.cancel')}</ThemedText>
                </Pressable>
                <Pressable style={styles.modalBtnPrimary} onPress={() => void submitAddPortfolio()} disabled={portfolioBusy}>
                  {portfolioBusy ? (
                    <ActivityIndicator color={ON_PRIMARY} />
                  ) : (
                    <ThemedText style={styles.modalBtnPrimaryText}>{t('settings.save')}</ThemedText>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={renameModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !portfolioBusy && setRenameModalOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => !portfolioBusy && setRenameModalOpen(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <ThemedText style={styles.modalLabel}>{t('settings.renamePortfolio')}</ThemedText>
              <TextInput
                style={styles.input}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder={t('settings.portfolioNamePlaceholder')}
                placeholderTextColor="#6b7280"
                autoFocus
                editable={!portfolioBusy}
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalBtnGhost}
                  onPress={() => setRenameModalOpen(false)}
                  disabled={portfolioBusy}>
                  <ThemedText style={styles.modalBtnGhostText}>{t('settings.cancel')}</ThemedText>
                </Pressable>
                <Pressable style={styles.modalBtnPrimary} onPress={() => void submitRename()} disabled={portfolioBusy}>
                  {portfolioBusy ? (
                    <ActivityIndicator color={ON_PRIMARY} />
                  ) : (
                    <ThemedText style={styles.modalBtnPrimaryText}>{t('settings.save')}</ThemedText>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 14,
  },
  version: { color: '#9ca3af', marginTop: 4 },
  section: {
    width: '100%',
    maxWidth: 360,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  sectionTitle: { color: '#e5e7eb', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  portfolioList: { gap: 8, marginTop: 8 },
  portfolioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: SURFACE_CONTAINER,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
  },
  portfolioName: { flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '600' },
  renameBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER_HIGH,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
  },
  renameBtnText: { color: PRIMARY, fontSize: 12, fontWeight: '700' },
  addPortfolioBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  addPortfolioBtnText: { color: ON_PRIMARY, fontWeight: '700', fontSize: 13 },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  langLabel: { color: '#d1d5db', fontSize: 14 },
  lockSection: {
    width: '100%',
    maxWidth: 360,
    marginTop: 8,
    marginBottom: 4,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  lockTextCol: { flex: 1 },
  lockTitle: { color: '#e5e7eb', fontSize: 16, fontWeight: '600' },
  mutedSmall: { color: '#6b7280', fontSize: 12, marginTop: 4, lineHeight: 16 },
  link: { color: PRIMARY, textDecorationLine: 'underline', marginTop: 8 },
  muted: { color: '#6b7280', fontSize: 13, marginTop: 8 },
  signOutBtn: {
    marginTop: 12,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  signOutText: { color: '#fff', fontWeight: '700' },
  deleteAccountBtn: {
    marginTop: 8,
    backgroundColor: '#991b1b',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  deleteAccountBtnDisabled: {
    opacity: 0.7,
  },
  deleteAccountText: { color: '#fff', fontWeight: '700' },
  deleteAccountHint: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: SURFACE_CONTAINER,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: OUTLINE_VARIANT,
  },
  modalLabel: { color: '#e5e7eb', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.45)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: SURFACE_CONTAINER_HIGH,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  modalBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: SURFACE_CONTAINER_HIGH,
    borderWidth: 1,
    borderColor: 'rgba(72,72,72,0.35)',
  },
  modalBtnGhostText: { color: ON_SURFACE_VARIANT, fontSize: 13, fontWeight: '700' },
  modalBtnPrimary: {
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    minWidth: 100,
    alignItems: 'center',
  },
  modalBtnPrimaryText: { color: ON_PRIMARY, fontWeight: '700', fontSize: 14 },
});

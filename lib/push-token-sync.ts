import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

let handlerSet = false;

function ensureForegroundHandler() {
  if (handlerSet) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerSet = true;
}

function resolveProjectId(): string | null {
  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig =
    'easConfig' in Constants
      ? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
      : undefined;
  const pid = (fromExpoConfig || fromEasConfig || '').trim();
  return pid || null;
}

function platformLabel(): string {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

export async function syncPushTokenForUser(userId: string): Promise<void> {
  if (!userId || Platform.OS === 'web') return;
  ensureForegroundHandler();

  // Fiziksel cihaz dışında push token güvenilir değil (simülatör/emülatör).
  if (!Device.isDevice) return;

  const projectId = resolveProjectId();
  if (!projectId) return;

  const existingPerm = await Notifications.getPermissionsAsync();
  let status = existingPerm.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return;

  const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResp?.data?.trim();
  if (!token) return;

  await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: platformLabel(),
      enabled: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token', ignoreDuplicates: false },
  );
}


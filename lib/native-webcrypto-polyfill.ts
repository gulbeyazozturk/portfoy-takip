/**
 * Expo Go / RN: global.crypto.getRandomValues (react-native-get-random-values) vardır
 * ama crypto.subtle yok → @supabase/auth-js PKCE'yi "plain"e düşürür → OAuth kırılabilir.
 * Bu dosya _layout'ta en üstte import edilmelidir (supabase'den önce).
 */
import 'react-native-get-random-values';

import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  const g = globalThis as typeof globalThis & {
    crypto?: Crypto & { subtle?: SubtleCrypto };
  };

  if (!g.crypto) {
    g.crypto = {} as Crypto;
  }

  const hasDigest = typeof g.crypto.subtle?.digest === 'function';
  if (!hasDigest) {
    g.crypto.subtle = {
      digest: async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name !== 'SHA-256') {
          throw new Error(`[Omnifolio] crypto.subtle.digest: only SHA-256 supported, got ${name}`);
        }
        const bytes =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes);
      },
    } as SubtleCrypto;
  }
}

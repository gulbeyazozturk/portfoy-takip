import * as Crypto from 'expo-crypto';

/** Native Apple Sign In: SHA-256 hash Apple'a, ham değer Supabase signInWithIdToken'a gider. */
export async function createAppleSignInNonce(): Promise<{ rawNonce: string; hashedNonce: string }> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  return { rawNonce, hashedNonce };
}

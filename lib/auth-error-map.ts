import i18n from '@/lib/i18n';

export function mapAuthErrorMessage(message: string | null | undefined): string {
  const raw = (message ?? '').trim();
  if (!raw) return i18n.t('auth.genericError');

  const normalized = raw.toLowerCase();

  // Supabase Auth: provider toggle kapalı (Dashboard → Authentication → Providers).
  if (
    normalized.includes('unsupported provider') ||
    normalized.includes('provider is not enabled') ||
    normalized.includes('provider not enabled')
  ) {
    return i18n.t('auth.providerNotEnabled');
  }

  if (
    normalized.includes('bad id token') ||
    normalized.includes('unacceptable audience') ||
    normalized.includes('invalid audience')
  ) {
    return i18n.t('errors.appleClientIdMismatch');
  }
  if (normalized.includes('nonce')) {
    return i18n.t('errors.appleNativeFailed');
  }

  if (normalized.includes('invalid login credentials')) return i18n.t('auth.invalidCredentials');
  if (normalized.includes('email not confirmed')) return i18n.t('auth.emailNotConfirmed');
  if (normalized.includes('new password should be different')) return i18n.t('auth.newPasswordMustDiffer');
  if (normalized.includes('password should be at least')) return i18n.t('auth.passwordShort');
  if (normalized.includes('password is too weak')) return i18n.t('auth.passwordWeak');
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) return i18n.t('auth.tooManyRequests');
  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('network request failed') ||
    normalized.includes('network error') ||
    normalized.includes('fetch failed') ||
    normalized.includes('sunucuya ulaşı') ||
    normalized.includes('could not connect') ||
    normalized.includes('unable to resolve host')
  ) {
    return i18n.t('errors.networkUnreachable');
  }
  if (normalized.includes('token has expired') || normalized.includes('expired') || normalized.includes('otp')) {
    return i18n.t('auth.resetLinkInvalid');
  }

  return raw;
}

/** Portföy / varlık listesi — ikon yoksa kategori renginde daire + sembol harfi. */
export const AVATAR_SOLID: Record<string, string> = {
  default: '#546e7a',
  bist: '#1e88e5',
  yurtdisi: '#455a64',
  kripto: '#7c3aed',
  fon: '#5e35b1',
  doviz: '#0288d1',
  emtia: '#f59e0b',
  mevduat: '#ca8a04',
};

export function assetAvatarBg(symbol: string, categoryId: string): string {
  return AVATAR_SOLID[symbol] ?? AVATAR_SOLID[categoryId] ?? AVATAR_SOLID.default;
}

/** ABD hisseleri ve kripto: birim fiyat / tutar doğrudan USD; TL gösterimde kur ile çarpılır. */
export function isUsdNativeCategory(categoryId: string | undefined | null): boolean {
  return categoryId === 'yurtdisi' || categoryId === 'kripto';
}

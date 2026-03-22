/** Supabase `categories.id` ile locale dosyalarındaki `categories.<id>` anahtarları eşleşir. */
export const I18N_CATEGORY_IDS = [
  'yurtdisi',
  'bist',
  'doviz',
  'emtia',
  'fon',
  'kripto',
  'mevduat',
] as const;

export type I18nCategoryId = (typeof I18N_CATEGORY_IDS)[number];

export function isI18nCategoryId(id: string): id is I18nCategoryId {
  return (I18N_CATEGORY_IDS as readonly string[]).includes(id);
}

/** Bilinen id için çeviri; aksi halde veritabanı adı. */
export function categoryDisplayLabel(id: string, dbName: string, t: (key: string) => string): string {
  if (!isI18nCategoryId(id)) return dbName;
  return t(`categories.${id}`);
}

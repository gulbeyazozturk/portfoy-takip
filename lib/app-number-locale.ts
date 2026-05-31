/** i18n dil kodundan Intl / DateTimePicker locale türetir. */
export function getAppNumberLocale(language: string | undefined): 'tr-TR' | 'en-US' {
  return language?.toLowerCase().startsWith('en') ? 'en-US' : 'tr-TR';
}

/** DateTimePicker haftanın ilk günü (Android). */
export function getDatePickerFirstDayOfWeek(language: string | undefined): 0 | 1 | 6 {
  return language?.toLowerCase().startsWith('en') ? 0 : 1;
}

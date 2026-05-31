/** Her kelimenin ilk harfi büyük, geri kalanı küçük (tr-TR). */
export function toTitleCaseWords(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      const lower = word.toLocaleLowerCase('tr-TR');
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
    })
    .join(' ');
}

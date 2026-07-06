export const SUMMARY_FONT_SIZE_STORAGE_KEY = 'youwee_library_summary_font_size';

export const SUMMARY_FONT_SIZES = ['small', 'medium', 'large'] as const;

export type SummaryFontSize = (typeof SUMMARY_FONT_SIZES)[number];

export const DEFAULT_SUMMARY_FONT_SIZE: SummaryFontSize = 'medium';

export const SUMMARY_FONT_SIZE_CLASS: Record<SummaryFontSize, string> = {
  small: 'text-[13px]',
  medium: 'text-[15px]',
  large: 'text-[17px]',
};

export function getSummaryFontSizeClass(fontSize: SummaryFontSize): string {
  return SUMMARY_FONT_SIZE_CLASS[fontSize];
}

export function normalizeSummaryFontSize(value: unknown): SummaryFontSize {
  return SUMMARY_FONT_SIZES.includes(value as SummaryFontSize)
    ? (value as SummaryFontSize)
    : DEFAULT_SUMMARY_FONT_SIZE;
}

export function getNextSummaryFontSize(
  current: SummaryFontSize,
  direction: -1 | 1,
): SummaryFontSize {
  const index = SUMMARY_FONT_SIZES.indexOf(current);
  const nextIndex = Math.min(SUMMARY_FONT_SIZES.length - 1, Math.max(0, index + direction));
  return SUMMARY_FONT_SIZES[nextIndex];
}

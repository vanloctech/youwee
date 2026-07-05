import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SUMMARY_FONT_SIZE,
  getNextSummaryFontSize,
  getSummaryFontSizeClass,
  normalizeSummaryFontSize,
} from '../src/lib/summary-font-size';

describe('history summary dialog font sizing', () => {
  test('normalizes unknown stored values to the default size', () => {
    expect(normalizeSummaryFontSize('tiny')).toBe(DEFAULT_SUMMARY_FONT_SIZE);
    expect(normalizeSummaryFontSize(null)).toBe(DEFAULT_SUMMARY_FONT_SIZE);
  });

  test('steps font size within the supported range', () => {
    expect(getNextSummaryFontSize('medium', 1)).toBe('large');
    expect(getNextSummaryFontSize('medium', -1)).toBe('small');
    expect(getNextSummaryFontSize('large', 1)).toBe('large');
    expect(getNextSummaryFontSize('small', -1)).toBe('small');
  });

  test('returns the reusable class for a supported summary font size', () => {
    expect(getSummaryFontSizeClass('small')).toBe('text-[13px]');
    expect(getSummaryFontSizeClass('medium')).toBe('text-[15px]');
    expect(getSummaryFontSizeClass('large')).toBe('text-[17px]');
  });
});

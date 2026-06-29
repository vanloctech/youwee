import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SUMMARY_FONT_SIZE,
  getNextSummaryFontSize,
  normalizeSummaryFontSize,
} from '../src/components/history/summaryDialogFontSize';

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
});

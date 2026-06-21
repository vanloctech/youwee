import { describe, expect, test } from 'bun:test';
import { parseExternalSummaryDeepLink } from '../src/lib/external-link';

describe('parseExternalSummaryDeepLink', () => {
  test('accepts YouTube summary deep links', () => {
    const parsed = parseExternalSummaryDeepLink(
      'youwee://summary?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123&source=ext-chromium',
    );

    expect(parsed?.url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(parsed?.source).toBe('ext-chromium');
  });

  test('rejects private HTTP URLs', () => {
    expect(
      parseExternalSummaryDeepLink(
        'youwee://summary?v=1&url=http%3A%2F%2Flocalhost%3A3000%2Fwatch%3Fv%3Dabc123',
      ),
    ).toBeNull();
  });
});

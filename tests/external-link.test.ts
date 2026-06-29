import { describe, expect, test } from 'bun:test';
import { parseExternalDeepLink, parseExternalSummaryDeepLink } from '../src/lib/external-link';

describe('parseExternalDeepLink', () => {
  test('accepts Chromium extension download-now links', () => {
    const parsed = parseExternalDeepLink(
      'youwee://download?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DOvvDNFONxr0%26list%3DPL123%26index%3D2&target=youtube&action=download_now&media=video&quality=1080&source=ext-chromium',
    );

    expect(parsed).toMatchObject({
      url: 'https://www.youtube.com/watch?v=OvvDNFONxr0',
      target: 'youtube',
      action: 'download_now',
      source: 'ext-chromium',
      enqueueOptions: {
        mediaType: 'video',
        quality: '1080',
      },
    });
  });

  test('accepts Chromium extension add-to-queue audio links', () => {
    const parsed = parseExternalDeepLink(
      'youwee://download?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123&target=youtube&action=queue_only&media=audio&quality=128&source=ext-chromium',
    );

    expect(parsed).toMatchObject({
      url: 'https://www.youtube.com/watch?v=abc123',
      target: 'youtube',
      action: 'queue_only',
      source: 'ext-chromium',
      enqueueOptions: {
        mediaType: 'audio',
        quality: 'audio',
        audioBitrate: '128',
      },
    });
  });
});

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

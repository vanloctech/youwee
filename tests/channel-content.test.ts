import { describe, expect, test } from 'bun:test';
import { isTikTokChannelContentUrl, matchesChannelContentType } from '../src/lib/channel-content';

describe('TikTok channel URL validation', () => {
  test('accepts creator profiles and query parameters', () => {
    expect(isTikTokChannelContentUrl('https://www.tiktok.com/@creator')).toBe(true);
    expect(isTikTokChannelContentUrl('https://tiktok.com/@creator?lang=en')).toBe(true);
  });

  test('rejects video links and lookalike domains', () => {
    expect(isTikTokChannelContentUrl('https://www.tiktok.com/@creator/video/123')).toBe(false);
    expect(isTikTokChannelContentUrl('https://tiktok.com.example.org/@creator')).toBe(false);
  });
});

describe('TikTok channel duration filter', () => {
  test('classifies 60 seconds and below as short, and longer videos as long', () => {
    expect(matchesChannelContentType('tiktok', 'shorts', 60)).toBe(true);
    expect(matchesChannelContentType('tiktok', 'shorts', 60.1)).toBe(false);
    expect(matchesChannelContentType('tiktok', 'videos', 60)).toBe(false);
    expect(matchesChannelContentType('tiktok', 'videos', 61)).toBe(true);
  });

  test('keeps all entries for all-video selection and leaves other platforms unchanged', () => {
    expect(matchesChannelContentType('tiktok', 'videos_shorts', undefined)).toBe(true);
    expect(matchesChannelContentType('youtube', 'shorts', 500)).toBe(true);
    expect(matchesChannelContentType('tiktok', 'shorts', undefined)).toBe(false);
  });
});

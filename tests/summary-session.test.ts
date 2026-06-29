import { describe, expect, test } from 'bun:test';
import {
  createInitialSummarySessionState,
  summarySessionReducer,
} from '../src/lib/summary-session';

describe('summarySessionReducer', () => {
  test('keeps completed summary state until the user starts another summary', () => {
    const initial = createInitialSummarySessionState({
      style: 'concise',
      language: 'auto',
      transcriptLanguages: ['en'],
    });

    const loading = summarySessionReducer(initial, {
      type: 'start',
      url: 'https://www.youtube.com/watch?v=abc',
      options: initial.options,
    });
    const completed = summarySessionReducer(loading, {
      type: 'complete',
      result: {
        summary: 'Summary text',
        videoInfo: {
          url: 'https://www.youtube.com/watch?v=abc',
          title: 'Video title',
          thumbnail: 'https://example.com/thumb.jpg',
          duration: 120,
        },
      },
    });

    expect(completed.status).toBe('completed');
    expect(completed.isLoading).toBe(false);
    expect(completed.result?.summary).toBe('Summary text');
    expect(completed.url).toBe('https://www.youtube.com/watch?v=abc');

    const nextLoading = summarySessionReducer(completed, {
      type: 'start',
      url: 'https://www.youtube.com/watch?v=next',
      options: completed.options,
    });

    expect(nextLoading.result).toBeNull();
    expect(nextLoading.saved).toBe(false);
    expect(nextLoading.status).toBe('fetching-info');
  });

  test('cancels a running summary without discarding the current input', () => {
    const initial = createInitialSummarySessionState({
      style: 'detailed',
      language: 'vi',
      transcriptLanguages: ['vi', 'en'],
    });
    const loading = summarySessionReducer(initial, {
      type: 'start',
      url: 'https://youtu.be/abc',
      options: initial.options,
    });

    const cancelled = summarySessionReducer(loading, { type: 'cancel' });

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.isLoading).toBe(false);
    expect(cancelled.url).toBe('https://youtu.be/abc');
    expect(cancelled.loadingStatus).toBe('');
  });
});

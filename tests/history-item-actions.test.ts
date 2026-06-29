import { describe, expect, test } from 'bun:test';
import { getHistoryItemActionLayout } from '../src/components/history/historyItemActions';

describe('getHistoryItemActionLayout', () => {
  test('keeps only primary actions visible for regular library items', () => {
    const layout = getHistoryItemActionLayout({
      fileExists: true,
      isDataExport: false,
      aiEnabled: true,
    });

    expect(layout.primary).toEqual(['open-folder']);
    expect(layout.summary).toBe('generate-summary');
    expect(layout.overflow).toEqual(['rename', 'open-url', 'copy-url', 'manage-tags', 'delete']);
  });

  test('shows re-download as the primary action when a media file is missing', () => {
    const layout = getHistoryItemActionLayout({
      fileExists: false,
      isDataExport: false,
      aiEnabled: true,
    });

    expect(layout.primary).toEqual(['redownload']);
    expect(layout.summary).toBe('generate-summary');
    expect(layout.overflow).toEqual(['open-url', 'copy-url', 'manage-tags', 'delete']);
  });

  test('does not show AI or URL actions for data export items', () => {
    const layout = getHistoryItemActionLayout({
      fileExists: true,
      isDataExport: true,
      aiEnabled: true,
    });

    expect(layout.primary).toEqual(['open-folder']);
    expect(layout.summary).toBeNull();
    expect(layout.overflow).toEqual(['rename', 'manage-tags', 'delete']);
  });
});

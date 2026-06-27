import { describe, expect, test } from 'bun:test';
import {
  buildItemDownloadSettingsSnapshot,
  createDefaultDownloadSettings,
  serializeDownloadSettings,
} from '../src/lib/download-settings';

describe('download settings playlist numbering and chapter split options', () => {
  test('defaults playlist numbering and embedded chapter splitting off', () => {
    const settings = createDefaultDownloadSettings({});

    expect(settings.numberPlaylistItems).toBe(false);
    expect(settings.splitEmbeddedChapters).toBe(false);
    expect(settings.numberChapterFiles).toBe(true);
  });

  test('persists playlist numbering and embedded chapter split options', () => {
    const saved = serializeDownloadSettings(
      createDefaultDownloadSettings({
        numberPlaylistItems: true,
        splitEmbeddedChapters: true,
        numberChapterFiles: false,
      }),
    );

    expect(saved.numberPlaylistItems).toBe(true);
    expect(saved.splitEmbeddedChapters).toBe(true);
    expect(saved.numberChapterFiles).toBe(false);
  });

  test('snapshots playlist and chapter split options into queued items', () => {
    const settings = createDefaultDownloadSettings({
      numberPlaylistItems: true,
      splitEmbeddedChapters: true,
      numberChapterFiles: false,
    });

    const snapshot = buildItemDownloadSettingsSnapshot(settings, {
      pluginWorkflowSnapshots: {},
      postDownloadWorkflowSteps: [],
    });

    expect(snapshot.numberPlaylistItems).toBe(true);
    expect(snapshot.splitEmbeddedChapters).toBe(true);
    expect(snapshot.numberChapterFiles).toBe(false);
  });
});

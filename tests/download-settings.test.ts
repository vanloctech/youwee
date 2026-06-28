import { describe, expect, test } from 'bun:test';
import {
  buildItemDownloadSettingsSnapshot,
  createDefaultDownloadSettings,
  refreshItemPluginWorkflowSnapshots,
  serializeDownloadSettings,
} from '../src/lib/download-settings';
import type {
  ItemDownloadSettings,
  PluginWorkflowSnapshotMap,
  YtdlpAdvancedOption,
} from '../src/lib/types';

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

  test('refreshes plugin workflow snapshots for retried items', () => {
    const settings: ItemDownloadSettings = buildItemDownloadSettingsSnapshot(
      createDefaultDownloadSettings({}),
      {
        pluginWorkflowSnapshots: {
          'download.failed': [],
        },
        postDownloadWorkflowSteps: [],
      },
    );
    const currentSnapshots: PluginWorkflowSnapshotMap = {
      'download.completed': [
        {
          pluginId: 'local.completed',
          pluginName: 'Completed plugin',
          pluginVersion: '1.0.0',
        },
      ],
      'download.failed': [
        {
          pluginId: 'local.failed',
          pluginName: 'Failed plugin',
          pluginVersion: '1.0.0',
        },
      ],
    };

    const refreshed = refreshItemPluginWorkflowSnapshots(settings, currentSnapshots);

    expect(refreshed.pluginWorkflowSnapshots?.['download.failed']).toEqual(
      currentSnapshots['download.failed'],
    );
    expect(refreshed.postDownloadWorkflowSteps).toEqual(currentSnapshots['download.completed']);
  });
});

describe('download settings yt-dlp advanced options', () => {
  const options: YtdlpAdvancedOption[] = [
    { id: 'impersonate', value: 'chrome' },
    { id: 'forceIpv4' },
    { id: 'concurrentFragments', value: '4' },
  ];

  test('defaults yt-dlp advanced options off', () => {
    const settings = createDefaultDownloadSettings({});

    expect(settings.ytdlpAdvancedOptionsEnabled).toBe(false);
    expect(settings.ytdlpAdvancedOptions).toEqual([]);
  });

  test('persists yt-dlp advanced options', () => {
    const saved = serializeDownloadSettings(
      createDefaultDownloadSettings({
        ytdlpAdvancedOptionsEnabled: true,
        ytdlpAdvancedOptions: options,
      }),
    );

    expect(saved.ytdlpAdvancedOptionsEnabled).toBe(true);
    expect(saved.ytdlpAdvancedOptions).toEqual(options);
  });

  test('snapshots yt-dlp advanced options into queued items', () => {
    const settings = createDefaultDownloadSettings({
      ytdlpAdvancedOptionsEnabled: true,
      ytdlpAdvancedOptions: options,
    });

    const snapshot = buildItemDownloadSettingsSnapshot(settings);

    expect(snapshot.ytdlpAdvancedOptionsEnabled).toBe(true);
    expect(snapshot.ytdlpAdvancedOptions).toEqual(options);
    expect(snapshot.ytdlpAdvancedOptions).not.toBe(settings.ytdlpAdvancedOptions);
  });
});

import { describe, expect, test } from 'bun:test';
import {
  buildExternalDownloadSettingsOverrides,
  buildItemDownloadSettingsSnapshot,
  createDefaultDownloadSettings,
  refreshItemPluginWorkflowSnapshots,
  resolveExternalDownloaderSettings,
  sanitizeFilenameMetadataFields,
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

describe('external download settings', () => {
  test('inherits global video settings while keeping extension quality', () => {
    const settings = createDefaultDownloadSettings({
      format: 'mkv',
      outputPath: '/downloads',
      downloadPlaylist: true,
      playlistLimit: 12,
      subtitleMode: 'auto',
      subtitleLangs: ['en', 'ru'],
      subtitleEmbed: true,
      subtitleFormat: 'vtt',
    });

    const overrides = buildExternalDownloadSettingsOverrides(
      settings,
      { mediaType: 'video', quality: '1080' },
      settings.outputPath,
    );
    const snapshot = buildItemDownloadSettingsSnapshot(settings, { overrides });

    expect(snapshot.quality).toBe('1080');
    expect(snapshot.format).toBe('mkv');
    expect(snapshot.outputPath).toBe('/downloads');
    expect(snapshot.downloadPlaylist).toBe(true);
    expect(snapshot.playlistLimit).toBe(12);
    expect(snapshot.subtitleMode).toBe('auto');
    expect(snapshot.subtitleLangs).toEqual(['en', 'ru']);
    expect(snapshot.subtitleEmbed).toBe(true);
    expect(snapshot.subtitleFormat).toBe('vtt');
  });
});

describe('download settings downloaded video memory', () => {
  test('defaults downloaded video memory off and asks before adding duplicates', () => {
    const settings = createDefaultDownloadSettings({});

    expect(settings.rememberDownloadedVideos).toBe(false);
    expect(settings.duplicateDownloadHandling).toBe('ask');
  });

  test('persists allow duplicates handling', () => {
    const saved = serializeDownloadSettings(
      createDefaultDownloadSettings({
        rememberDownloadedVideos: true,
        duplicateDownloadHandling: 'allow',
      }),
    );

    expect(saved.rememberDownloadedVideos).toBe(true);
    expect(saved.duplicateDownloadHandling).toBe('allow');
  });
});

describe('download settings filename metadata', () => {
  test('defaults filename metadata off', () => {
    const settings = createDefaultDownloadSettings({});

    expect(settings.filenameMetadataEnabled).toBe(false);
    expect(settings.filenameMetadataFields).toEqual([]);
  });

  test('persists filename metadata fields', () => {
    const saved = serializeDownloadSettings(
      createDefaultDownloadSettings({
        filenameMetadataEnabled: true,
        filenameMetadataFields: ['uploadDate', 'viewCount', 'videoId'],
      }),
    );

    expect(saved.filenameMetadataEnabled).toBe(true);
    expect(saved.filenameMetadataFields).toEqual(['uploadDate', 'viewCount', 'videoId']);
  });

  test('sanitizes unknown and duplicate filename metadata fields', () => {
    expect(
      sanitizeFilenameMetadataFields(['uploadDate', '--output', 'viewCount', 'uploadDate', null]),
    ).toEqual(['uploadDate', 'viewCount']);
  });

  test('snapshots filename metadata into queued items', () => {
    const settings = createDefaultDownloadSettings({
      filenameMetadataEnabled: true,
      filenameMetadataFields: ['uploader', 'duration'],
    });

    const snapshot = buildItemDownloadSettingsSnapshot(settings);

    expect(snapshot.filenameMetadataEnabled).toBe(true);
    expect(snapshot.filenameMetadataFields).toEqual(['uploader', 'duration']);
    expect(snapshot.filenameMetadataFields).not.toBe(settings.filenameMetadataFields);
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

describe('download settings preferred fps', () => {
  test('defaults preferred fps to original', () => {
    const settings = createDefaultDownloadSettings({});

    expect(settings.preferredFps).toBe('original');
  });

  test('normalizes unsupported preferred fps to original', () => {
    const settings = createDefaultDownloadSettings({
      preferredFps: '60',
    } as unknown as Parameters<typeof createDefaultDownloadSettings>[0]);

    expect(settings.preferredFps).toBe('original');
  });

  test('persists preferred fps', () => {
    const saved = serializeDownloadSettings(
      createDefaultDownloadSettings({
        preferredFps: '30',
      }),
    );

    expect(saved.preferredFps).toBe('30');
  });

  test('snapshots preferred fps into queued items', () => {
    const settings = createDefaultDownloadSettings({
      preferredFps: '30',
    });

    const snapshot = buildItemDownloadSettingsSnapshot(settings);

    expect(snapshot.preferredFps).toBe('30');
  });
});

describe('download settings external downloader', () => {
  test('global Aria2 disable overrides an older queued snapshot', () => {
    expect(
      resolveExternalDownloaderSettings(
        { useAria2: false, aria2Args: '-x 16' },
        { useAria2: true, aria2Args: '-x 32' },
      ),
    ).toEqual({ useAria2: false, aria2Args: '' });
  });

  test('keeps an item-level disable when global Aria2 is enabled', () => {
    expect(
      resolveExternalDownloaderSettings(
        { useAria2: true, aria2Args: '-x 16' },
        { useAria2: false, aria2Args: '' },
      ),
    ).toEqual({ useAria2: false, aria2Args: '' });
  });

  test('uses the queued Aria2 arguments when both scopes are enabled', () => {
    expect(
      resolveExternalDownloaderSettings(
        { useAria2: true, aria2Args: '-x 16' },
        { useAria2: true, aria2Args: '-x 32' },
      ),
    ).toEqual({ useAria2: true, aria2Args: '-x 32' });
  });
});

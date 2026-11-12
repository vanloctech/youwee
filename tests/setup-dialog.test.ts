import { describe, expect, test } from 'bun:test';
import {
  dependencyProgressPercent,
  formatDependencyProgressSize,
} from '../src/lib/dependency-progress';
import {
  getApplicableSetupItems,
  getMissingSetupItems,
  getYtdlpSetupState,
  getYtdlpTargetChannel,
  isSetupItemDone,
  type SetupDependencyState,
  ytdlpSetupNeedsDownload,
} from '../src/lib/setup-dialog';
import type { YtdlpAllVersions } from '../src/lib/types';

function versions(
  overrides: Partial<Record<'stable' | 'nightly', boolean>> = {},
): YtdlpAllVersions {
  const info = (channel: string, installed: boolean) => ({
    channel,
    version: installed ? '2026.10.01' : null,
    installed,
    binary_path: installed ? `/bin/${channel}` : null,
  });
  return {
    current_channel: 'bundled',
    using_fallback: false,
    bundled: info('bundled', true),
    stable: info('stable', overrides.stable ?? false),
    nightly: info('nightly', overrides.nightly ?? false),
  };
}

function state(overrides: Partial<SetupDependencyState> = {}): SetupDependencyState {
  return {
    ytdlpSource: 'auto',
    ytdlpChannel: 'bundled',
    ytdlpAllVersions: versions(),
    ffmpegSource: 'auto',
    ffmpegStatus: { installed: false, version: null, binary_path: null, is_system: false },
    ...overrides,
  };
}

describe('setup dialog items', () => {
  test('a fresh install is missing both yt-dlp Stable and FFmpeg', () => {
    expect(getMissingSetupItems(state())).toEqual(['ytdlp', 'ffmpeg']);
  });

  test('stable or nightly with an installed binary counts as done', () => {
    expect(
      isSetupItemDone(
        'ytdlp',
        state({ ytdlpChannel: 'stable', ytdlpAllVersions: versions({ stable: true }) }),
      ),
    ).toBe(true);
    expect(
      isSetupItemDone(
        'ytdlp',
        state({ ytdlpChannel: 'nightly', ytdlpAllVersions: versions({ nightly: true }) }),
      ),
    ).toBe(true);
  });

  test('stable channel without the binary (fallback) is still missing', () => {
    expect(isSetupItemDone('ytdlp', state({ ytdlpChannel: 'stable' }))).toBe(false);
  });

  test('installed FFmpeg is not suggested', () => {
    const ffmpegStatus = {
      installed: true,
      version: '7.1',
      binary_path: '/bin/ffmpeg',
      is_system: false,
    };
    expect(getMissingSetupItems(state({ ffmpegStatus }))).toEqual(['ytdlp']);
  });

  test('system-managed dependencies are left alone', () => {
    expect(
      getApplicableSetupItems(state({ ytdlpSource: 'system', ffmpegSource: 'system' })),
    ).toEqual([]);
  });

  test('items whose status is unknown are not shown', () => {
    expect(getApplicableSetupItems(state({ ytdlpAllVersions: null, ffmpegStatus: null }))).toEqual(
      [],
    );
  });
});

describe('yt-dlp setup state', () => {
  test('bundled without a Stable binary needs a download', () => {
    const setupState = getYtdlpSetupState(state());
    expect(setupState).toBe('notDownloaded');
    expect(ytdlpSetupNeedsDownload(setupState)).toBe(true);
  });

  test('bundled with a Stable binary on disk only needs a switch', () => {
    const setupState = getYtdlpSetupState(state({ ytdlpAllVersions: versions({ stable: true }) }));
    expect(setupState).toBe('downloadedNotActive');
    expect(ytdlpSetupNeedsDownload(setupState)).toBe(false);
  });

  test('a selected channel without its binary is a missing file', () => {
    expect(getYtdlpSetupState(state({ ytdlpChannel: 'stable' }))).toBe('missingFile');
  });

  test('Nightly users stay on Nightly', () => {
    expect(getYtdlpTargetChannel(state({ ytdlpChannel: 'nightly' }))).toBe('nightly');
    expect(getYtdlpTargetChannel(state())).toBe('stable');
  });
});

describe('dependency download progress', () => {
  const progress = (stage: 'checksum' | 'downloading' | 'verifying', percent = 0, total = 0) => ({
    stage,
    percent,
    downloaded: Math.round((total * percent) / 100),
    total,
  });

  test('shows size and percent only while downloading with a known size', () => {
    expect(formatDependencyProgressSize(progress('downloading', 50, 20 * 1024 * 1024))).toBe(
      '10.0 / 20.0 MB',
    );
    expect(formatDependencyProgressSize(progress('downloading', 0, 0))).toBeNull();
    expect(dependencyProgressPercent(progress('downloading', 40, 1000))).toBe(40);
  });

  test('checksum is indeterminate and verifying is full', () => {
    expect(dependencyProgressPercent(progress('checksum'))).toBeNull();
    expect(dependencyProgressPercent(progress('verifying'))).toBe(100);
    expect(dependencyProgressPercent(null)).toBeNull();
  });
});

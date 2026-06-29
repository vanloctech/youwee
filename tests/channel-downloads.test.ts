import { describe, expect, test } from 'bun:test';
import {
  buildChannelCollectionOptions,
  persistManualChannelDownloadCompletion,
} from '../src/contexts/channels/channel-downloads';

describe('buildChannelCollectionOptions', () => {
  test('uses the channel name as collection name when auto organize is enabled', () => {
    expect(buildChannelCollectionOptions({ autoOrganizeCollections: true }, '  NCS  ')).toEqual({
      autoOrganizeCollections: true,
      playlistCollectionName: 'NCS',
    });
  });

  test('does not request a collection when disabled or missing a channel name', () => {
    expect(buildChannelCollectionOptions({ autoOrganizeCollections: false }, 'NCS')).toEqual({
      autoOrganizeCollections: false,
      playlistCollectionName: null,
    });
    expect(buildChannelCollectionOptions({ autoOrganizeCollections: true }, '   ')).toEqual({
      autoOrganizeCollections: false,
      playlistCollectionName: null,
    });
  });
});

describe('persistManualChannelDownloadCompletion', () => {
  test('waits for the downloaded status to persist after a successful manual channel download', async () => {
    const calls: string[] = [];
    let releasePersist: (() => void) | null = null;

    const completion = persistManualChannelDownloadCompletion({
      downloadVideo: async () => {
        calls.push('download');
      },
      markDownloaded: async () => {
        calls.push('persist:start');
        await new Promise<void>((resolve) => {
          releasePersist = resolve;
        });
        calls.push('persist:end');
      },
      onPersistError: () => {
        calls.push('persist:error');
      },
    });

    await Promise.resolve();

    expect(calls).toEqual(['download', 'persist:start']);

    let resolved = false;
    completion.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    releasePersist?.();
    await completion;

    expect(resolved).toBe(true);
    expect(calls).toEqual(['download', 'persist:start', 'persist:end']);
  });

  test('does not fail the completed download when persisting the channel status fails', async () => {
    const errors: unknown[] = [];

    await expect(
      persistManualChannelDownloadCompletion({
        downloadVideo: async () => {},
        markDownloaded: async () => {
          throw new Error('db unavailable');
        },
        onPersistError: (error) => {
          errors.push(error);
        },
      }),
    ).resolves.toBeUndefined();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});

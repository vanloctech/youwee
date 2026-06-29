import type { DownloadSettings } from '@/lib/types';

type PersistManualChannelDownloadCompletionInput = {
  downloadVideo: () => Promise<void>;
  markDownloaded: () => Promise<void>;
  onPersistError: (error: unknown) => void;
};

export function buildChannelCollectionOptions(
  settings: Partial<Pick<DownloadSettings, 'autoOrganizeCollections'>>,
  channelName: string | null | undefined,
): { autoOrganizeCollections: boolean; playlistCollectionName: string | null } {
  const trimmedChannelName = channelName?.trim() || '';
  const enabled = settings.autoOrganizeCollections === true && trimmedChannelName.length > 0;

  return {
    autoOrganizeCollections: enabled,
    playlistCollectionName: enabled ? trimmedChannelName : null,
  };
}

export async function persistManualChannelDownloadCompletion({
  downloadVideo,
  markDownloaded,
  onPersistError,
}: PersistManualChannelDownloadCompletionInput): Promise<void> {
  await downloadVideo();

  try {
    await markDownloaded();
  } catch (error) {
    onPersistError(error);
  }
}

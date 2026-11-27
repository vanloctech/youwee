import { invoke } from '@tauri-apps/api/core';

export async function openFileLocation(filepath: string): Promise<void> {
  await invoke('open_file_location', { filepath });
}

export async function openFolderLocation(folderpath: string): Promise<void> {
  await invoke('open_folder_location', { folderpath });
}

export async function openChannelFolderLocation(
  channelId: string | null,
  videoUrls: string[],
  fallbackFolderpath: string,
): Promise<void> {
  await invoke('open_channel_folder_location', { channelId, videoUrls, fallbackFolderpath });
}

export async function findHistoryFilepathByUrl(url: string): Promise<string | null> {
  return invoke<string | null>('find_history_filepath_by_url', { url });
}

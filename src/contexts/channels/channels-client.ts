import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  ChannelVideo,
  DownloadProgress,
  FollowedChannel,
  PlaylistVideoEntry,
} from '@/lib/types';

type ChannelInfo = {
  name: string;
  avatar_url: string | null;
};

export type ChannelNewVideosEvent = {
  channel_id: string;
  channel_name: string;
  new_count: number;
  total_new: number;
};

export type ChannelAutoDownloadEvent = {
  channel_id: string;
  channel_name: string;
  quality: string;
  format: string;
  video_codec: string;
  audio_bitrate: string;
  download_threads: number;
};

export async function pickChannelsOutputFolder(defaultPath?: string): Promise<string | null> {
  const folder = await open({
    directory: true,
    multiple: false,
    title: 'Select Download Folder',
    defaultPath,
  });
  return typeof folder === 'string' ? folder : null;
}

export async function getFollowedChannels(): Promise<FollowedChannel[]> {
  return invoke<FollowedChannel[]>('get_followed_channels');
}

export async function getNewVideosCount(channelId: string): Promise<number> {
  return invoke<number>('get_new_videos_count', { channelId });
}

export async function followChannelCommand(input: {
  url: string;
  name: string;
  thumbnail: string | null;
  platform: string;
  downloadQuality: string;
  downloadFormat: string;
  downloadVideoCodec: string;
  downloadAudioBitrate: string;
}): Promise<string> {
  return invoke<string>('follow_channel', input);
}

export async function unfollowChannelCommand(id: string): Promise<void> {
  await invoke('unfollow_channel', { id });
}

export async function rebuildTrayMenu(): Promise<void> {
  await invoke('rebuild_tray_menu_cmd');
}

export async function updateChannelSettingsCommand(input: {
  id: string;
  checkInterval: number;
  autoDownload: boolean;
  downloadQuality: string;
  downloadFormat: string;
  downloadVideoCodec: string;
  downloadAudioBitrate: string;
  filterMinDuration: number | null;
  filterMaxDuration: number | null;
  filterIncludeKeywords: string | null;
  filterExcludeKeywords: string | null;
  filterMaxVideos: number | null;
  downloadThreads: number;
}): Promise<void> {
  await invoke('update_channel_settings', input);
}

export async function saveChannelVideos(channelId: string, videos: ChannelVideo[]): Promise<void> {
  await invoke('save_channel_videos', { channelId, videos });
}

export async function updateChannelLastChecked(id: string, lastVideoId: string): Promise<void> {
  await invoke('update_channel_last_checked', { id, lastVideoId });
}

export async function getChannelVideos(input: {
  url: string;
  limit: number | null;
  start: number;
  requestId: number;
  cookieMode?: string;
  cookieBrowser?: string | null;
  cookieBrowserProfile?: string | null;
  cookieFilePath?: string | null;
  proxyUrl?: string | null;
}): Promise<PlaylistVideoEntry[]> {
  return invoke<PlaylistVideoEntry[]>('get_channel_videos', input);
}

export async function getChannelInfo(input: {
  url: string;
  cookieMode?: string;
  cookieBrowser?: string | null;
  cookieBrowserProfile?: string | null;
  cookieFilePath?: string | null;
  proxyUrl?: string | null;
}): Promise<ChannelInfo> {
  return invoke<ChannelInfo>('get_channel_info', input);
}

export async function getSavedChannelVideos(input: {
  channelId: string;
  status: ChannelVideo['status'] | null;
  limit: number;
}): Promise<ChannelVideo[]> {
  return invoke<ChannelVideo[]>('get_saved_channel_videos', input);
}

export async function downloadVideoCommand(input: Record<string, unknown>): Promise<void> {
  await invoke('download_video', input);
}

export async function stopDownloadCommand(): Promise<void> {
  await invoke('stop_download');
}

export async function updateChannelVideoStatusByVideoId(input: {
  channelUrl: string;
  videoId: string;
  status: string;
}): Promise<void> {
  await invoke('update_channel_video_status_by_video_id', input);
}

export async function updateChannelInfoCommand(input: {
  id: string;
  name: string;
  thumbnail: string | null;
}): Promise<void> {
  await invoke('update_channel_info', input);
}

export async function updateChannelVideoStatus(input: {
  id: string;
  status: string;
}): Promise<void> {
  await invoke('update_channel_video_status', input);
}

export function onDownloadProgress(
  handler: (event: { payload: DownloadProgress }) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>('download-progress', handler);
}

export function onChannelNewVideos(
  handler: (event: { payload: ChannelNewVideosEvent }) => void,
): Promise<UnlistenFn> {
  return listen<ChannelNewVideosEvent>('channel-new-videos', handler);
}

export function onChannelFetchProgress<T>(
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return listen<T>('channel-fetch-progress', handler);
}

export function onTrayOpenChannel(
  handler: (event: { payload: string }) => void,
): Promise<UnlistenFn> {
  return listen<string>('tray-open-channel', handler);
}

export function onChannelAutoDownload(
  handler: (event: { payload: ChannelAutoDownloadEvent }) => void,
): Promise<UnlistenFn> {
  return listen<ChannelAutoDownloadEvent>('channel-auto-download', handler);
}

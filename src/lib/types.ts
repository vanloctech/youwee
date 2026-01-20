export type Quality = 'best' | '8k' | '4k' | '2k' | '1080' | '720' | '480' | '360' | 'audio';
export type Format = 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' | 'opus';
export type VideoCodec = 'h264' | 'vp9' | 'av1' | 'auto';
export type AudioBitrate = 'auto' | '128' | '192' | '256' | '320';

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'fetching' | 'downloading' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  error?: string;
  isPlaylist?: boolean;
  playlistIndex?: number;
  playlistTotal?: number;
  thumbnail?: string;
  duration?: string;
  channel?: string;
  filesize?: number; // File size in bytes from video info
}

export interface DownloadSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  downloadPlaylist: boolean;
  videoCodec: VideoCodec;
  audioBitrate: AudioBitrate;
  concurrentDownloads: number; // 1-5
  playlistLimit: number; // 0 = unlimited, 1-100
  autoCheckUpdate: boolean; // Auto check for app updates on startup
}

export interface DownloadProgress {
  id: string;
  percent: number;
  speed: string;
  eta: string;
  status: string;
  title?: string;
  playlist_index?: number;
  playlist_count?: number;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  channel: string;
  upload_date: string;
  view_count: number;
  is_playlist: boolean;
  playlist_count?: number;
}

export interface FormatOption {
  format_id: string;
  ext: string;
  resolution: string;
  width?: number;
  height?: number;
  vcodec: string;
  acodec: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
  format_note?: string;
}

export interface VideoInfoResponse {
  info: VideoInfo;
  formats: FormatOption[];
}

export interface PlaylistInfo {
  id: string;
  title: string;
  entries: PlaylistEntry[];
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration?: number;
}

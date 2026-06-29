import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo } from 'react';
import { useDownload } from '@/contexts/download-context';
import { useGalleryDl } from '@/contexts/gallerydl-context';
import { useUniversal } from '@/contexts/universal-context';
import type { DownloadItem } from '@/lib/types';

interface TrayDownloadStatus {
  pending: number;
  downloading: number;
  completed: number;
  error: number;
  active: boolean;
}

function summarizeItems(items: DownloadItem[]) {
  return items.reduce(
    (summary, item) => {
      if (item.status === 'pending') summary.pending += 1;
      if (item.status === 'downloading') summary.downloading += 1;
      if (item.status === 'completed') summary.completed += 1;
      if (item.status === 'error') summary.error += 1;
      return summary;
    },
    { pending: 0, downloading: 0, completed: 0, error: 0 },
  );
}

export function useTrayDownloadStatus() {
  const download = useDownload();
  const universal = useUniversal();
  const gallery = useGalleryDl();

  const status = useMemo<TrayDownloadStatus>(() => {
    const youtube = summarizeItems(download.items);
    const universalDownloads = summarizeItems(universal.items);
    const galleryDownloads = summarizeItems(gallery.items);

    return {
      pending: youtube.pending + universalDownloads.pending + galleryDownloads.pending,
      downloading:
        youtube.downloading + universalDownloads.downloading + galleryDownloads.downloading,
      completed: youtube.completed + universalDownloads.completed + galleryDownloads.completed,
      error: youtube.error + universalDownloads.error + galleryDownloads.error,
      active: download.isDownloading || universal.isDownloading || gallery.isDownloading,
    };
  }, [
    download.items,
    download.isDownloading,
    universal.items,
    universal.isDownloading,
    gallery.items,
    gallery.isDownloading,
  ]);

  const { active, completed, downloading, error, pending } = status;

  useEffect(() => {
    invoke('update_tray_download_status', {
      status: { active, completed, downloading, error, pending },
    }).catch(() => {});
  }, [active, completed, downloading, error, pending]);
}

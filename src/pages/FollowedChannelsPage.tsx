import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  FolderOpen,
  History,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Trash2,
  Tv,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { sanitizeChannelFolderName } from '@/contexts/channels/useChannelsController';
import { useChannels } from '@/contexts/channels-context';
import { DEFAULT_CREATOR_PROCESSING_SETTINGS } from '@/lib/creator-processing';
import { openChannelFolderLocation } from '@/lib/open-file-location';
import type {
  CreatorProcessingSettings,
  PreferredFps,
  YoutubeChannelContentType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChannelDetailView } from '@/pages/channels/ChannelDetailView';
import { PlatformTag } from '@/pages/channels/PlatformTag';

function formatTimestamp(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

interface YouTubeRealtimeStatus {
  active: boolean;
  connected: boolean;
  subscribedChannels: number;
  lastError?: string | null;
}

export function FollowedChannelsPage() {
  const { t } = useTranslation('channels');
  const {
    followedChannels,
    loadingChannels,
    refreshChannels,
    activeChannel,
    setActiveChannel,
    channelNewCounts,
    outputPath,
    bulkUnfollowChannels,
    bulkUpdateChannelSettings,
    bulkSetChannelAutoDownload,
  } = useChannels();
  const [search, setSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<YouTubeRealtimeStatus | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkUnfollow, setConfirmBulkUnfollow] = useState(false);
  const [showBulkSettings, setShowBulkSettings] = useState(false);
  const [bulkCheckInterval, setBulkCheckInterval] = useState(15);
  const [bulkAutoDownload, setBulkAutoDownload] = useState(true);
  const [bulkThreads, setBulkThreads] = useState(3);
  const [bulkQuality, setBulkQuality] = useState('1080');
  const [bulkFormat, setBulkFormat] = useState('mp4');
  const [bulkCodec, setBulkCodec] = useState('auto');
  const [bulkFps, setBulkFps] = useState<PreferredFps>('original');
  const [bulkAudioBitrate, setBulkAudioBitrate] = useState('192');
  const [bulkContentType, setBulkContentType] = useState<YoutubeChannelContentType>('videos');
  const [bulkCreator, setBulkCreator] = useState<CreatorProcessingSettings>(
    DEFAULT_CREATOR_PROCESSING_SETTINGS,
  );
  const [bulkMinDuration, setBulkMinDuration] = useState('');
  const [bulkMaxDuration, setBulkMaxDuration] = useState('');
  const [bulkMaxVideos, setBulkMaxVideos] = useState('20');
  const [bulkIncludeKeywords, setBulkIncludeKeywords] = useState('');
  const [bulkExcludeKeywords, setBulkExcludeKeywords] = useState('');

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      invoke<YouTubeRealtimeStatus>('get_youtube_realtime_status')
        .then((status) => {
          if (mounted) setRealtimeStatus(status);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const visibleChannels = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return followedChannels;
    return followedChannels.filter(
      (channel) =>
        channel.name.toLocaleLowerCase().includes(query) ||
        channel.url.toLocaleLowerCase().includes(query),
    );
  }, [followedChannels, search]);

  useEffect(() => {
    const existingIds = new Set(followedChannels.map((channel) => channel.id));
    setSelectedIds((current) => new Set([...current].filter((id) => existingIds.has(id))));
  }, [followedChannels]);

  if (activeChannel) {
    return <ChannelDetailView channel={activeChannel} onBack={() => setActiveChannel(null)} />;
  }

  const checkNow = async () => {
    setChecking(true);
    try {
      await invoke('check_followed_channels_now');
      window.setTimeout(() => void refreshChannels(), 1200);
    } finally {
      setChecking(false);
    }
  };

  const allVisibleSelected =
    visibleChannels.length > 0 && visibleChannels.every((channel) => selectedIds.has(channel.id));

  const runBulkAction = async (action: () => Promise<void>) => {
    setBulkBusy(true);
    try {
      await action();
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const channel of visibleChannels) next.delete(channel.id);
      } else {
        for (const channel of visibleChannels) next.add(channel.id);
      }
      return next;
    });
  };

  const openBulkSettings = () => {
    const sample = followedChannels.find((channel) => selectedIds.has(channel.id));
    if (sample) {
      setBulkCheckInterval(sample.check_interval);
      setBulkAutoDownload(sample.auto_download);
      setBulkThreads(sample.download_threads);
      setBulkQuality(sample.download_quality);
      setBulkFormat(sample.download_format);
      setBulkCodec(sample.download_video_codec);
      setBulkFps(sample.download_preferred_fps);
      setBulkAudioBitrate(sample.download_audio_bitrate);
      setBulkContentType(sample.youtube_content_type);
      setBulkCreator(sample.creator_processing);
      setBulkMinDuration(sample.filter_min_duration?.toString() ?? '');
      setBulkMaxDuration(sample.filter_max_duration?.toString() ?? '');
      setBulkMaxVideos(sample.filter_max_videos?.toString() ?? '20');
      setBulkIncludeKeywords(sample.filter_include_keywords ?? '');
      setBulkExcludeKeywords(sample.filter_exclude_keywords ?? '');
    }
    setShowBulkSettings(true);
  };

  const saveBulkSettings = () =>
    runBulkAction(async () => {
      await bulkUpdateChannelSettings({
        ids: [...selectedIds],
        checkInterval: Math.max(1, bulkCheckInterval),
        autoDownload: bulkAutoDownload,
        downloadQuality: bulkQuality,
        downloadFormat: bulkFormat,
        downloadVideoCodec: bulkCodec,
        downloadPreferredFps: bulkFps,
        downloadAudioBitrate: bulkAudioBitrate,
        downloadThreads: Math.max(1, Math.min(5, bulkThreads)),
        youtubeContentType: bulkContentType,
        creatorProcessing: { ...bulkCreator, outputFolder: '' },
        filterMinDuration: bulkMinDuration ? Number(bulkMinDuration) : null,
        filterMaxDuration: bulkMaxDuration ? Number(bulkMaxDuration) : null,
        filterIncludeKeywords: bulkIncludeKeywords || null,
        filterExcludeKeywords: bulkExcludeKeywords || null,
        filterMaxVideos: bulkMaxVideos ? Number(bulkMaxVideos) : null,
      });
      setShowBulkSettings(false);
    });

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-7">
        <div>
          <h1 className="text-xl font-semibold">{t('manager.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('manager.subtitle', { count: followedChannels.length })}
          </p>
          <div
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs',
              realtimeStatus?.connected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            )}
            title={realtimeStatus?.lastError ?? undefined}
          >
            <Radio className={cn('h-3.5 w-3.5', realtimeStatus?.connected && 'animate-pulse')} />
            {realtimeStatus?.connected
              ? t('manager.realtimeConnected', {
                  count: realtimeStatus.subscribedChannels,
                })
              : realtimeStatus?.active
                ? t('manager.realtimeConnecting')
                : t('manager.realtimeFallback')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshChannels()}>
            <RefreshCw className={cn('h-4 w-4', loadingChannels && 'animate-spin')} />
            {t('manager.refresh')}
          </Button>
          <Button size="sm" onClick={() => void checkNow()} disabled={checking}>
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {t('checkNow')}
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-5 pb-3 sm:px-7">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('manager.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/60 p-2">
          <Button variant="ghost" size="sm" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {allVisibleSelected ? t('deselectAll') : t('selectAll')}
          </Button>
          <span className="mr-auto text-xs text-muted-foreground">
            {t('selected', { count: selectedIds.size })}
          </span>
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={() =>
              void runBulkAction(() => bulkSetChannelAutoDownload([...selectedIds], true))
            }
          >
            <Download className="h-4 w-4" />
            {t('manager.enableAuto')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={() =>
              void runBulkAction(() => bulkSetChannelAutoDownload([...selectedIds], false))
            }
          >
            {t('manager.disableAuto')}
          </Button>
          <Button
            variant={showBulkSettings ? 'secondary' : 'outline'}
            size="sm"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={openBulkSettings}
          >
            <Settings2 className="h-4 w-4" />
            {t('manager.bulkSettings')}
          </Button>
          {confirmBulkUnfollow ? (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkBusy}
                onClick={() =>
                  void runBulkAction(async () => {
                    await bulkUnfollowChannels([...selectedIds]);
                    setSelectedIds(new Set());
                    setConfirmBulkUnfollow(false);
                  })
                }
              >
                {t('manager.confirmRemove')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmBulkUnfollow(false)}>
                {t('cancel')}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={() => setConfirmBulkUnfollow(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t('manager.removeSelected')}
            </Button>
          )}
        </div>
        {showBulkSettings && (
          <div className="space-y-4 rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {t('manager.bulkSettingsTitle', { count: selectedIds.size })}
                </h2>
                <p className="text-xs text-muted-foreground">{t('manager.bulkSettingsHint')}</p>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs">{t('autoDownload')}</Label>
                <Switch checked={bulkAutoDownload} onCheckedChange={setBulkAutoDownload} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <label
                htmlFor="bulk-check-interval"
                className="space-y-1 text-xs text-muted-foreground"
              >
                {t('checkInterval')}
                <Input
                  id="bulk-check-interval"
                  type="number"
                  min={1}
                  value={bulkCheckInterval}
                  onChange={(event) => setBulkCheckInterval(Number(event.target.value))}
                />
              </label>
              <label
                htmlFor="bulk-download-threads"
                className="space-y-1 text-xs text-muted-foreground"
              >
                {t('downloadThreads')}
                <Input
                  id="bulk-download-threads"
                  type="number"
                  min={1}
                  max={5}
                  value={bulkThreads}
                  onChange={(event) => setBulkThreads(Number(event.target.value))}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('quality')}
                <select
                  value={bulkQuality}
                  onChange={(event) => setBulkQuality(event.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="best">Best</option>
                  <option value="4k">4K</option>
                  <option value="2k">2K</option>
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('format')}
                <select
                  value={bulkFormat}
                  onChange={(event) => setBulkFormat(event.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="mp4">MP4</option>
                  <option value="mkv">MKV</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('codec')}
                <select
                  value={bulkCodec}
                  onChange={(event) => setBulkCodec(event.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="auto">Auto</option>
                  <option value="h264">H.264</option>
                  <option value="vp9">VP9</option>
                  <option value="av1">AV1</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('frameRate')}
                <select
                  value={bulkFps}
                  onChange={(event) => setBulkFps(event.target.value as PreferredFps)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="original">{t('frameRateOriginal')}</option>
                  <option value="30">30 FPS</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('audioBitrate')}
                <select
                  value={bulkAudioBitrate}
                  onChange={(event) => setBulkAudioBitrate(event.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="128">128 kbps</option>
                  <option value="192">192 kbps</option>
                  <option value="256">256 kbps</option>
                  <option value="320">320 kbps</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('downloadSettings')}
                <select
                  value={bulkContentType}
                  onChange={(event) =>
                    setBulkContentType(event.target.value as typeof bulkContentType)
                  }
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="videos">{t('youtubeContentTypes.videos')}</option>
                  <option value="shorts">{t('youtubeContentTypes.shorts')}</option>
                  <option value="streams">{t('youtubeContentTypes.streams')}</option>
                  <option value="videos_shorts">{t('youtubeContentTypes.videos_shorts')}</option>
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                {t('creator.title')}
                <select
                  value={bulkCreator.mode}
                  onChange={(event) =>
                    setBulkCreator((current) => ({
                      ...current,
                      mode: event.target.value as CreatorProcessingSettings['mode'],
                    }))
                  }
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="none">{t('creator.none')}</option>
                  <option value="duet">{t('creator.duet')}</option>
                  <option value="portrait">{t('creator.portrait')}</option>
                  <option value="parts">{t('creator.parts')}</option>
                </select>
              </label>
              {bulkCreator.mode === 'parts' && (
                <>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    {t('creator.parts')}
                    <select
                      value={bulkCreator.splitBy}
                      onChange={(event) =>
                        setBulkCreator((current) => ({
                          ...current,
                          splitBy: event.target.value === 'count' ? 'count' : 'duration',
                        }))
                      }
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="duration">{t('creator.splitByDuration')}</option>
                      <option value="count">{t('creator.splitByCount')}</option>
                    </select>
                  </label>
                  <label
                    htmlFor="bulk-part-size"
                    className="space-y-1 text-xs text-muted-foreground"
                  >
                    {bulkCreator.splitBy === 'count'
                      ? t('creator.partCount')
                      : t('creator.partSeconds')}
                    <Input
                      id="bulk-part-size"
                      type="number"
                      min={1}
                      value={
                        bulkCreator.splitBy === 'count'
                          ? bulkCreator.partCount
                          : bulkCreator.partSeconds
                      }
                      onChange={(event) => {
                        const value = Math.max(1, Number(event.target.value));
                        setBulkCreator((current) =>
                          current.splitBy === 'count'
                            ? { ...current, partCount: value }
                            : { ...current, partSeconds: value },
                        );
                      }}
                    />
                  </label>
                </>
              )}
              {bulkCreator.mode !== 'none' && (
                <label className="space-y-1 text-xs text-muted-foreground">
                  {t('codec')}
                  <select
                    value={bulkCreator.encoder}
                    onChange={(event) =>
                      setBulkCreator((current) => ({
                        ...current,
                        encoder: event.target.value as CreatorProcessingSettings['encoder'],
                      }))
                    }
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="libx264">CPU x264</option>
                    <option value="h264_nvenc">NVIDIA NVENC</option>
                    <option value="h264_qsv">Intel Quick Sync</option>
                    <option value="h264_amf">AMD AMF</option>
                  </select>
                </label>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label
                htmlFor="bulk-min-duration"
                className="space-y-1 text-xs text-muted-foreground"
              >
                {t('minDuration')}
                <Input
                  id="bulk-min-duration"
                  type="number"
                  min={0}
                  value={bulkMinDuration}
                  onChange={(event) => setBulkMinDuration(event.target.value)}
                />
              </label>
              <label
                htmlFor="bulk-max-duration"
                className="space-y-1 text-xs text-muted-foreground"
              >
                {t('maxDuration')}
                <Input
                  id="bulk-max-duration"
                  type="number"
                  min={0}
                  value={bulkMaxDuration}
                  onChange={(event) => setBulkMaxDuration(event.target.value)}
                />
              </label>
              <label htmlFor="bulk-max-videos" className="space-y-1 text-xs text-muted-foreground">
                {t('maxVideosPerCheck')}
                <Input
                  id="bulk-max-videos"
                  type="number"
                  min={1}
                  value={bulkMaxVideos}
                  onChange={(event) => setBulkMaxVideos(event.target.value)}
                />
              </label>
              <label
                htmlFor="bulk-include-keywords"
                className="space-y-1 text-xs text-muted-foreground sm:col-span-1 lg:col-span-2"
              >
                {t('includeKeywords')}
                <Input
                  id="bulk-include-keywords"
                  value={bulkIncludeKeywords}
                  onChange={(event) => setBulkIncludeKeywords(event.target.value)}
                />
              </label>
              <label
                htmlFor="bulk-exclude-keywords"
                className="space-y-1 text-xs text-muted-foreground"
              >
                {t('excludeKeywords')}
                <Input
                  id="bulk-exclude-keywords"
                  value={bulkExcludeKeywords}
                  onChange={(event) => setBulkExcludeKeywords(event.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowBulkSettings(false)}>
                {t('cancel')}
              </Button>
              <Button size="sm" disabled={bulkBusy} onClick={() => void saveBulkSettings()}>
                {bulkBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('manager.saveSelected', { count: selectedIds.size })}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
        {visibleChannels.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
            <Tv className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">{t('manager.empty')}</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visibleChannels.map((channel) => {
              const newCount = channelNewCounts[channel.id] ?? 0;
              return (
                <div
                  key={channel.id}
                  className={cn(
                    'group relative rounded-xl border bg-card/60 p-4 text-left transition-colors hover:bg-card',
                    selectedIds.has(channel.id)
                      ? 'border-primary/60 ring-1 ring-primary/20'
                      : 'border-border/60 hover:border-primary/40',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(channel.id)}
                      onChange={() =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (next.has(channel.id)) next.delete(channel.id);
                          else next.add(channel.id);
                          return next;
                        })
                      }
                      className="mt-4 h-4 w-4 accent-primary"
                      aria-label={t('manager.selectChannel', { name: channel.name })}
                    />
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                      {channel.thumbnail ? (
                        <img
                          src={channel.thumbnail}
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Tv className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveChannel(channel)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-semibold">{channel.name}</h2>
                        <PlatformTag platform={channel.platform} size="xs" />
                        {newCount > 0 && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                            {t('manager.newVideos', { count: newCount })}
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-0.5 truncate text-xs text-muted-foreground"
                        title={channel.url}
                      >
                        {channel.url}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('openChannelFolder')}
                        onClick={() =>
                          void openChannelFolderLocation(
                            channel.id,
                            [],
                            outputPath
                              ? `${outputPath}/${sanitizeChannelFolderName(channel.name)}`
                              : '',
                          )
                        }
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('manager.openChannelWeb')}
                        onClick={() => void openUrl(channel.url)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t('settings')}
                        onClick={() => setActiveChannel(channel)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {t('manager.lastChecked')}
                      </div>
                      <p
                        className="mt-1 truncate font-medium"
                        title={formatTimestamp(channel.last_checked_at)}
                      >
                        {formatTimestamp(channel.last_checked_at)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Download className="h-3.5 w-3.5" /> {t('manager.lastDownloaded')}
                      </div>
                      <p
                        className="mt-1 truncate font-medium"
                        title={formatTimestamp(channel.last_downloaded_at)}
                      >
                        {formatTimestamp(channel.last_downloaded_at)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <History className="h-3.5 w-3.5" /> {t('manager.downloadedCount')}
                      </div>
                      <p className="mt-1 font-medium">{channel.downloaded_video_count}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Settings2 className="h-3.5 w-3.5" /> {t('manager.mode')}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            channel.auto_download
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {channel.auto_download ? t('autoDownload') : t('manager.manual')}
                        </span>
                        <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-500">
                          {t(`creator.${channel.creator_processing.mode}`)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

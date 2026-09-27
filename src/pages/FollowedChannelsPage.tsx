import { invoke } from '@tauri-apps/api/core';
import {
  Clock,
  Download,
  History,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Tv,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChannels } from '@/contexts/channels-context';
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
  } = useChannels();
  const [search, setSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<YouTubeRealtimeStatus | null>(null);

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

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center justify-between gap-4 px-5 py-4 sm:px-7">
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

      <div className="px-5 pb-3 sm:px-7">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('manager.searchPlaceholder')}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
        {visibleChannels.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
            <Tv className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">{t('manager.empty')}</p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleChannels.map((channel) => {
              const newCount = channelNewCounts[channel.id] ?? 0;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setActiveChannel(channel)}
                  className="group rounded-xl border border-border/60 bg-card/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card"
                >
                  <div className="flex items-start gap-3">
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
                    <div className="min-w-0 flex-1">
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
                    </div>
                    <Settings2 className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
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
                      <p className="mt-1 truncate font-medium">
                        {channel.auto_download ? t('autoDownload') : t('manager.manual')}
                        {' · '}
                        {t(`creator.${channel.creator_processing.mode}`)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faGlobe as faGlobeIcon } from '@fortawesome/free-solid-svg-icons';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  Film,
  History,
  Images,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '@/components/shared/FaIcon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type DownloadProgress, useDependencies } from '@/contexts/DependenciesContext';
import { useDownload } from '@/contexts/download-context';
import { extractBackendError } from '@/lib/backend-error';
import type { DependencySource, YtdlpChannel } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsSection } from '../SettingsSection';

interface DependenciesSectionProps {
  highlightId?: string | null;
}

const ENGINE_LABELS: Record<string, string> = {
  ytdlp: 'yt-dlp',
  ytdlp_stable: 'yt-dlp (stable)',
  ytdlp_nightly: 'yt-dlp (nightly)',
  ffmpeg: 'FFmpeg',
  deno: 'Deno',
  gallerydl: 'gallery-dl',
};

type EngineBackupKey = 'ytdlp' | 'ytdlp_stable' | 'ytdlp_nightly' | 'ffmpeg' | 'deno' | 'gallerydl';

const ROLLBACK_ENGINES: { key: EngineBackupKey; label: string }[] = [
  { key: 'ytdlp', label: 'yt-dlp' },
  { key: 'ffmpeg', label: 'FFmpeg' },
  { key: 'deno', label: 'Deno' },
  { key: 'gallerydl', label: 'gallery-dl' },
];

type EngineErrorKind = 'checksum' | 'version' | 'rollback' | 'other';

/** Classify engine failures so the UI can report checksum/version/compat problems clearly. */
function classifyEngineError(message: string): EngineErrorKind {
  const payload = extractBackendError(message);
  if (payload.code === 'CHECKSUM_VERIFICATION_FAILED') return 'checksum';
  if (payload.code === 'ENGINE_VERSION_CHECK_FAILED') return 'version';
  if (
    payload.code === 'ENGINE_ROLLBACK_NOT_AVAILABLE' ||
    payload.code === 'ENGINE_ROLLBACK_VERIFY_FAILED'
  ) {
    return 'rollback';
  }
  const lower = message.toLowerCase();
  if (lower.includes('checksum') || lower.includes('sha256') || lower.includes('sha-256')) {
    return 'checksum';
  }
  if (
    lower.includes('did not run') ||
    lower.includes('restored') ||
    lower.includes('failed to verify')
  ) {
    return 'version';
  }
  if (lower.includes('rollback') || lower.includes('previous version')) {
    return 'rollback';
  }
  return 'other';
}

/** Inline classified error banner (checksum / version / rollback / generic). */
function EngineErrorNotice({ message }: { message: string }) {
  const { t } = useTranslation('settings');
  const kind = classifyEngineError(message);
  const title =
    kind === 'checksum'
      ? t('dependencies.checksumFailedTitle')
      : kind === 'version'
        ? t('dependencies.versionCheckFailedTitle')
        : kind === 'rollback'
          ? t('dependencies.rollbackFailedTitle')
          : t('dependencies.engineUpdateFailedTitle');
  return (
    <div
      role="alert"
      className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium text-destructive">{title}</p>
          <p className="text-muted-foreground mt-0.5 break-words">{message}</p>
          {kind === 'checksum' && (
            <p className="text-muted-foreground/80 mt-1">
              {t('dependencies.checksumKeptPrevious')}
            </p>
          )}
          {kind === 'version' && (
            <p className="text-muted-foreground/80 mt-1">{t('dependencies.versionRestoredHint')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DependenciesSection({ highlightId }: DependenciesSectionProps) {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [pendingSourceChange, setPendingSourceChange] = useState<{
    tool: 'ytdlp' | 'ffmpeg';
    source: Exclude<DependencySource, 'auto'>;
  } | null>(null);
  const { settings, updateUseActualPlayerJs } = useDownload();
  const {
    // yt-dlp
    ytdlpSource,
    ytdlpInfo,
    isLoading,
    isChecking,
    isUpdating,
    latestVersion,
    updateSuccess,
    error,
    refreshYtdlpVersion,
    checkForUpdate,
    updateYtdlp,
    // yt-dlp channel
    ytdlpChannel,
    ytdlpAllVersions,
    ytdlpChannelUpdateInfo,
    isChannelLoading,
    isChannelDownloading,
    isChannelCheckingUpdate,
    channelError,
    channelDownloadSuccess,
    isAutoDownloadingYtdlp,
    setYtdlpSource,
    setYtdlpChannel,
    checkChannelUpdate,
    downloadChannelBinary,
    // FFmpeg
    ffmpegSource,
    ffmpegStatus,
    ffmpegLoading,
    ffmpegDownloading,
    ffmpegCheckingUpdate,
    ffmpegUpdateInfo,
    ffmpegError,
    ffmpegSuccess,
    checkFfmpegUpdate,
    downloadFfmpeg,
    ffmpegDownloadProgress,
    setFfmpegSource,
    checkFfmpeg,
    // Deno
    denoStatus,
    denoLoading,
    denoDownloading,
    denoCheckingUpdate,
    denoUpdateInfo,
    denoError,
    denoSuccess,
    denoDownloadProgress,
    checkDenoUpdate,
    downloadDeno,
    galleryDlStatus,
    galleryDlLoading,
    galleryDlError,
    checkGalleryDl,
    runCompatTest,
    compatResults,
    compatLoading,
    backupsStatus,
    backupsLoading,
    rollbackEngine,
    rollbackLoading,
    rollbackSuccess,
    checkGalleryDlUpdate,
    galleryDlUpdateInfo,
    downloadGalleryDl,
    galleryDlUpdating,
    galleryDlUpdated,
  } = useDependencies();

  // ---- P0-1: gallery-dl download progress + failure reporting ----
  const [galleryDlDownloadProgress, setGalleryDlDownloadProgress] =
    useState<DownloadProgress | null>(null);

  // Compare versions with normalization to avoid false positives (e.g. "v2026.02.04")
  const normalizeVersion = (v: string) => v.trim().replace(/^v/i, '');
  const isUpdateAvailable =
    latestVersion && ytdlpInfo?.version
      ? normalizeVersion(latestVersion) !== normalizeVersion(ytdlpInfo.version)
      : false;

  // Check if current channel needs download (not installed)
  const needsDownload = () => {
    if (ytdlpChannel === 'bundled') return false;
    if (!ytdlpAllVersions) return false;
    const info = ytdlpChannel === 'stable' ? ytdlpAllVersions.stable : ytdlpAllVersions.nightly;
    return !info.installed;
  };

  // Handle channel change
  const handleChannelChange = async (channel: YtdlpChannel) => {
    if (channel === ytdlpChannel) return;
    await setYtdlpChannel(channel);
    // If the channel binary is not installed, download it
    if (channel !== 'bundled') {
      const versions = ytdlpAllVersions;
      const info = channel === 'stable' ? versions?.stable : versions?.nightly;
      if (!info?.installed) {
        await downloadChannelBinary(channel);
      }
    }
  };

  const handleYtdlpSourceChange = async (nextSource: Exclude<DependencySource, 'auto'>) => {
    if (
      (nextSource === 'system' && ytdlpSource === 'system') ||
      (nextSource === 'app' && ytdlpSource === 'app')
    ) {
      return;
    }
    if (nextSource === 'system') {
      setPendingSourceChange({ tool: 'ytdlp', source: nextSource });
      return;
    }
    await setYtdlpSource(nextSource);
  };

  const handleFfmpegSourceChange = async (nextSource: Exclude<DependencySource, 'auto'>) => {
    if (
      (nextSource === 'system' && ffmpegSource === 'system') ||
      (nextSource === 'app' && ffmpegSource === 'app')
    ) {
      return;
    }
    if (nextSource === 'system') {
      setPendingSourceChange({ tool: 'ffmpeg', source: nextSource });
      return;
    }
    await setFfmpegSource(nextSource);
  };

  const handleConfirmSourceChange = async () => {
    if (!pendingSourceChange) return;
    const { tool, source } = pendingSourceChange;
    setPendingSourceChange(null);

    if (tool === 'ytdlp') {
      await setYtdlpSource(source);
    } else {
      await setFfmpegSource(source);
    }
  };

  const sourceOptions: Array<{ value: Exclude<DependencySource, 'auto'>; label: string }> = [
    { value: 'app', label: t('dependencies.sourceAppManaged') },
    {
      value: 'system',
      label: (() => {
        const platform = typeof navigator !== 'undefined' ? navigator.platform.toLowerCase() : '';
        if (platform.includes('mac')) return t('dependencies.sourceSystemMac');
        if (platform.includes('win')) return t('dependencies.sourceSystemWindows');
        if (platform.includes('linux')) return t('dependencies.sourceSystemLinux');
        return t('dependencies.sourceSystem');
      })(),
    },
  ];

  // yt-dlp keeps `auto` for backward compatibility. In UI, display it as App managed.
  const ytdlpSourceUi: Exclude<DependencySource, 'auto'> =
    ytdlpSource === 'system' ? 'system' : 'app';
  // Legacy FFmpeg `auto` can resolve to system FFmpeg, so display the resolved source.
  const ffmpegSourceUi: Exclude<DependencySource, 'auto'> =
    ffmpegSource === 'system' || (ffmpegSource === 'auto' && ffmpegStatus?.is_system)
      ? 'system'
      : 'app';
  const isFfmpegSystemSource = ffmpegSourceUi === 'system';

  // Re-run the compatibility test after an engine upgrade so the UI reflects the result
  const handleYtdlpUpdated = async () => {
    await updateYtdlp();
    void runCompatTest();
  };
  const handleChannelUpdated = async (channel: YtdlpChannel) => {
    await downloadChannelBinary(channel);
    void runCompatTest();
  };
  const handleFfmpegUpdated = async () => {
    await downloadFfmpeg();
    void runCompatTest();
  };
  const handleDenoUpdated = async () => {
    await downloadDeno();
    void runCompatTest();
  };
  const handleGalleryDlUpdated = async () => {
    await downloadGalleryDl();
    void runCompatTest();
  };

  // Toast new engine failures so checksum/version/compat problems are impossible to miss
  const skipInitialErrorToastRef = useRef(true);
  const lastToastedErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (skipInitialErrorToastRef.current) {
      skipInitialErrorToastRef.current = false;
      return;
    }
    const engineError = error || channelError || ffmpegError || denoError || galleryDlError;
    if (!engineError) return;
    if (lastToastedErrorRef.current === engineError) return;
    lastToastedErrorRef.current = engineError;
    const kind = classifyEngineError(engineError);
    const title =
      kind === 'checksum'
        ? t('dependencies.checksumFailedTitle')
        : kind === 'version'
          ? t('dependencies.versionCheckFailedTitle')
          : kind === 'rollback'
            ? t('dependencies.rollbackFailedTitle')
            : t('dependencies.engineUpdateFailedTitle');
    toast.error({ title, message: engineError });
  }, [error, channelError, ffmpegError, denoError, galleryDlError, t, toast]);

  // Startup compatibility test when the Engines screen opens
  useEffect(() => {
    void runCompatTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for gallery-dl download progress events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    listen<DownloadProgress>('gallerydl-download-progress', (event) => {
      setGalleryDlDownloadProgress(event.payload);
      if (event.payload.stage === 'complete') {
        setTimeout(() => setGalleryDlDownloadProgress(null), 1000);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <>
      <AlertDialog
        open={Boolean(pendingSourceChange)}
        onOpenChange={(open) => {
          if (!open) setPendingSourceChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dependencies.confirmSwitchSystemTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSourceChange?.tool === 'ffmpeg'
                ? t('dependencies.confirmSwitchSystemFfmpeg')
                : t('dependencies.confirmSwitchSystemYtdlp')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dependencies.confirmCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSourceChange}>
              {t('dependencies.confirmProceed')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-8">
        <SettingsSection
          title={t('dependencies.title')}
          description={t('dependencies.description')}
          icon={<Package className="w-5 h-5 text-white" />}
          iconClassName="bg-gradient-to-br from-orange-500 to-red-600 shadow-orange-500/20"
        >
          {/* yt-dlp */}
          <SettingsCard id="ytdlp" highlight={highlightId === 'ytdlp'}>
            {/* Header: icon + name + version + refresh */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                  <Terminal className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t('dependencies.ytdlp')}</span>
                    {isLoading ? (
                      <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                    ) : ytdlpInfo ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="secondary"
                              className="cursor-help font-mono text-xs"
                              title={ytdlpInfo.binary_path}
                            >
                              {ytdlpInfo.version}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[min(520px,calc(100vw-2rem))] break-all font-mono">
                            {ytdlpInfo.binary_path}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        {t('dependencies.notFound')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isUpdating || isChannelDownloading ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {isAutoDownloadingYtdlp
                          ? t('dependencies.downloadingYtdlp')
                          : needsDownload()
                            ? t('dependencies.installing')
                            : t('dependencies.updating')}
                      </span>
                    ) : updateSuccess || channelDownloadSuccess ? (
                      <span className="text-emerald-500">{t('dependencies.updated')}</span>
                    ) : error || channelError ? (
                      <span className="text-destructive">{error || channelError}</span>
                    ) : ytdlpAllVersions?.using_fallback ? (
                      <span className="text-amber-500">
                        {t('dependencies.usingBundledTemporarily')}
                      </span>
                    ) : ytdlpSource === 'system' ? (
                      ytdlpInfo ? (
                        t('dependencies.systemYtdlp')
                      ) : (
                        <span className="text-amber-500">
                          {t('dependencies.systemYtdlpNotFound')}
                        </span>
                      )
                    ) : ytdlpChannel === 'bundled' && isUpdateAvailable && latestVersion ? (
                      <span className="text-primary">
                        {t('dependencies.available', {
                          version: latestVersion,
                        })}
                      </span>
                    ) : ytdlpChannelUpdateInfo?.update_available ? (
                      <span className="text-primary">
                        {t('dependencies.available', {
                          version: ytdlpChannelUpdateInfo.latest_version,
                        })}
                      </span>
                    ) : ytdlpChannelUpdateInfo && !ytdlpChannelUpdateInfo.update_available ? (
                      <span className="text-emerald-500">{t('dependencies.upToDate')}</span>
                    ) : (
                      t('dependencies.videoDownloadEngine')
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (ytdlpSource === 'system') {
                    refreshYtdlpVersion();
                  } else if (ytdlpChannel === 'bundled') {
                    checkForUpdate();
                  } else {
                    checkChannelUpdate(ytdlpChannel);
                  }
                }}
                disabled={
                  isChecking || isUpdating || isChannelCheckingUpdate || isChannelDownloading
                }
              >
                {isChecking || isChannelCheckingUpdate ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>

            {(error || channelError) && <EngineErrorNotice message={error || channelError || ''} />}

            {/* Source selector */}
            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('dependencies.source')}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {sourceOptions.map((option) => {
                  const isActive = ytdlpSourceUi === option.value;
                  return (
                    <button
                      key={`ytdlp-source-${option.value}`}
                      type="button"
                      onClick={() => handleYtdlpSourceChange(option.value)}
                      disabled={isChannelLoading || isChannelDownloading || isUpdating}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-xs transition-all border border-dashed',
                        isActive
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Channel selector + action */}
            {ytdlpSource !== 'system' && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                {/* Channel list */}
                <div className="space-y-1">
                  {(['bundled', 'stable', 'nightly'] as YtdlpChannel[]).map((ch) => {
                    const isActive = ytdlpChannel === ch;
                    const chInstalled =
                      ch === 'bundled' || (ytdlpAllVersions?.[ch]?.installed ?? false);

                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => handleChannelChange(ch)}
                        disabled={isChannelLoading || isChannelDownloading}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-start transition-all',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                          isActive
                            ? 'bg-primary/[0.06] ring-1 ring-primary/30'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        {/* Radio indicator */}
                        <div
                          className={cn(
                            'w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors',
                            isActive ? 'border-primary bg-primary' : 'border-muted-foreground/30',
                          )}
                        >
                          {isActive && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>

                        {/* Channel info */}
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              'text-xs font-medium leading-none',
                              isActive ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {t(`dependencies.channel${ch.charAt(0).toUpperCase()}${ch.slice(1)}`)}
                          </span>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
                            {t(
                              `dependencies.channel${ch.charAt(0).toUpperCase()}${ch.slice(1)}Desc`,
                            )}
                          </p>
                        </div>

                        {/* Status */}
                        {isActive ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] shrink-0 bg-primary/10 text-primary border-0 px-1.5 py-0"
                          >
                            {t('dependencies.channelActive')}
                          </Badge>
                        ) : (
                          !chInstalled && (
                            <span className="text-[10px] text-muted-foreground/50 shrink-0">
                              {t('dependencies.notInstalled')}
                            </span>
                          )
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Update / Install button */}
                {ytdlpChannel !== 'bundled' && needsDownload() && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handleChannelUpdated(ytdlpChannel)}
                    disabled={isChannelDownloading}
                  >
                    {isChannelDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="w-4 h-4 me-1.5" />
                        {t('dependencies.install')}
                      </>
                    )}
                  </Button>
                )}
                {ytdlpChannel !== 'bundled' &&
                  !needsDownload() &&
                  ytdlpChannelUpdateInfo?.update_available && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => void handleChannelUpdated(ytdlpChannel)}
                      disabled={isChannelDownloading}
                    >
                      {isChannelDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="w-4 h-4 me-1.5" />
                          {t('dependencies.update')}
                        </>
                      )}
                    </Button>
                  )}
                {ytdlpChannel === 'bundled' && isUpdateAvailable && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handleYtdlpUpdated()}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="w-4 h-4 me-1.5" />
                        {t('dependencies.update')}
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Footer: GitHub link */}
            <a
              href="https://github.com/yt-dlp/yt-dlp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
            >
              <FaIcon icon={faGithub} className="text-[12px]" />
              yt-dlp/yt-dlp
              <ExternalLink className="w-3 h-3" />
            </a>
          </SettingsCard>

          {/* FFmpeg */}
          <SettingsCard id="ffmpeg" highlight={highlightId === 'ffmpeg'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                  <Film className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t('dependencies.ffmpeg')}</span>
                    {!ffmpegLoading &&
                      ffmpegStatus &&
                      (ffmpegStatus?.installed ? (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {ffmpegStatus.version || t('dependencies.installed')}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          {t('dependencies.notFound')}
                        </Badge>
                      ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ffmpegDownloading ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {ffmpegDownloadProgress
                          ? ffmpegDownloadProgress.stage === 'downloading'
                            ? `${t('dependencies.downloading')} ${ffmpegDownloadProgress.percent}%`
                            : ffmpegDownloadProgress.stage === 'extracting'
                              ? t('dependencies.extracting')
                              : ffmpegDownloadProgress.stage === 'verifying'
                                ? t('dependencies.verifying')
                                : t('dependencies.installing')
                          : ffmpegUpdateInfo?.has_update
                            ? t('dependencies.updating')
                            : t('dependencies.installing')}
                      </span>
                    ) : ffmpegCheckingUpdate ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('dependencies.checkingUpdates')}
                      </span>
                    ) : ffmpegSuccess ? (
                      <span className="text-emerald-500">
                        {ffmpegUpdateInfo?.has_update
                          ? t('dependencies.updated')
                          : t('dependencies.installed')}
                      </span>
                    ) : ffmpegError ? (
                      <span className="text-destructive">{ffmpegError}</span>
                    ) : ffmpegStatus?.installed === false ? (
                      <span className="text-amber-500">
                        {isFfmpegSystemSource
                          ? t('dependencies.systemFfmpegNotFound')
                          : t('dependencies.requiredFor2K4K8K')}
                      </span>
                    ) : ffmpegUpdateInfo?.has_update ? (
                      <span className="text-primary">
                        {t('dependencies.available', { version: ffmpegUpdateInfo.latest_version })}
                      </span>
                    ) : isFfmpegSystemSource ? (
                      t('dependencies.systemFfmpeg')
                    ) : ffmpegUpdateInfo && !ffmpegUpdateInfo.has_update ? (
                      <span className="text-emerald-500">{t('dependencies.upToDate')}</span>
                    ) : (
                      t('dependencies.audioVideoProcessing')
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ffmpegUpdateInfo?.has_update &&
                  !ffmpegStatus?.is_system &&
                  !isFfmpegSystemSource && (
                    <Button
                      size="sm"
                      onClick={() => void handleFfmpegUpdated()}
                      disabled={ffmpegDownloading}
                    >
                      {ffmpegDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        t('dependencies.update')
                      )}
                    </Button>
                  )}
                {ffmpegStatus?.installed === false && !ffmpegLoading && !isFfmpegSystemSource && (
                  <Button
                    size="sm"
                    onClick={() => void handleFfmpegUpdated()}
                    disabled={ffmpegDownloading}
                  >
                    {ffmpegDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      t('dependencies.install')
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={isFfmpegSystemSource ? checkFfmpeg : checkFfmpegUpdate}
                  disabled={
                    ffmpegLoading ||
                    ffmpegDownloading ||
                    ffmpegCheckingUpdate ||
                    ffmpegStatus?.installed !== true
                  }
                  title={t('dependencies.checkForUpdates')}
                >
                  {ffmpegLoading || ffmpegCheckingUpdate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {ffmpegError && <EngineErrorNotice message={ffmpegError} />}

            <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('dependencies.source')}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {sourceOptions.map((option) => {
                  const isActive = ffmpegSourceUi === option.value;
                  return (
                    <button
                      key={`ffmpeg-source-${option.value}`}
                      type="button"
                      onClick={() => handleFfmpegSourceChange(option.value)}
                      disabled={ffmpegDownloading || ffmpegCheckingUpdate}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-xs transition-all border border-dashed',
                        isActive
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <a
              href="https://ffmpeg.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
            >
              ffmpeg.org
              <ExternalLink className="w-3 h-3" />
            </a>
          </SettingsCard>

          {/* Deno Runtime */}
          <SettingsCard id="deno" highlight={highlightId === 'deno'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Terminal className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t('dependencies.denoRuntime')}</span>
                    {denoLoading ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </Badge>
                    ) : denoStatus?.installed ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        {denoStatus.version || t('dependencies.installed')}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        {t('dependencies.notFound')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {denoDownloading ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {denoDownloadProgress
                          ? denoDownloadProgress.stage === 'downloading'
                            ? `${t('dependencies.downloading')} ${denoDownloadProgress.percent}%`
                            : denoDownloadProgress.stage === 'extracting'
                              ? t('dependencies.extracting')
                              : t('dependencies.installing')
                          : denoUpdateInfo?.has_update
                            ? t('dependencies.updating')
                            : t('dependencies.installing')}
                      </span>
                    ) : denoCheckingUpdate ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('dependencies.checkingUpdates')}
                      </span>
                    ) : denoSuccess ? (
                      <span className="text-emerald-500">
                        {denoUpdateInfo?.has_update
                          ? t('dependencies.updated')
                          : t('dependencies.installed')}
                      </span>
                    ) : denoError ? (
                      <span className="text-destructive">{denoError}</span>
                    ) : denoUpdateInfo?.has_update ? (
                      <span className="text-primary">
                        {t('dependencies.available', { version: denoUpdateInfo.latest_version })}
                      </span>
                    ) : denoUpdateInfo && !denoUpdateInfo.has_update ? (
                      <span className="text-emerald-500">{t('dependencies.upToDate')}</span>
                    ) : !denoStatus?.installed ? (
                      <span className="text-amber-500">{t('dependencies.requiredForYoutube')}</span>
                    ) : denoStatus?.is_system ? (
                      t('dependencies.systemDeno')
                    ) : (
                      t('dependencies.jsRuntimeForYoutube')
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {denoUpdateInfo?.has_update && !denoStatus?.is_system && (
                  <Button
                    size="sm"
                    onClick={() => void handleDenoUpdated()}
                    disabled={denoDownloading}
                  >
                    {denoDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      t('dependencies.update')
                    )}
                  </Button>
                )}
                {!denoStatus?.installed && !denoLoading && (
                  <Button
                    size="sm"
                    onClick={() => void handleDenoUpdated()}
                    disabled={denoDownloading}
                  >
                    {denoDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      t('dependencies.install')
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={checkDenoUpdate}
                  disabled={
                    denoLoading ||
                    denoDownloading ||
                    denoCheckingUpdate ||
                    !denoStatus?.installed ||
                    denoStatus?.is_system
                  }
                  title={t('dependencies.checkForUpdates')}
                >
                  {denoLoading || denoCheckingUpdate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            {denoError && <EngineErrorNotice message={denoError} />}
            <a
              href="https://deno.land"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
            >
              <FaIcon icon={faGlobeIcon} className="text-[12px]" />
              deno.land
              <ExternalLink className="w-3 h-3" />
            </a>
          </SettingsCard>

          {/* gallery-dl */}
          <SettingsCard id="gallerydl" highlight={highlightId === 'gallerydl'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-rose-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
                  <Images className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t('dependencies.gallerydl')}</span>
                    {galleryDlLoading ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </Badge>
                    ) : galleryDlStatus?.installed ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        {galleryDlStatus.version || t('dependencies.installed')}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        {t('dependencies.notFound')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {galleryDlLoading ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('dependencies.checkingUpdates')}
                      </span>
                    ) : galleryDlError ? (
                      <span className="text-destructive">{galleryDlError}</span>
                    ) : galleryDlStatus?.installed ? (
                      galleryDlStatus.is_system ? (
                        t('dependencies.systemGallerydl')
                      ) : (
                        t('dependencies.appManagedGallerydl')
                      )
                    ) : (
                      <span className="text-amber-500">
                        {t('dependencies.systemGallerydlNotFound')}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void checkGalleryDl()}
                disabled={galleryDlLoading}
                title={t('dependencies.checkForUpdates')}
              >
                {galleryDlLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>

            {galleryDlError && <EngineErrorNotice message={galleryDlError} />}

            <p className="mt-3 text-xs text-muted-foreground">
              {t('dependencies.galleryCollectionsEngine')}
            </p>

            {galleryDlUpdateInfo && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {galleryDlDownloadProgress
                    ? galleryDlDownloadProgress.stage === 'downloading'
                      ? `${t('dependencies.downloading')} ${galleryDlDownloadProgress.percent}%`
                      : galleryDlDownloadProgress.stage === 'verifying' ||
                          galleryDlDownloadProgress.stage === 'checksum'
                        ? t('dependencies.verifying')
                        : t('dependencies.installing')
                    : galleryDlUpdateInfo.has_update
                      ? t('dependencies.galleryDlNewVersion', {
                          version: galleryDlUpdateInfo.latest_version ?? '',
                        })
                      : t('dependencies.galleryDlUpToDate')}
                </span>
                {galleryDlUpdateInfo.has_update && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={galleryDlUpdating}
                    onClick={() => void handleGalleryDlUpdated()}
                  >
                    {galleryDlUpdating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    {t('dependencies.galleryDlUpdate')}
                  </Button>
                )}
              </div>
            )}
            {galleryDlUpdated && (
              <p className="mt-2 text-xs text-emerald-500">
                {t('dependencies.galleryDlUpdated', { version: galleryDlUpdated })}
              </p>
            )}

            <a
              href="https://github.com/mikf/gallery-dl"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
            >
              <FaIcon icon={faGithub} className="text-[12px]" />
              mikf/gallery-dl
              <ExternalLink className="w-3 h-3" />
            </a>
          </SettingsCard>

          {/* Engine maintenance */}
          <SettingsCard id="engine-maintenance" highlight={highlightId === 'engine-maintenance'}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{t('dependencies.compatTitle')}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('dependencies.compatDesc')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void runCompatTest();
                  void checkGalleryDlUpdate();
                }}
                disabled={compatLoading || backupsLoading}
              >
                {compatLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                {t('dependencies.runCompatTest')}
              </Button>
            </div>

            {compatResults && (
              <div className="mt-3 space-y-1.5">
                {compatResults.map((r) => (
                  <div key={r.engine} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      {r.ok ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                      )}
                      {ENGINE_LABELS[r.engine] || r.engine}
                      {r.version && (
                        <span className="font-mono text-muted-foreground">{r.version}</span>
                      )}
                    </span>
                    <span className={r.ok ? 'text-emerald-500' : 'text-destructive'}>
                      {r.ok ? t('dependencies.compatOk') : r.error || t('dependencies.compatFail')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="font-medium">{t('dependencies.previousVersions')}</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('dependencies.previousVersionsDesc')}
              </p>
              {backupsStatus ? (
                <div className="mt-3 space-y-1.5">
                  {ROLLBACK_ENGINES.filter((e) => backupsStatus[e.key].available).map((e) => (
                    <div key={e.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                        {e.label}
                        {backupsStatus[e.key].version && (
                          <span className="font-mono text-muted-foreground">
                            {backupsStatus[e.key].version}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rollbackLoading !== null}
                        onClick={() => void rollbackEngine(e.key)}
                      >
                        {rollbackLoading === e.key ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        {t('dependencies.rollback')}
                      </Button>
                    </div>
                  ))}
                  {ROLLBACK_ENGINES.every((e) => !backupsStatus[e.key].available) && (
                    <p className="text-xs text-muted-foreground">{t('dependencies.noBackups')}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">{t('dependencies.noBackups')}</p>
              )}
              {rollbackSuccess && (
                <p className="mt-2 text-xs text-emerald-500">
                  {t('dependencies.rollbackSuccess', { version: rollbackSuccess })}
                </p>
              )}
            </div>
          </SettingsCard>

          {/* YouTube Troubleshooting */}
          <SettingsCard
            id="youtube-troubleshooting"
            highlight={highlightId === 'youtube-troubleshooting'}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-medium">{t('dependencies.youtubeTroubleshooting')}</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('dependencies.optionsToFixIssues')}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{t('dependencies.useActualPlayerJs')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('dependencies.fixesUnableToDownload')}
                  </p>
                </div>
                <Switch
                  checked={settings.useActualPlayerJs}
                  onCheckedChange={updateUseActualPlayerJs}
                />
              </div>
            </div>
            <a
              href="https://github.com/yt-dlp/yt-dlp/issues/14680"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
            >
              {t('dependencies.learnMore')}
              <ExternalLink className="w-3 h-3" />
            </a>
          </SettingsCard>
        </SettingsSection>
      </div>
    </>
  );
}

import {
  AlertCircle,
  Download,
  ExternalLink,
  Film,
  Github,
  Loader2,
  Package,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useDownload } from '@/contexts/DownloadContext';
import type { YtdlpChannel } from '@/lib/types';
import { SettingsCard, SettingsSection } from '../SettingsSection';

interface DependenciesSectionProps {
  highlightId?: string | null;
}

export function DependenciesSection({ highlightId }: DependenciesSectionProps) {
  const { t } = useTranslation('settings');
  const { settings, updateUseActualPlayerJs } = useDownload();
  const {
    // yt-dlp
    ytdlpInfo,
    isLoading,
    isChecking,
    isUpdating,
    latestVersion,
    updateSuccess,
    error,
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
    setYtdlpChannel,
    checkChannelUpdate,
    downloadChannelBinary,
    // FFmpeg
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
  } = useDependencies();

  // Compare versions: update available if latestVersion exists and differs from current
  const isUpdateAvailable =
    latestVersion && ytdlpInfo?.version ? latestVersion !== ytdlpInfo.version : false;

  // Check if current channel needs download (not installed)
  const needsDownload = () => {
    if (ytdlpChannel === 'bundled') return false;
    if (!ytdlpAllVersions) return false;
    const info = ytdlpChannel === 'stable' ? ytdlpAllVersions.stable : ytdlpAllVersions.nightly;
    return !info.installed;
  };

  // Handle channel change
  const handleChannelChange = async (channel: YtdlpChannel) => {
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

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('dependencies.title')}
        description={t('dependencies.description')}
        icon={<Package className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-orange-500 to-red-600 shadow-orange-500/20"
      >
        {/* yt-dlp */}
        <SettingsCard id="ytdlp" highlight={highlightId === 'ytdlp'}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t('dependencies.ytdlp')}</span>
                  {isLoading || isChannelLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : ytdlpInfo ? (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {ytdlpInfo.version}
                    </Badge>
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
            <div className="flex items-center gap-2">
              {/* Channel selector */}
              <Select
                value={ytdlpChannel}
                onValueChange={(value) => handleChannelChange(value as YtdlpChannel)}
                disabled={isChannelLoading || isChannelDownloading}
              >
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bundled">{t('dependencies.channelBundled')}</SelectItem>
                  <SelectItem value="stable">{t('dependencies.channelStable')}</SelectItem>
                  <SelectItem value="nightly">{t('dependencies.channelNightly')}</SelectItem>
                </SelectContent>
              </Select>

              {/* Update/Download button */}
              {ytdlpChannel !== 'bundled' &&
                (needsDownload() ? (
                  <Button
                    size="sm"
                    onClick={() => downloadChannelBinary(ytdlpChannel)}
                    disabled={isChannelDownloading}
                  >
                    {isChannelDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-1" />
                        {t('dependencies.install')}
                      </>
                    )}
                  </Button>
                ) : ytdlpChannelUpdateInfo?.update_available ? (
                  <Button
                    size="sm"
                    onClick={() => downloadChannelBinary(ytdlpChannel)}
                    disabled={isChannelDownloading}
                  >
                    {isChannelDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      t('dependencies.update')
                    )}
                  </Button>
                ) : null)}

              {/* Legacy update for bundled (stable releases) */}
              {ytdlpChannel === 'bundled' && isUpdateAvailable && (
                <Button size="sm" onClick={updateYtdlp} disabled={isUpdating}>
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('dependencies.update')
                  )}
                </Button>
              )}

              {/* Check for updates button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (ytdlpChannel === 'bundled') {
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
          </div>
          <a
            href="https://github.com/yt-dlp/yt-dlp"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
          >
            <Github className="w-3 h-3" />
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
                  {ffmpegLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : ffmpegStatus?.installed ? (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {ffmpegStatus.version || t('dependencies.installed')}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      {t('dependencies.notFound')}
                    </Badge>
                  )}
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
                  ) : ffmpegUpdateInfo?.has_update ? (
                    <span className="text-primary">
                      {t('dependencies.available', { version: ffmpegUpdateInfo.latest_version })}
                    </span>
                  ) : ffmpegUpdateInfo && !ffmpegUpdateInfo.has_update ? (
                    <span className="text-emerald-500">{t('dependencies.upToDate')}</span>
                  ) : !ffmpegStatus?.installed ? (
                    <span className="text-amber-500">{t('dependencies.requiredFor2K4K8K')}</span>
                  ) : ffmpegStatus?.is_system ? (
                    t('dependencies.systemFfmpeg')
                  ) : (
                    t('dependencies.audioVideoProcessing')
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ffmpegUpdateInfo?.has_update && !ffmpegStatus?.is_system && (
                <Button size="sm" onClick={downloadFfmpeg} disabled={ffmpegDownloading}>
                  {ffmpegDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('dependencies.update')
                  )}
                </Button>
              )}
              {!ffmpegStatus?.installed && !ffmpegLoading && (
                <Button size="sm" onClick={downloadFfmpeg} disabled={ffmpegDownloading}>
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
                onClick={checkFfmpegUpdate}
                disabled={
                  ffmpegLoading ||
                  ffmpegDownloading ||
                  ffmpegCheckingUpdate ||
                  !ffmpegStatus?.installed ||
                  ffmpegStatus?.is_system
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
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
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
                <Button size="sm" onClick={downloadDeno} disabled={denoDownloading}>
                  {denoDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('dependencies.update')
                  )}
                </Button>
              )}
              {!denoStatus?.installed && !denoLoading && (
                <Button size="sm" onClick={downloadDeno} disabled={denoDownloading}>
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
          <a
            href="https://deno.land"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 pt-3 border-t border-border/50"
          >
            <Github className="w-3 h-3" />
            deno.land
            <ExternalLink className="w-3 h-3" />
          </a>
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
  );
}

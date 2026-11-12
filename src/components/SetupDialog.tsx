import {
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { type DownloadProgress, useDependencies } from '@/contexts/DependenciesContext';
import {
  dependencyProgressPercent,
  formatDependencyProgressLabel,
  formatDependencyProgressSize,
} from '@/lib/dependency-progress';
import {
  getYtdlpSetupState,
  getYtdlpTargetChannel,
  isSetupItemDone,
  type SetupDependencyState,
  type SetupItem,
  ytdlpSetupNeedsDownload,
} from '@/lib/setup-dialog';
import { cn } from '@/lib/utils';

interface SetupDialogProps {
  /** Items to list. Frozen by the caller when the dialog opens so installed items stay visible. */
  items: SetupItem[];
  onClose: () => void;
  onOpenDependencies: () => void;
}

type BadgeTone = 'pending' | 'ready' | 'busy' | 'done' | 'error';

interface ItemView {
  icon: typeof Download;
  title: string;
  text: string;
  badge: { tone: BadgeTone; label: string };
  detail: string | null;
  busy: { label: string; size: string | null; percent: number | null } | null;
  error: string | null;
  action: { label: string; icon: ReactNode; run: () => Promise<boolean> } | null;
}

export function SetupDialog({ items, onClose, onOpenDependencies }: SetupDialogProps) {
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const deps = useDependencies();
  const [attempted, setAttempted] = useState<Record<SetupItem, boolean>>({
    ytdlp: false,
    ffmpeg: false,
  });
  const [isSwitchingYtdlp, setIsSwitchingYtdlp] = useState(false);
  const [isInstallingAll, setIsInstallingAll] = useState(false);

  const state: SetupDependencyState = {
    ytdlpSource: deps.ytdlpSource,
    ytdlpChannel: deps.ytdlpChannel,
    ytdlpAllVersions: deps.ytdlpAllVersions,
    ffmpegSource: deps.ffmpegSource,
    ffmpegStatus: deps.ffmpegStatus,
  };

  const busyView = (progress: DownloadProgress | null, fallback: string) => ({
    label: formatDependencyProgressLabel(tSettings, progress, fallback),
    size: formatDependencyProgressSize(progress),
    percent: dependencyProgressPercent(progress),
  });

  // --- yt-dlp ---------------------------------------------------------------
  const ytdlpTarget = getYtdlpTargetChannel(state);
  const ytdlpTargetName = tSettings(
    ytdlpTarget === 'nightly' ? 'dependencies.channelNightly' : 'dependencies.channelStable',
  );

  const runYtdlp = async (): Promise<boolean> => {
    setAttempted((prev) => ({ ...prev, ytdlp: true }));
    const target = getYtdlpTargetChannel(state);
    if (ytdlpSetupNeedsDownload(getYtdlpSetupState(state))) {
      // Download first and only then switch, so a failed download keeps the working bundled binary.
      const downloaded = await deps.downloadChannelBinary(target);
      if (!downloaded) return false;
    }
    if (deps.ytdlpChannel !== target) {
      setIsSwitchingYtdlp(true);
      try {
        await deps.setYtdlpChannel(target);
      } finally {
        setIsSwitchingYtdlp(false);
      }
    }
    return true;
  };

  const ytdlpView = (): ItemView => {
    const setupState = getYtdlpSetupState(state);
    const versions = deps.ytdlpAllVersions;
    const targetVersion = versions?.[ytdlpTarget].version ?? '';
    const bundledVersion = versions?.bundled.version ?? '';
    const downloadingTarget = deps.ytdlpDownloadingChannel === ytdlpTarget;
    // Another channel download (e.g. from Settings) is running: wait for it instead of racing.
    const otherDownload = deps.isChannelDownloading && !downloadingTarget;
    const error = attempted.ytdlp && !downloadingTarget ? deps.channelError : null;

    const base: Pick<ItemView, 'icon' | 'title' | 'text'> = {
      icon: Download,
      title: t('setupDialog.ytdlp.title', { channel: ytdlpTargetName }),
      text: t('setupDialog.ytdlp.text'),
    };

    if (downloadingTarget) {
      return {
        ...base,
        badge: { tone: 'busy', label: t('setupDialog.status.downloading') },
        detail: null,
        busy: busyView(deps.ytdlpDownloadProgress, tSettings('dependencies.downloadingYtdlp')),
        error: null,
        action: null,
      };
    }
    if (isSwitchingYtdlp) {
      return {
        ...base,
        badge: { tone: 'busy', label: t('setupDialog.status.switching') },
        detail: null,
        busy: { label: t('setupDialog.status.switching'), size: null, percent: null },
        error: null,
        action: null,
      };
    }
    if (setupState === 'active') {
      return {
        ...base,
        badge: { tone: 'done', label: t('setupDialog.status.inUse') },
        detail: t('setupDialog.ytdlp.inUse', {
          channel: ytdlpTargetName,
          version: targetVersion,
        }),
        busy: null,
        error: null,
        action: null,
      };
    }

    const disabledByOther = otherDownload;
    if (setupState === 'downloadedNotActive') {
      return {
        ...base,
        badge: { tone: 'ready', label: t('setupDialog.status.downloadedNotActive') },
        detail: t('setupDialog.ytdlp.downloaded', {
          channel: ytdlpTargetName,
          version: targetVersion,
          bundled: bundledVersion,
        }),
        busy: null,
        error,
        action: disabledByOther
          ? null
          : {
              label: t('setupDialog.actions.switch', { channel: ytdlpTargetName }),
              icon: <ArrowRightLeft className="h-3 w-3" />,
              run: runYtdlp,
            },
      };
    }

    const missingFile = setupState === 'missingFile';
    return {
      ...base,
      badge: error
        ? { tone: 'error', label: t('setupDialog.status.failed') }
        : {
            tone: 'pending',
            label: missingFile
              ? t('setupDialog.status.missingFile')
              : t('setupDialog.status.notDownloaded'),
          },
      detail: missingFile
        ? t('setupDialog.ytdlp.missingFile', { channel: ytdlpTargetName, bundled: bundledVersion })
        : bundledVersion
          ? t('setupDialog.ytdlp.current', { version: bundledVersion })
          : null,
      busy: null,
      error,
      action: disabledByOther
        ? null
        : {
            label: error
              ? t('setupDialog.actions.retry')
              : missingFile
                ? t('setupDialog.actions.download')
                : t('setupDialog.actions.downloadAndSwitch'),
            icon: error ? <RefreshCw className="h-3 w-3" /> : <Download className="h-3 w-3" />,
            run: runYtdlp,
          },
    };
  };

  // --- FFmpeg ---------------------------------------------------------------
  const runFfmpeg = async (): Promise<boolean> => {
    setAttempted((prev) => ({ ...prev, ffmpeg: true }));
    return deps.downloadFfmpeg();
  };

  const ffmpegView = (): ItemView => {
    const base: Pick<ItemView, 'icon' | 'title' | 'text'> = {
      icon: Film,
      title: t('setupDialog.ffmpeg.title'),
      text: t('setupDialog.ffmpeg.text'),
    };
    if (deps.ffmpegDownloading) {
      return {
        ...base,
        badge: { tone: 'busy', label: t('setupDialog.status.downloading') },
        detail: null,
        busy: busyView(deps.ffmpegDownloadProgress, tSettings('dependencies.installing')),
        error: null,
        action: null,
      };
    }
    if (deps.ffmpegStatus?.installed) {
      return {
        ...base,
        badge: { tone: 'done', label: t('setupDialog.status.installed') },
        detail: deps.ffmpegStatus.version ? `FFmpeg ${deps.ffmpegStatus.version}` : null,
        busy: null,
        error: null,
        action: null,
      };
    }
    const error = attempted.ffmpeg ? deps.ffmpegError : null;
    return {
      ...base,
      badge: error
        ? { tone: 'error', label: t('setupDialog.status.failed') }
        : { tone: 'pending', label: t('setupDialog.status.notInstalled') },
      detail: null,
      busy: null,
      error,
      action: {
        label: error ? t('setupDialog.actions.retry') : t('setupDialog.actions.install'),
        icon: error ? <RefreshCw className="h-3 w-3" /> : <Download className="h-3 w-3" />,
        run: runFfmpeg,
      },
    };
  };

  const views = items.map((item) => (item === 'ytdlp' ? ytdlpView() : ffmpegView()));
  const isBusy = isInstallingAll || views.some((view) => view.busy !== null);
  const allDone = items.length > 0 && items.every((item) => isSetupItemDone(item, state));
  const hasPendingAction = views.some((view) => view.action !== null);

  const installAll = async () => {
    setIsInstallingAll(true);
    try {
      for (const item of items) {
        if (isSetupItemDone(item, state)) continue;
        await (item === 'ytdlp' ? runYtdlp() : runFfmpeg());
      }
    } finally {
      setIsInstallingAll(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isBusy) onClose();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[560px]"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('setupDialog.title')}</DialogTitle>
          <DialogDescription>{t('setupDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {views.map((view, index) => {
            const Icon = view.icon;
            return (
              <div
                key={items[index]}
                className="flex gap-3 rounded-lg border border-border/60 bg-muted/50 px-3 py-3"
              >
                <div className="mt-0.5 h-fit rounded-md bg-primary/10 p-1.5 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{view.title}</p>
                    <StatusBadge tone={view.badge.tone} label={view.badge.label} />
                  </div>
                  <p className="text-sm text-muted-foreground">{view.text}</p>
                  {view.detail && (
                    <p className="font-mono text-[11px] text-muted-foreground">{view.detail}</p>
                  )}
                  {view.busy && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-primary">
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {view.busy.label}
                        </span>
                        {view.busy.size && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {view.busy.size}
                          </span>
                        )}
                      </div>
                      {view.busy.percent !== null ? (
                        <Progress value={view.busy.percent} className="h-1.5" />
                      ) : (
                        <div className="h-1.5 overflow-hidden rounded-full bg-primary/20">
                          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
                        </div>
                      )}
                    </div>
                  )}
                  {view.error && <p className="text-xs text-destructive">{view.error}</p>}
                </div>
                {view.action && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void view.action?.run()}
                    className="inline-flex h-fit shrink-0 items-center gap-1 rounded-md border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {view.action.icon}
                    {view.action.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:gap-0">
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              onClose();
              onOpenDependencies();
            }}
          >
            <Settings2 />
            {t('setupDialog.openDependencies')}
          </Button>
          <div className="flex gap-2">
            {allDone ? (
              <Button size="sm" onClick={onClose}>
                {t('setupDialog.done')}
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" disabled={isBusy} onClick={onClose}>
                  {t('setupDialog.later')}
                </Button>
                <Button
                  size="sm"
                  disabled={isBusy || !hasPendingAction}
                  onClick={() => void installAll()}
                >
                  {isBusy ? <Loader2 className="animate-spin" /> : <Download />}
                  {isBusy ? t('setupDialog.working') : t('setupDialog.setUpAll')}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'done' && 'bg-green-500/10 text-green-600 dark:text-green-400',
        tone === 'busy' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        tone === 'ready' && 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        tone === 'error' && 'bg-red-500/10 text-red-600 dark:text-red-400',
        tone === 'pending' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      )}
    >
      {tone === 'done' && <CheckCircle2 className="h-3 w-3" />}
      {tone === 'busy' && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  );
}

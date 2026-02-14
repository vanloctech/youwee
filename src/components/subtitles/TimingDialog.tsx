import { invoke } from '@tauri-apps/api/core';
import { ArrowDown, ArrowUp, Clapperboard, Loader2, Timer } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { cn } from '@/lib/utils';

interface TimingDialogProps {
  open: boolean;
  onClose: () => void;
}

type TimingTab = 'shift' | 'scale' | 'twopoint' | 'shot';

interface ShotDetectionResult {
  shot_times_ms: number[];
  threshold: number;
  min_interval_ms: number;
}

export function TimingDialog({ open, onClose }: TimingDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [tab, setTab] = useState<TimingTab>('shift');

  // Shift state
  const [shiftMs, setShiftMs] = useState(0);
  const [shiftMode, setShiftMode] = useState<'all' | 'selected'>('all');

  // Scale state
  const [scaleRatio, setScaleRatio] = useState(1.0);

  // Two-point sync state
  const [point1Original, setPoint1Original] = useState(0);
  const [point1Desired, setPoint1Desired] = useState(0);
  const [point2Original, setPoint2Original] = useState(0);
  const [point2Desired, setPoint2Desired] = useState(0);

  // Shot sync state
  const [shotThreshold, setShotThreshold] = useState(0.35);
  const [snapWindowMs, setSnapWindowMs] = useState(140);
  const [snapScope, setSnapScope] = useState<'all' | 'selected'>('all');
  const [shotTimes, setShotTimes] = useState<number[]>([]);
  const [isDetectingShots, setIsDetectingShots] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [lastSnapCount, setLastSnapCount] = useState(0);

  const handleShift = useCallback(() => {
    if (shiftMs === 0) return;

    const entriesToUpdate =
      shiftMode === 'selected' && subtitle.selectedIds.size > 0
        ? subtitle.entries.filter((e) => subtitle.selectedIds.has(e.id))
        : subtitle.entries;

    const updates = entriesToUpdate.map((e) => ({
      id: e.id,
      changes: {
        startTime: Math.max(0, e.startTime + shiftMs),
        endTime: Math.max(0, e.endTime + shiftMs),
      },
    }));

    subtitle.updateEntries(updates);
    onClose();
  }, [shiftMs, shiftMode, subtitle, onClose]);

  const handleScale = useCallback(() => {
    if (scaleRatio === 1.0) return;

    const updates = subtitle.entries.map((e) => ({
      id: e.id,
      changes: {
        startTime: Math.max(0, Math.round(e.startTime * scaleRatio)),
        endTime: Math.max(0, Math.round(e.endTime * scaleRatio)),
      },
    }));

    subtitle.updateEntries(updates);
    onClose();
  }, [scaleRatio, subtitle, onClose]);

  const handleTwoPointSync = useCallback(() => {
    if (point1Original === point2Original) return;

    // Calculate linear transformation: newTime = a * oldTime + b
    const a = (point2Desired - point1Desired) / (point2Original - point1Original);
    const b = point1Desired - a * point1Original;

    const updates = subtitle.entries.map((e) => ({
      id: e.id,
      changes: {
        startTime: Math.max(0, Math.round(a * e.startTime + b)),
        endTime: Math.max(0, Math.round(a * e.endTime + b)),
      },
    }));

    subtitle.updateEntries(updates);
    onClose();
  }, [point1Original, point1Desired, point2Original, point2Desired, subtitle, onClose]);

  const handleDetectShots = useCallback(async () => {
    if (!subtitle.videoPath) {
      setShotError(t('timing.shotNeedVideo'));
      return;
    }
    setShotError(null);
    setIsDetectingShots(true);
    setLastSnapCount(0);
    try {
      const result = await invoke<ShotDetectionResult>('detect_shot_changes', {
        path: subtitle.videoPath,
        threshold: shotThreshold,
        minIntervalMs: 250,
      });
      setShotTimes(result.shot_times_ms);
    } catch (err) {
      setShotError(String(err));
    } finally {
      setIsDetectingShots(false);
    }
  }, [subtitle.videoPath, shotThreshold, t]);

  const handleSnapToShots = useCallback(() => {
    if (shotTimes.length === 0) {
      setShotError(t('timing.shotDetectFirst'));
      return;
    }

    const entriesToUpdate =
      snapScope === 'selected' && subtitle.selectedIds.size > 0
        ? subtitle.entries.filter((entry) => subtitle.selectedIds.has(entry.id))
        : subtitle.entries;

    const nearestWithinWindow = (timeMs: number) => {
      let nearest: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const shotMs of shotTimes) {
        const dist = Math.abs(shotMs - timeMs);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = shotMs;
        }
      }
      if (nearest === null || bestDist > snapWindowMs) return null;
      return nearest;
    };

    const updates = entriesToUpdate
      .map((entry) => {
        const snappedStart = nearestWithinWindow(entry.startTime);
        const snappedEnd = nearestWithinWindow(entry.endTime);
        const start = snappedStart ?? entry.startTime;
        let end = snappedEnd ?? entry.endTime;

        if (end <= start + 100) {
          end = start + 100;
        }

        if (start !== entry.startTime || end !== entry.endTime) {
          return {
            id: entry.id,
            changes: {
              startTime: start,
              endTime: end,
            },
          };
        }
        return null;
      })
      .filter(
        (item): item is { id: string; changes: { startTime: number; endTime: number } } => !!item,
      );

    if (updates.length === 0) {
      setLastSnapCount(0);
      setShotError(t('timing.shotNoChange'));
      return;
    }

    subtitle.updateEntries(updates);
    setLastSnapCount(updates.length);
    setShotError(null);
  }, [shotTimes, snapScope, subtitle, snapWindowMs, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[460px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
          <Timer className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('timing.title')}</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50">
          {(['shift', 'scale', 'twopoint', 'shot'] as TimingTab[]).map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === tabId
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tabId === 'shift' && t('timing.shiftAll')}
              {tabId === 'scale' && t('timing.scale')}
              {tabId === 'twopoint' && t('timing.twoPointSync')}
              {tabId === 'shot' && t('timing.shotSync')}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Shift Tab */}
          {tab === 'shift' && (
            <>
              <div className="space-y-2">
                <label htmlFor="shift-ms" className="text-sm font-medium">
                  {t('timing.shiftMs')}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShiftMs((v) => v - 100)}
                    className="p-2 rounded-lg hover:bg-accent transition-colors"
                    title={t('timing.shiftBackward')}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <input
                    id="shift-ms"
                    type="number"
                    value={shiftMs}
                    onChange={(e) => setShiftMs(Number(e.target.value))}
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg text-center tabular-nums outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShiftMs((v) => v + 100)}
                    className="p-2 rounded-lg hover:bg-accent transition-colors"
                    title={t('timing.shiftForward')}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {shiftMs > 0 ? `+${shiftMs}ms` : `${shiftMs}ms`}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShiftMode('all')}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-lg border transition-colors',
                    shiftMode === 'all'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {t('timing.shiftAll')}
                </button>
                <button
                  type="button"
                  onClick={() => setShiftMode('selected')}
                  disabled={subtitle.selectedIds.size === 0}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-lg border transition-colors',
                    'disabled:opacity-50',
                    shiftMode === 'selected'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {t('timing.shiftSelected')}
                </button>
              </div>
            </>
          )}

          {/* Scale Tab */}
          {tab === 'scale' && (
            <div className="space-y-2">
              <label htmlFor="scale-ratio" className="text-sm font-medium">
                {t('timing.scaleRatio')}
              </label>
              <input
                id="scale-ratio"
                type="number"
                value={scaleRatio}
                onChange={(e) => setScaleRatio(Number(e.target.value))}
                step={0.01}
                min={0.1}
                max={10}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-center tabular-nums outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-muted-foreground">
                1.0 = {t('timing.scale')} (no change), 0.5 = half speed, 2.0 = double speed
              </p>
            </div>
          )}

          {/* Two-Point Sync Tab */}
          {tab === 'twopoint' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t('timing.point1')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="p1-orig" className="text-xs text-muted-foreground">
                      {t('timing.originalTime')}
                    </label>
                    <input
                      id="p1-orig"
                      type="number"
                      value={point1Original}
                      onChange={(e) => setPoint1Original(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg tabular-nums outline-none"
                      placeholder="ms"
                    />
                  </div>
                  <div>
                    <label htmlFor="p1-desired" className="text-xs text-muted-foreground">
                      {t('timing.desiredTime')}
                    </label>
                    <input
                      id="p1-desired"
                      type="number"
                      value={point1Desired}
                      onChange={(e) => setPoint1Desired(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg tabular-nums outline-none"
                      placeholder="ms"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t('timing.point2')}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="p2-orig" className="text-xs text-muted-foreground">
                      {t('timing.originalTime')}
                    </label>
                    <input
                      id="p2-orig"
                      type="number"
                      value={point2Original}
                      onChange={(e) => setPoint2Original(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg tabular-nums outline-none"
                      placeholder="ms"
                    />
                  </div>
                  <div>
                    <label htmlFor="p2-desired" className="text-xs text-muted-foreground">
                      {t('timing.desiredTime')}
                    </label>
                    <input
                      id="p2-desired"
                      type="number"
                      value={point2Desired}
                      onChange={(e) => setPoint2Desired(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg tabular-nums outline-none"
                      placeholder="ms"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Shot Sync Tab */}
          {tab === 'shot' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-background/70 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('timing.shotDetect')}</span>
                  <button
                    type="button"
                    onClick={() => void handleDetectShots()}
                    disabled={isDetectingShots}
                    className={cn(
                      'h-8 px-3 rounded-md text-xs font-medium border border-dashed border-border/70',
                      'hover:bg-accent transition-colors',
                      'disabled:opacity-50 disabled:pointer-events-none',
                    )}
                  >
                    {isDetectingShots ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('timing.detecting')}
                      </span>
                    ) : (
                      t('timing.detect')
                    )}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="shot-threshold" className="text-xs text-muted-foreground">
                    {t('timing.shotThreshold')}
                  </label>
                  <input
                    id="shot-threshold"
                    type="number"
                    value={shotThreshold}
                    onChange={(e) => setShotThreshold(Number(e.target.value))}
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    className="w-full h-9 px-3 rounded-md text-sm bg-background border border-border/60 outline-none"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('timing.shotFound', { count: shotTimes.length })}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/70 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('timing.shotSnap')}</span>
                  <button
                    type="button"
                    onClick={handleSnapToShots}
                    className={cn(
                      'h-8 px-3 rounded-md text-xs font-medium border border-dashed border-border/70 inline-flex items-center gap-1.5',
                      'hover:bg-accent transition-colors',
                    )}
                  >
                    <Clapperboard className="w-3.5 h-3.5" />
                    {t('timing.shotApply')}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="shot-window" className="text-xs text-muted-foreground">
                    {t('timing.shotWindowMs')}
                  </label>
                  <input
                    id="shot-window"
                    type="number"
                    value={snapWindowMs}
                    onChange={(e) => setSnapWindowMs(Number(e.target.value))}
                    min={20}
                    max={500}
                    step={10}
                    className="w-full h-9 px-3 rounded-md text-sm bg-background border border-border/60 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSnapScope('all')}
                    className={cn(
                      'h-8 rounded-md text-xs border transition-colors',
                      snapScope === 'all'
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 hover:bg-accent',
                    )}
                  >
                    {t('timing.shiftAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSnapScope('selected')}
                    disabled={subtitle.selectedIds.size === 0}
                    className={cn(
                      'h-8 rounded-md text-xs border transition-colors disabled:opacity-50',
                      snapScope === 'selected'
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 hover:bg-accent',
                    )}
                  >
                    {t('timing.shiftSelected')}
                  </button>
                </div>
              </div>

              {lastSnapCount > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t('timing.shotApplied', { count: lastSnapCount })}
                </p>
              )}
              {shotError && <p className="text-xs text-red-500">{shotError}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            {t('timing.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (tab === 'shift') handleShift();
              else if (tab === 'scale') handleScale();
              else if (tab === 'twopoint') handleTwoPointSync();
              else handleSnapToShots();
            }}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
            )}
          >
            {t('timing.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

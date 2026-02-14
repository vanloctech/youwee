import { Check, Palette, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { fixGaps, fixLineBreaking, fixLongDuration, fixShortDuration } from '@/lib/subtitle-fixes';
import {
  getSubtitleStyleProfile,
  SUBTITLE_STYLE_PROFILES,
  type SubtitleStyleProfileId,
} from '@/lib/subtitle-style-profiles';
import { cn } from '@/lib/utils';

interface SubtitleStyleProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SubtitleStyleProfileDialog({ open, onClose }: SubtitleStyleProfileDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [selectedProfileId, setSelectedProfileId] = useState<SubtitleStyleProfileId>(
    subtitle.styleProfileId,
  );
  const [appliedCount, setAppliedCount] = useState(0);

  const selectedProfile = useMemo(
    () => getSubtitleStyleProfile(selectedProfileId),
    [selectedProfileId],
  );

  const applyProfileOnly = () => {
    subtitle.setStyleProfile(selectedProfileId);
    setAppliedCount(0);
  };

  const applyProfileRules = () => {
    subtitle.setStyleProfile(selectedProfileId);
    const thresholds = selectedProfile.thresholds;
    let result = [...subtitle.entries];
    result = fixLineBreaking(result, thresholds.maxCpl);
    result = fixShortDuration(result, thresholds.minDurationMs);
    result = fixLongDuration(result, thresholds.maxDurationMs);
    result = fixGaps(result, thresholds.minGapMs, thresholds.minDurationMs);

    let changed = 0;
    for (let i = 0; i < subtitle.entries.length; i++) {
      const before = subtitle.entries[i];
      const after = result[i];
      if (!after) continue;
      if (
        before.text !== after.text ||
        before.startTime !== after.startTime ||
        before.endTime !== after.endTime
      ) {
        changed += 1;
      }
    }

    if (changed > 0) {
      subtitle.replaceAllEntries(result, `Apply style profile: ${selectedProfileId}`);
    }
    setAppliedCount(changed);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[620px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('styleProfiles.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{t('styleProfiles.description')}</p>

          <div className="grid gap-2">
            {SUBTITLE_STYLE_PROFILES.map((profile) => {
              const isActive = selectedProfileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={cn(
                    'text-left rounded-xl border px-3 py-2.5 transition-colors',
                    isActive
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/60 hover:bg-accent/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t(profile.labelKey)}</span>
                    {isActive && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(profile.descriptionKey)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                    CPS {profile.thresholds.maxCps} · WPM {profile.thresholds.maxWpm} · CPL{' '}
                    {profile.thresholds.maxCpl} · GAP {profile.thresholds.minGapMs}ms
                  </p>
                </button>
              );
            })}
          </div>

          {appliedCount > 0 && (
            <div className="text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {t('styleProfiles.appliedResult', { count: appliedCount })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('styleProfiles.affects')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyProfileOnly}
              className="px-3.5 py-2 text-sm rounded-lg border border-border/60 hover:bg-accent transition-colors"
            >
              {t('styleProfiles.useForQcOnly')}
            </button>
            <button
              type="button"
              onClick={applyProfileRules}
              className="px-3.5 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t('styleProfiles.applyNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

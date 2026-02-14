import { Keyboard, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface SubtitlesUsageGuideProps {
  compact?: boolean;
  className?: string;
}

export function SubtitlesUsageGuide({ compact = false, className }: SubtitlesUsageGuideProps) {
  const { t } = useTranslation('subtitles');
  const steps = [
    t('hints.steps.openOrCreate'),
    t('hints.steps.editAndSync'),
    t('hints.steps.qcAndFix'),
    t('hints.steps.waveformAndShot'),
    t('hints.steps.aiAndTranslate'),
    t('hints.steps.exportAndBatch'),
  ];
  const features = [
    t('hints.features.fileOps'),
    t('hints.features.editor'),
    t('hints.features.findReplace'),
    t('hints.features.timing'),
    t('hints.features.waveform'),
    t('hints.features.qc'),
    t('hints.features.fixErrors'),
    t('hints.features.splitMerge'),
    t('hints.features.styleProfiles'),
    t('hints.features.translateMode'),
    t('hints.features.aiTools'),
    t('hints.features.batchProject'),
  ];

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-gradient-to-b from-background to-muted/20',
        compact ? 'p-3.5' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
          <Lightbulb className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('hints.title')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('hints.description')}</p>
        </div>
      </div>

      <p className="mt-3 text-xs font-medium text-foreground/90">{t('hints.workflowTitle')}</p>
      <ul className="mt-1.5 space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      <p className="mt-4 text-xs font-medium text-foreground/90">{t('hints.featuresTitle')}</p>
      <ul className="mt-1.5 grid gap-1.5 text-xs text-muted-foreground list-disc pl-4 sm:grid-cols-2">
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
        <Keyboard className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{t('hints.shortcuts')}</span>
      </div>
    </div>
  );
}

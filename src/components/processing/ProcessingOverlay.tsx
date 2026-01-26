import { Loader2 } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { ProcessingProgress } from '@/lib/types';

export interface ProcessingOverlayProps {
  progress: ProcessingProgress;
  onCancel: () => void;
}

export const ProcessingOverlay = memo(function ProcessingOverlay({
  progress,
  onCancel,
}: ProcessingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 rounded-xl z-20">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <div className="text-center text-white">
        <p className="font-medium">{progress.percent.toFixed(0)}%</p>
        <p className="text-xs text-white/60">{progress.speed}</p>
      </div>
      <Progress value={progress.percent} className="w-48" />
      <Button variant="destructive" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
});

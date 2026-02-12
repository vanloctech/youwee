import { AlertTriangle, Film, Image } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PreviewConfirmInfo } from '@/contexts/ProcessingContext';

export interface PreviewConfirmDialogProps {
  info: PreviewConfirmInfo | null;
  onConfirm: (createPreview: boolean) => void;
}

export function PreviewConfirmDialog({ info, onConfirm }: PreviewConfirmDialogProps) {
  const { t } = useTranslation('pages');

  return (
    <Dialog open={!!info} onOpenChange={() => onConfirm(false)}>
      <DialogContent className="w-[512px] overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {t('processing.previewConfirm.title')}
          </DialogTitle>
          <DialogDescription>{t('processing.previewConfirm.description')}</DialogDescription>
        </DialogHeader>

        {info && (
          <div className="space-y-4">
            {/* File info */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
              <p className="text-sm font-medium break-words">{info.filename}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{info.fileSizeMB.toFixed(0)} MB</span>
                <span className="uppercase">{info.codec}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => onConfirm(true)}
                className="justify-start gap-3 h-auto py-3 px-4"
              >
                <Film className="w-5 h-5 shrink-0" />
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium">
                    {t('processing.previewConfirm.createPreview')}
                  </p>
                  <p className="text-xs opacity-70">
                    {t('processing.previewConfirm.createPreviewHint')}
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => onConfirm(false)}
                className="justify-start gap-3 h-auto py-3 px-4"
              >
                <Image className="w-5 h-5 shrink-0" />
                <div className="text-left min-w-0">
                  <p className="text-sm font-medium">
                    {t('processing.previewConfirm.thumbnailOnly')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('processing.previewConfirm.thumbnailOnlyHint')}
                  </p>
                </div>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

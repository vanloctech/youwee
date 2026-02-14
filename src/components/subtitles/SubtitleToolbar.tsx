import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  ArrowDownToLine,
  ChevronDown,
  FilePlus,
  FileUp,
  Globe,
  Languages,
  Merge,
  Mic,
  Plus,
  Redo2,
  Save,
  Search,
  Sparkles,
  Timer,
  Trash2,
  Undo2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useSubtitle } from '@/contexts/SubtitleContext';
import type { SubtitleFormat } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SubtitleToolbarProps {
  onOpenFile: () => void;
  onCreateNew: () => void;
  onCloseFile: () => void;
  onShowDownloadDialog: () => void;
  onShowTimingDialog?: () => void;
  onShowFindReplace?: () => void;
  onShowFixErrors?: () => void;
  onShowWhisper?: () => void;
  onShowTranslate?: () => void;
  onShowGrammarFix?: () => void;
}

export function SubtitleToolbar({
  onOpenFile,
  onCreateNew,
  onCloseFile,
  onShowDownloadDialog,
  onShowTimingDialog,
  onShowFindReplace,
  onShowFixErrors,
  onShowWhisper,
  onShowTranslate,
  onShowGrammarFix,
}: SubtitleToolbarProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [pendingAction, setPendingAction] = useState<'open' | 'new' | 'close' | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const saveCurrentFile = useCallback(async (): Promise<boolean> => {
    try {
      const content = subtitle.getSerializedContent();

      if (subtitle.filePath) {
        await writeTextFile(subtitle.filePath, content);
        subtitle.markSaved();
        return true;
      }

      // Save As dialog
      const ext = subtitle.format;
      const filePath = await save({
        filters: [
          {
            name: `Subtitle (${ext.toUpperCase()})`,
            extensions: [ext],
          },
        ],
        defaultPath: subtitle.fileName || `subtitle.${ext}`,
      });

      if (!filePath) return false;
      await writeTextFile(filePath, content);
      subtitle.setFilePath(filePath);
      subtitle.markSaved();
      return true;
    } catch (err) {
      console.error('Failed to save subtitle file:', err);
      return false;
    }
  }, [subtitle]);

  const runAction = useCallback(
    (action: 'open' | 'new' | 'close') => {
      switch (action) {
        case 'open':
          onOpenFile();
          break;
        case 'new':
          onCreateNew();
          break;
        case 'close':
          onCloseFile();
          break;
      }
    },
    [onCreateNew, onCloseFile, onOpenFile],
  );

  const runGuardedAction = useCallback(
    (action: 'open' | 'new' | 'close') => {
      if (!subtitle.isDirty) {
        runAction(action);
        return;
      }
      setPendingAction(action);
      setShowUnsavedDialog(true);
    },
    [runAction, subtitle.isDirty],
  );

  const handleSave = useCallback(async () => {
    await saveCurrentFile();
  }, [saveCurrentFile]);

  const handleSaveAs = useCallback(
    async (format?: SubtitleFormat) => {
      try {
        const targetFormat = format || subtitle.format;
        if (format) subtitle.setFormat(format);

        const content = subtitle.getSerializedContent();
        const filePath = await save({
          filters: [
            {
              name: `Subtitle (${targetFormat.toUpperCase()})`,
              extensions: [targetFormat],
            },
          ],
          defaultPath:
            subtitle.fileName?.replace(/\.[^.]+$/, `.${targetFormat}`) ||
            `subtitle.${targetFormat}`,
        });

        if (!filePath) return;
        await writeTextFile(filePath, content);
        subtitle.setFilePath(filePath);
        subtitle.markSaved();
      } catch (err) {
        console.error('Failed to save subtitle file:', err);
      }
    },
    [subtitle],
  );

  const handleConfirmSaveAndContinue = useCallback(async () => {
    if (!pendingAction) return;
    const saveOk = await saveCurrentFile();
    if (!saveOk) return;
    setShowUnsavedDialog(false);
    const action = pendingAction;
    setPendingAction(null);
    runAction(action);
  }, [pendingAction, runAction, saveCurrentFile]);

  const handleDiscardAndContinue = useCallback(() => {
    if (!pendingAction) return;
    setShowUnsavedDialog(false);
    const action = pendingAction;
    setPendingAction(null);
    runAction(action);
  }, [pendingAction, runAction]);

  const handleCancelPendingAction = useCallback(() => {
    setShowUnsavedDialog(false);
    setPendingAction(null);
  }, []);

  const handleInsertAfter = useCallback(() => {
    const activeId = subtitle.activeEntryId;
    subtitle.insertEntry(activeId);
  }, [subtitle]);

  const _handleInsertBefore = useCallback(() => {
    const activeId = subtitle.activeEntryId;
    if (activeId) {
      subtitle.insertEntryBefore(activeId);
    } else {
      subtitle.insertEntry(null);
    }
  }, [subtitle]);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(subtitle.selectedIds);
    if (ids.length > 0) {
      subtitle.deleteEntries(ids);
    } else if (subtitle.activeEntryId) {
      subtitle.deleteEntries([subtitle.activeEntryId]);
    }
  }, [subtitle]);

  const handleMerge = useCallback(() => {
    const ids = Array.from(subtitle.selectedIds);
    if (ids.length >= 2) {
      subtitle.mergeEntries(ids);
    }
  }, [subtitle]);

  const selectedCount = subtitle.selectedIds.size;

  return (
    <>
      <div className="flex items-center gap-1 px-1 py-1 flex-shrink-0 flex-wrap">
        {/* File group */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<FileUp className="w-3.5 h-3.5" />}
            label={t('toolbar.open')}
            onClick={() => runGuardedAction('open')}
          />
          <ToolbarButton
            icon={<FilePlus className="w-3.5 h-3.5" />}
            label={t('toolbar.new')}
            onClick={() => runGuardedAction('new')}
          />
          <ToolbarButton
            icon={<XCircle className="w-3.5 h-3.5" />}
            label={t('toolbar.close')}
            onClick={() => runGuardedAction('close')}
          />
          <ToolbarButton
            icon={<Save className="w-3.5 h-3.5" />}
            label={t('toolbar.save')}
            onClick={handleSave}
            shortcut="Ctrl+S"
          />
          {/* Export dropdown */}
          <div className="relative group">
            <ToolbarButton
              icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
              label={t('toolbar.exportAs')}
              onClick={() => {}}
              hasDropdown
            />
            <div className="absolute top-full left-0 mt-1 py-1 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[160px]">
              <button
                type="button"
                onClick={() => handleSaveAs('srt')}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"
              >
                {t('formats.srt')}
              </button>
              <button
                type="button"
                onClick={() => handleSaveAs('vtt')}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"
              >
                {t('formats.vtt')}
              </button>
              <button
                type="button"
                onClick={() => handleSaveAs('ass')}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors"
              >
                {t('formats.ass')}
              </button>
            </div>
          </div>
        </div>

        <Divider />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<Undo2 className="w-3.5 h-3.5" />}
            label={t('toolbar.undo')}
            onClick={subtitle.undo}
            disabled={!subtitle.canUndo}
            shortcut="Ctrl+Z"
          />
          <ToolbarButton
            icon={<Redo2 className="w-3.5 h-3.5" />}
            label={t('toolbar.redo')}
            onClick={subtitle.redo}
            disabled={!subtitle.canRedo}
            shortcut="Ctrl+Shift+Z"
          />
        </div>

        <Divider />

        {/* Insert/Delete */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<Plus className="w-3.5 h-3.5" />}
            label={t('toolbar.insertAfter')}
            onClick={handleInsertAfter}
          />
          <ToolbarButton
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={selectedCount > 0 ? t('toolbar.deleteSelected') : t('toolbar.delete')}
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0 && !subtitle.activeEntryId}
            destructive
          />
        </div>

        <Divider />

        {/* Edit Tools */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<Merge className="w-3.5 h-3.5" />}
            label={t('toolbar.merge')}
            onClick={handleMerge}
            disabled={selectedCount < 2}
          />
          <ToolbarButton
            icon={<Search className="w-3.5 h-3.5" />}
            label={t('toolbar.findReplace')}
            onClick={() => onShowFindReplace?.()}
            shortcut="Ctrl+F"
          />
          <ToolbarButton
            icon={<Timer className="w-3.5 h-3.5" />}
            label={t('toolbar.timing')}
            onClick={() => onShowTimingDialog?.()}
          />
          <ToolbarButton
            icon={<Wrench className="w-3.5 h-3.5" />}
            label={t('toolbar.fixErrors')}
            onClick={() => onShowFixErrors?.()}
          />
        </div>

        <Divider />

        {/* Download */}
        <ToolbarButton
          icon={<Globe className="w-3.5 h-3.5" />}
          label={t('toolbar.download')}
          onClick={onShowDownloadDialog}
        />

        <Divider />

        {/* AI Tools */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={<Mic className="w-3.5 h-3.5 text-purple-500" />}
            label={t('toolbar.whisper')}
            onClick={() => onShowWhisper?.()}
          />
          <ToolbarButton
            icon={<Languages className="w-3.5 h-3.5 text-purple-500" />}
            label={t('toolbar.translate')}
            onClick={() => onShowTranslate?.()}
          />
          <ToolbarButton
            icon={<Sparkles className="w-3.5 h-3.5 text-purple-500" />}
            label={t('toolbar.grammar')}
            onClick={() => onShowGrammarFix?.()}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {subtitle.isDirty && (
            <span className="text-amber-500 dark:text-amber-400">{t('editor.modified')}</span>
          )}
          {subtitle.fileName && (
            <span className="truncate max-w-[200px]" title={subtitle.fileName}>
              {subtitle.fileName}
            </span>
          )}
          <span className="tabular-nums">
            {t('editor.total', { count: subtitle.entries.length })}
          </span>
          {selectedCount > 0 && (
            <span className="text-primary tabular-nums">
              {t('editor.selected', { count: selectedCount })}
            </span>
          )}
          <span className="uppercase font-medium text-[10px] px-1.5 py-0.5 rounded bg-muted">
            {subtitle.format}
          </span>
        </div>
      </div>

      <AlertDialog
        open={showUnsavedDialog}
        onOpenChange={(open) => !open && handleCancelPendingAction()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unsavedDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('unsavedDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelPendingAction}>
              {t('unsavedDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDiscardAndContinue();
              }}
            >
              {t('unsavedDialog.discard')}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmSaveAndContinue();
              }}
            >
              {t('unsavedDialog.save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---- Sub-components ----

function Divider() {
  return <div className="w-px h-5 bg-border/50 mx-1.5" />;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  shortcut?: string;
  hasDropdown?: boolean;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled = false,
  destructive = false,
  shortcut,
  hasDropdown = false,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium',
        'transition-colors duration-150',
        'disabled:opacity-40 disabled:pointer-events-none',
        destructive
          ? 'hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
          : 'hover:bg-accent/70',
        'text-muted-foreground hover:text-foreground border border-transparent hover:border-border/60',
      )}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
      {hasDropdown && <ChevronDown className="w-3 h-3 opacity-50" />}
    </button>
  );
}

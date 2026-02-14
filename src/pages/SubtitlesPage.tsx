import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { CircleHelp } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { FindReplacePanel } from '@/components/subtitles/FindReplacePanel';
import { FixErrorsDialog } from '@/components/subtitles/FixErrorsDialog';
import { GrammarFixDialog } from '@/components/subtitles/GrammarFixDialog';
import { SplitMergeDialog } from '@/components/subtitles/SplitMergeDialog';
import { SubtitleBatchProjectDialog } from '@/components/subtitles/SubtitleBatchProjectDialog';
import { SubtitleDownloadDialog } from '@/components/subtitles/SubtitleDownloadDialog';
import { SubtitleEditor } from '@/components/subtitles/SubtitleEditor';
import { SubtitleStyleProfileDialog } from '@/components/subtitles/SubtitleStyleProfileDialog';
import { SubtitlesEmptyState } from '@/components/subtitles/SubtitlesEmptyState';
import { SubtitlesUsageGuide } from '@/components/subtitles/SubtitlesUsageGuide';
import { SubtitlesWorkspaceStatus } from '@/components/subtitles/SubtitlesWorkspaceStatus';
import { SubtitleToolbar } from '@/components/subtitles/SubtitleToolbar';
import { SubtitleVideoPreview } from '@/components/subtitles/SubtitleVideoPreview';
import { TimingDialog } from '@/components/subtitles/TimingDialog';
import { TranslateDialog } from '@/components/subtitles/TranslateDialog';
import { WhisperGenerateDialog } from '@/components/subtitles/WhisperGenerateDialog';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { detectFormatFromFilename, parseSubtitles } from '@/lib/subtitle-parser';

export function SubtitlesPage() {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showTimingDialog, setShowTimingDialog] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showFixErrors, setShowFixErrors] = useState(false);
  const [showSplitMerge, setShowSplitMerge] = useState(false);
  const [showBatchProject, setShowBatchProject] = useState(false);
  const [showStyleProfiles, setShowStyleProfiles] = useState(false);
  const [showWhisper, setShowWhisper] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showGrammarFix, setShowGrammarFix] = useState(false);
  const [showUsageGuide, setShowUsageGuide] = useState(false);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Subtitle Files',
            extensions: ['srt', 'vtt', 'ass', 'ssa'],
          },
        ],
      });

      if (!selected) return;

      const filePath = typeof selected === 'string' ? selected : selected;
      const content = await readTextFile(filePath);
      const format = detectFormatFromFilename(filePath);
      const result = parseSubtitles(content, format);

      subtitle.loadFromFile(result.entries, result.format, filePath, result.assHeader);
    } catch (err) {
      console.error('Failed to open subtitle file:', err);
    }
  }, [subtitle]);

  const handleCreateNew = useCallback(() => {
    subtitle.createNew();
  }, [subtitle]);

  const handleCloseFile = useCallback(() => {
    subtitle.closeFile();
  }, [subtitle]);

  const pageHeader = (
    <>
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
        <ThemePicker />
      </header>
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </>
  );

  if (!subtitle.isWorkspaceOpen) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {pageHeader}
        <SubtitlesEmptyState
          onOpenFile={handleOpenFile}
          onDownloadFromUrl={() => setShowDownloadDialog(true)}
          onCreateNew={handleCreateNew}
          onGenerateWithWhisper={() => setShowWhisper(true)}
        />
        <SubtitleDownloadDialog
          open={showDownloadDialog}
          onClose={() => setShowDownloadDialog(false)}
        />
        <WhisperGenerateDialog open={showWhisper} onClose={() => setShowWhisper(false)} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {pageHeader}

      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-5 pb-2 flex items-start justify-between gap-3">
        <SubtitlesWorkspaceStatus
          fileName={subtitle.fileName}
          isDirty={subtitle.isDirty}
          entryCount={subtitle.entries.length}
          selectedCount={subtitle.selectedIds.size}
          format={subtitle.format}
        />

        <button
          type="button"
          onClick={() => setShowUsageGuide((v) => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-dashed border-border/70 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors flex-shrink-0"
        >
          <CircleHelp className="w-3.5 h-3.5" />
          <span>{t('hints.title')}</span>
        </button>
      </div>

      {showUsageGuide && (
        <div className="px-4 sm:px-6 pb-2 flex-shrink-0">
          <SubtitlesUsageGuide compact />
        </div>
      )}

      <div className="px-4 sm:px-6 pb-2 flex-shrink-0">
        <SubtitleToolbar
          onOpenFile={handleOpenFile}
          onCreateNew={handleCreateNew}
          onCloseFile={handleCloseFile}
          onShowDownloadDialog={() => setShowDownloadDialog(true)}
          onShowBatchProject={() => setShowBatchProject(true)}
          onShowStyleProfiles={() => setShowStyleProfiles(true)}
          onShowTimingDialog={() => setShowTimingDialog(true)}
          onShowFindReplace={() => setShowFindReplace((v) => !v)}
          onShowFixErrors={() => setShowFixErrors(true)}
          onShowSplitMerge={() => setShowSplitMerge(true)}
          onShowWhisper={() => setShowWhisper(true)}
          onShowTranslate={() => setShowTranslate(true)}
          onShowGrammarFix={() => setShowGrammarFix(true)}
        />
      </div>

      {showFindReplace && (
        <div className="px-4 sm:px-6 pb-2 flex-shrink-0">
          <FindReplacePanel open={showFindReplace} onClose={() => setShowFindReplace(false)} />
        </div>
      )}

      <div className="flex-1 px-4 sm:px-6 pb-4 min-h-0">
        <div className="h-full min-h-0 rounded-2xl border border-border/50 bg-card/20 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <div className="flex-1 min-w-0 min-h-0">
              <SubtitleEditor />
            </div>
            <div className="lg:w-[380px] lg:max-w-[42%] min-h-[280px] lg:min-h-0 border-t lg:border-t-0 lg:border-l border-border/50">
              <SubtitleVideoPreview />
            </div>
          </div>
        </div>
      </div>

      <SubtitleDownloadDialog
        open={showDownloadDialog}
        onClose={() => setShowDownloadDialog(false)}
      />
      <TimingDialog open={showTimingDialog} onClose={() => setShowTimingDialog(false)} />
      <FixErrorsDialog open={showFixErrors} onClose={() => setShowFixErrors(false)} />
      <SplitMergeDialog open={showSplitMerge} onClose={() => setShowSplitMerge(false)} />
      <SubtitleBatchProjectDialog
        open={showBatchProject}
        onClose={() => setShowBatchProject(false)}
      />
      <SubtitleStyleProfileDialog
        open={showStyleProfiles}
        onClose={() => setShowStyleProfiles(false)}
      />
      <WhisperGenerateDialog open={showWhisper} onClose={() => setShowWhisper(false)} />
      <TranslateDialog open={showTranslate} onClose={() => setShowTranslate(false)} />
      <GrammarFixDialog open={showGrammarFix} onClose={() => setShowGrammarFix(false)} />
    </div>
  );
}

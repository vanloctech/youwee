export type HistoryItemPrimaryAction = 'open-folder' | 'redownload';
export type HistoryItemSummaryAction = 'generate-summary';
export type HistoryItemOverflowAction =
  | 'rename'
  | 'open-url'
  | 'copy-url'
  | 'manage-tags'
  | 'delete';

export interface HistoryItemActionLayoutInput {
  fileExists: boolean;
  isDataExport: boolean;
  aiEnabled: boolean;
}

export interface HistoryItemActionLayout {
  primary: HistoryItemPrimaryAction[];
  summary: HistoryItemSummaryAction | null;
  overflow: HistoryItemOverflowAction[];
}

export function getHistoryItemActionLayout({
  fileExists,
  isDataExport,
  aiEnabled,
}: HistoryItemActionLayoutInput): HistoryItemActionLayout {
  const primary: HistoryItemPrimaryAction[] = [];
  const overflow: HistoryItemOverflowAction[] = [];

  if (fileExists) {
    primary.push('open-folder');
    overflow.push('rename');
  } else if (!isDataExport) {
    primary.push('redownload');
  }

  const summary = !isDataExport && aiEnabled ? 'generate-summary' : null;

  if (!isDataExport) {
    overflow.push('open-url', 'copy-url');
  }

  overflow.push('manage-tags', 'delete');

  return { primary, summary, overflow };
}

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsDivider, SettingsRow, SettingsSection } from '../SettingsSection';

type ConflictPolicy = 'skip' | 'replace' | 'merge' | 'duplicate';

interface BackupPreviewRow {
  id: string;
  url: string;
  title: string;
  status: string;
  source: string | null;
  filepath: string;
  downloadedAt: number;
}

interface BackupPreview {
  valid: boolean;
  schemaVersion: number;
  count: number;
  errors: string[];
  rows: BackupPreviewRow[];
  additions: number;
  conflicts: number;
  skipped: number;
  secrets: boolean;
  hasSettings: boolean;
  exportedAt: string | null;
  appVersion: string | null;
}

interface BackupImportResult {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  policy: string;
  secrets: boolean;
  settings: unknown | null;
}

interface BackupExportResult {
  path: string;
  count: number;
  secrets: boolean;
  exportedAt: string;
}

const POLICY_OPTIONS: { value: ConflictPolicy; labelKey: string; descriptionKey: string }[] = [
  { value: 'skip', labelKey: 'backup.policySkip', descriptionKey: 'backup.policySkipDesc' },
  {
    value: 'replace',
    labelKey: 'backup.policyReplace',
    descriptionKey: 'backup.policyReplaceDesc',
  },
  { value: 'merge', labelKey: 'backup.policyMerge', descriptionKey: 'backup.policyMergeDesc' },
  {
    value: 'duplicate',
    labelKey: 'backup.policyDuplicate',
    descriptionKey: 'backup.policyDuplicateDesc',
  },
];

const STATUS_LABEL_KEYS: Record<string, string> = {
  completed: 'backup.statusCompleted',
  summary_only: 'backup.statusSummaryOnly',
  pending: 'backup.statusPending',
};

// Settings groups backed up from localStorage. Cookie values and tokens are
// never stored here; the Rust side redacts secret-looking keys unless the
// user explicitly opts in via the "include secrets" switch.
const SETTINGS_SOURCES: Array<[string, string]> = [
  ['download', 'youwee-settings'],
  ['cookie', 'youwee-cookie-settings'],
  ['proxy', 'youwee-proxy-settings'],
  ['universal', 'youwee-universal-settings'],
  ['gallerydl', 'youwee-gallerydl-settings'],
];

function collectSettingsBlob(): Record<string, unknown> {
  const blob: Record<string, unknown> = {};
  for (const [key, storageKey] of SETTINGS_SOURCES) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        blob[key] = JSON.parse(raw);
      }
    } catch {
      // Skip groups that are missing or unreadable.
    }
  }
  return blob;
}

function restoreSettingsBlob(blob: unknown): number {
  if (!blob || typeof blob !== 'object') return 0;
  const record = blob as Record<string, unknown>;
  let restored = 0;
  for (const [key, storageKey] of SETTINGS_SOURCES) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
      restored += 1;
    } catch {
      // Ignore individual write failures; keep going.
    }
  }
  return restored;
}

export function BackupSection({ highlightId }: { highlightId?: string | null }) {
  const { t } = useTranslation('settings');
  const toast = useToast();

  const [exportOpen, setExportOpen] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exportDir, setExportDir] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [policy, setPolicy] = useState<ConflictPolicy>('skip');
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [importing, setImporting] = useState(false);

  const pickExportFolder = async () => {
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        title: t('backup.chooseFolderTitle'),
      });
      if (typeof dir === 'string' && dir) {
        setExportDir(dir);
      }
    } catch (error) {
      toast.error({ title: t('backup.exportFailed'), message: String(error) });
    }
  };

  const handleExport = async () => {
    if (!exportDir) return;
    setExporting(true);
    try {
      const result = await invoke<BackupExportResult>('export_backup_with_settings', {
        includeSecrets,
        destDir: exportDir,
        settingsJson: JSON.stringify(collectSettingsBlob()),
      });
      toast.success({
        title: t('backup.exportSuccess'),
        message: t('backup.exportSuccessDesc', { count: result.count, path: result.path }),
      });
      setExportOpen(false);
    } catch (error) {
      toast.error({ title: t('backup.exportFailed'), message: String(error) });
    } finally {
      setExporting(false);
    }
  };

  const runPreview = async (path: string, nextPolicy: ConflictPolicy) => {
    try {
      const result = await invoke<BackupPreview>('preview_backup', {
        path,
        conflictPolicy: nextPolicy,
      });
      setPreview(result);
    } catch (error) {
      toast.error({ title: t('backup.importFailed'), message: String(error) });
    }
  };

  const handlePickBackup = async () => {
    try {
      const file = await open({
        multiple: false,
        title: t('backup.pickBackup'),
        filters: [{ name: t('backup.backupFileFilter'), extensions: ['json'] }],
      });
      if (typeof file !== 'string' || !file) return;
      setPreviewPath(file);
      setPolicy('skip');
      setRestoreSettings(false);
      setPreview(null);
      setImportOpen(true);
      void runPreview(file, 'skip');
    } catch (error) {
      toast.error({ title: t('backup.importFailed'), message: String(error) });
    }
  };

  const handlePolicyChange = (value: string) => {
    const next = value as ConflictPolicy;
    setPolicy(next);
    if (previewPath) {
      void runPreview(previewPath, next);
    }
  };

  const handleImport = async () => {
    if (!previewPath || !preview) return;
    setImporting(true);
    try {
      const result = await invoke<BackupImportResult>('import_backup', {
        path: previewPath,
        conflictPolicy: policy,
      });

      if (restoreSettings && result.settings) {
        const restored = restoreSettingsBlob(result.settings);
        if (restored > 0) {
          toast.success({
            title: t('backup.settingsRestored'),
            message: `${t('backup.settingsRestoredDesc', { count: restored })} ${t('backup.settingsRestoredNote')}`,
          });
        }
      }

      toast.success({
        title: t('backup.importSuccess'),
        message: t('backup.importSuccessDesc', {
          added: result.added,
          updated: result.updated,
          skipped: result.skipped,
        }),
      });

      setImportOpen(false);
      setPreview(null);
      setPreviewPath(null);
    } catch (error) {
      toast.error({
        title: t('backup.importFailed'),
        message: `${t('backup.importFailedDesc')} ${String(error)}`,
      });
    } finally {
      setImporting(false);
    }
  };

  const statusLabel = (status: string) => t(STATUS_LABEL_KEYS[status] ?? 'backup.statusPending');

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('backup.title')}
        description={t('backup.description')}
        icon={<Archive className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-cyan-500 to-blue-600 shadow-cyan-500/20"
      >
        {/* Export */}
        <SettingsCard>
          <SettingsRow
            id="backup-export"
            label={t('backup.exportSectionTitle')}
            description={t('backup.exportSectionDesc')}
            highlight={highlightId === 'backup-export'}
          >
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 bg-transparent"
              onClick={() => setExportOpen(true)}
            >
              <Download className="w-4 h-4" />
              {t('backup.exportButton')}
            </Button>
          </SettingsRow>

          <SettingsRow
            id="backup-import"
            label={t('backup.importSectionTitle')}
            description={t('backup.importSectionDesc')}
            highlight={highlightId === 'backup-import'}
          >
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 bg-transparent"
              onClick={handlePickBackup}
            >
              <Upload className="w-4 h-4" />
              {t('backup.importButton')}
            </Button>
          </SettingsRow>

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 mt-1">
            <ShieldAlert className="mt-0.5 w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('backup.secretsHint')}
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('backup.exportDialogTitle')}</DialogTitle>
            <DialogDescription>{t('backup.exportDialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('backup.chooseFolder')}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {exportDir ?? t('backup.noFolder')}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 bg-transparent"
                onClick={pickExportFolder}
              >
                <FolderOpen className="w-4 h-4" />
                {t('backup.chooseFolder')}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('backup.includeSecrets')}</p>
                <p className="text-xs text-muted-foreground">{t('backup.includeSecretsDesc')}</p>
              </div>
              <Switch checked={includeSecrets} onCheckedChange={setIncludeSecrets} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={exporting}
              onClick={() => setExportOpen(false)}
            >
              {t('backup.cancel')}
            </Button>
            <Button type="button" disabled={!exportDir || exporting} onClick={handleExport}>
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t('backup.exporting')}
                </>
              ) : (
                t('backup.exportButton')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import preview dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('backup.previewTitle')}</DialogTitle>
            <DialogDescription>{t('backup.previewDesc')}</DialogDescription>
          </DialogHeader>

          {preview && !preview.valid && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="w-4 h-4" />
                {t('backup.previewInvalid')}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('backup.previewInvalidDesc')}</p>
              {preview.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {preview.errors.map((error) => (
                    <li key={error} className="text-xs text-destructive/90">
                      • {error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {preview && preview.valid && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-md bg-muted/50 font-mono text-[11px]">
                  {t('backup.rowsCount', { count: preview.count })}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-md font-mono text-[11px]',
                    preview.additions > 0 &&
                      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {t('backup.additions')}: {preview.additions}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-md font-mono text-[11px]',
                    preview.conflicts > 0 && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  )}
                >
                  {t('backup.conflicts')}: {preview.conflicts}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-md font-mono text-[11px]',
                    preview.skipped > 0 && 'bg-slate-500/10 text-slate-500',
                  )}
                >
                  {t('backup.skipped')}: {preview.skipped}
                </Badge>
              </div>

              {preview.secrets && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <ShieldAlert className="mt-0.5 w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t('backup.containsSecrets')}
                  </p>
                </div>
              )}

              {/* Policy */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t('backup.policy')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      POLICY_OPTIONS.find((option) => option.value === policy)?.descriptionKey ??
                        'backup.policySkipDesc',
                    )}
                  </p>
                </div>
                <Select value={policy} onValueChange={handlePolicyChange}>
                  <SelectTrigger className="h-9 w-full bg-background sm:w-[210px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rows preview */}
              {preview.rows.length > 0 ? (
                <ScrollArea className="max-h-56 rounded-lg border border-border/60 bg-background/40">
                  <table className="w-full border-separate border-spacing-0 text-start text-sm">
                    <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                      <tr>
                        <th className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                          {t('backup.columnTitle')}
                        </th>
                        <th className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                          {t('backup.columnUrl')}
                        </th>
                        <th className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                          {t('backup.columnStatus')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/30">
                          <td className="max-w-[220px] truncate border-b border-border/30 px-3 py-1.5 text-xs">
                            {row.title}
                          </td>
                          <td className="max-w-[260px] truncate border-b border-border/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                            {row.url}
                          </td>
                          <td className="border-b border-border/30 px-3 py-1.5 text-xs">
                            {statusLabel(row.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground">{t('backup.noPreview')}</p>
              )}

              {/* Restore settings */}
              {preview.hasSettings && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t('backup.restoreSettings')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('backup.restoreSettingsDesc')}
                    </p>
                  </div>
                  <Switch checked={restoreSettings} onCheckedChange={setRestoreSettings} />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={importing}
              onClick={() => setImportOpen(false)}
            >
              {t('backup.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!preview || !preview.valid || importing}
              onClick={handleImport}
              className="gap-1.5"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('backup.importing')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {t('backup.confirmImport')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

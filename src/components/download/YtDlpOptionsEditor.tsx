import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  Copy,
  Loader2,
  Plus,
  SlidersHorizontal,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { buildDownloadVideoInvokeArgs, buildSponsorBlockArgs } from '@/contexts/DownloadContext';
import { useDownload } from '@/contexts/download-context';
import type {
  DownloadItem,
  ItemDownloadSettings,
  ItemUniversalSettings,
  YtdlpAdvancedOption,
  YtdlpAdvancedOptionId,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  getYtdlpAdvancedOptionDefinition,
  sanitizeYtdlpAdvancedOptions,
  YTDLP_ADVANCED_OPTION_DEFINITIONS,
  type YtdlpAdvancedOptionDefinition,
} from '@/lib/ytdlp-advanced-options';
import {
  deleteYtdlpPreset,
  loadYtdlpPresets,
  saveYtdlpPreset,
  YTDLP_PRESET_LIMITS,
  type YtdlpPreset,
  type YtdlpPresetSettings,
} from '@/lib/ytdlp-presets';

/**
 * P0-2: validated key/value editor for per-item yt-dlp advanced options,
 * plus an expert raw-arguments textarea (behind a warning gate) and a
 * command diagnostics preview. Mirrors the global settings editor in
 * DownloadSection and the round-4 GallerySettingsPanel popover pattern.
 */

export type YtDlpOptionsPatch = Partial<
  Pick<ItemDownloadSettings, 'ytdlpAdvancedOptionsEnabled' | 'ytdlpAdvancedOptions' | 'rawArgs'>
>;

interface PreviewCommandResult {
  args: string[];
  display: string;
}

interface YtDlpOptionsEditorProps {
  item: DownloadItem;
  settings?: ItemDownloadSettings | ItemUniversalSettings;
  disabled?: boolean;
  onChange: (patch: YtDlpOptionsPatch) => void;
}

function formatYtdlpOptionName(definition: YtdlpAdvancedOptionDefinition): string {
  if (definition.id === 'youtubePlayerClient') {
    return '--extractor-args youtube:player-client';
  }
  return definition.ytDlpFlag;
}

export function YtDlpOptionsEditor({
  item,
  settings,
  disabled,
  onChange,
}: YtDlpOptionsEditorProps) {
  const { t } = useTranslation(['download', 'settings']);
  const toast = useToast();
  // Global settings + network config are needed to reproduce the exact command
  // in the diagnostics preview (quality/format/cookies/proxy/... live there).
  const { settings: globalSettings, cookieSettings, proxySettings } = useDownload();

  const enabled = settings?.ytdlpAdvancedOptionsEnabled === true;
  const options = useMemo(
    () => sanitizeYtdlpAdvancedOptions(settings?.ytdlpAdvancedOptions),
    [settings?.ytdlpAdvancedOptions],
  );
  const rawArgs = settings?.rawArgs ?? '';

  // Raw-args warning gate (one-time acknowledgement per editor session).
  const [rawArgsAcknowledged, setRawArgsAcknowledged] = useState(false);
  const [showRawArgsWarning, setShowRawArgsWarning] = useState(false);

  // Command preview state.
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState(false);

  // Preset state.
  const [presets, setPresets] = useState<YtdlpPreset[]>(() => loadYtdlpPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetName, setPresetName] = useState('');

  const selectedOptionIds = useMemo(() => new Set(options.map((option) => option.id)), [options]);
  const availableDefinitions = useMemo(
    () =>
      YTDLP_ADVANCED_OPTION_DEFINITIONS.filter(
        (definition) => definition.repeatable || !selectedOptionIds.has(definition.id),
      ),
    [selectedOptionIds],
  );

  const updateOption = useCallback(
    (index: number, updates: Partial<YtdlpAdvancedOption>) => {
      onChange({
        ytdlpAdvancedOptions: options.map((option, optionIndex) =>
          optionIndex === index ? { ...option, ...updates } : option,
        ),
      });
    },
    [onChange, options],
  );

  const removeOption = useCallback(
    (index: number) => {
      onChange({ ytdlpAdvancedOptions: options.filter((_, optionIndex) => optionIndex !== index) });
    },
    [onChange, options],
  );

  const addOption = useCallback(
    (id: YtdlpAdvancedOptionId) => {
      const definition = getYtdlpAdvancedOptionDefinition(id);
      if (!definition) return;
      const nextOption: YtdlpAdvancedOption = { id };
      if (definition.valueType === 'select') {
        nextOption.value = definition.options?.[0] || '';
      }
      onChange({ ytdlpAdvancedOptions: [...options, nextOption] });
    },
    [onChange, options],
  );

  const renderOptionValue = (
    option: YtdlpAdvancedOption,
    definition: YtdlpAdvancedOptionDefinition,
    index: number,
  ) => {
    if (definition.valueType === 'boolean') return null;

    if (definition.valueType === 'select') {
      return (
        <Select
          value={option.value || definition.options?.[0] || ''}
          onValueChange={(value) => updateOption(index, { value })}
        >
          <SelectTrigger className="h-7 w-full bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {definition.options?.map((value) => (
              <SelectItem key={value} value={value} className="text-xs">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (definition.valueType === 'header') {
      return (
        <div className="grid w-full gap-1.5">
          <Input
            value={option.value || ''}
            onChange={(event) => updateOption(index, { value: event.currentTarget.value })}
            placeholder={t('download.ytdlpAdvanced.placeholder.headerName')}
            className="h-7 bg-background text-xs"
          />
          <Input
            value={option.secondaryValue || ''}
            onChange={(event) => updateOption(index, { secondaryValue: event.currentTarget.value })}
            placeholder={t('download.ytdlpAdvanced.placeholder.headerValue')}
            className="h-7 bg-background text-xs"
          />
        </div>
      );
    }

    return (
      <Input
        value={option.value || ''}
        type={definition.valueType === 'number' ? 'number' : 'text'}
        onChange={(event) => updateOption(index, { value: event.currentTarget.value })}
        placeholder={
          definition.placeholderKey ? t(`settings:${definition.placeholderKey}`) : undefined
        }
        className="h-7 w-full bg-background text-xs"
      />
    );
  };

  const handleRawArgsOpen = useCallback(() => {
    if (rawArgsAcknowledged) return;
    setShowRawArgsWarning(true);
  }, [rawArgsAcknowledged]);

  const confirmRawArgs = useCallback(() => {
    setRawArgsAcknowledged(true);
    setShowRawArgsWarning(false);
  }, []);

  const handlePreview = useCallback(async () => {
    if (isPreviewing) return;
    setIsPreviewing(true);
    setPreview(null);
    try {
      const itemSettings = settings as ItemDownloadSettings | undefined;
      const payload = buildDownloadVideoInvokeArgs({
        item,
        itemSettings,
        settings: globalSettings,
        cookieSettings,
        proxySettings,
        sponsorBlockArgs: buildSponsorBlockArgs(globalSettings),
        logStderr: true,
        override: {
          ytdlpAdvancedOptionsEnabled: enabled,
          ytdlpAdvancedOptions: options,
          rawArgs,
        },
      });
      const result = await invoke<PreviewCommandResult>('preview_download_command', {
        request: payload,
      });
      // Redaction: only the server-redacted display string is ever rendered.
      setPreview(result.display);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found|unknown command/i.test(message)) {
        toast.warning({ title: t('ytdlpEditor.previewUnavailable') });
      } else {
        toast.error({ title: t('ytdlpEditor.previewFailed') });
      }
    } finally {
      setIsPreviewing(false);
    }
  }, [
    enabled,
    isPreviewing,
    item,
    options,
    rawArgs,
    settings,
    globalSettings,
    cookieSettings,
    proxySettings,
    t,
    toast,
  ]);

  const handleCopyPreview = useCallback(async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
      setPreviewCopied(true);
      window.setTimeout(() => setPreviewCopied(false), 2000);
    } catch {
      // ignore clipboard failures
    }
  }, [preview]);

  const handleSavePreset = useCallback(() => {
    const saved = saveYtdlpPreset(presetName, {
      ytdlpAdvancedOptionsEnabled: enabled,
      ytdlpAdvancedOptions: options,
      rawArgs,
    } as YtdlpPresetSettings);
    if (!saved) {
      toast.warning({ title: t('ytdlpEditor.presetMax') });
      return;
    }
    setPresets(loadYtdlpPresets());
    setSelectedPresetId(saved.id);
    setPresetName('');
    toast.success({ title: t('ytdlpEditor.presetSaved') });
  }, [enabled, options, presetName, rawArgs, t, toast]);

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      setSelectedPresetId(presetId);
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) return;
      onChange({
        ytdlpAdvancedOptionsEnabled: preset.settings.ytdlpAdvancedOptionsEnabled,
        ytdlpAdvancedOptions: preset.settings.ytdlpAdvancedOptions,
        rawArgs: preset.settings.rawArgs,
      });
      toast.success({ title: t('ytdlpEditor.presetApplied') });
    },
    [onChange, presets, t, toast],
  );

  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) return;
    deleteYtdlpPreset(selectedPresetId);
    setPresets(loadYtdlpPresets());
    setSelectedPresetId('');
    toast.success({ title: t('ytdlpEditor.presetDeleted') });
  }, [selectedPresetId, t, toast]);

  const hasRawArgs = rawArgs.trim().length > 0;

  return (
    <div className="space-y-3">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <Label className="text-xs text-foreground">{t('ytdlpEditor.enableToggle')}</Label>
          <p className="text-[10px] leading-tight text-muted-foreground/75">
            {t('ytdlpEditor.description')}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => onChange({ ytdlpAdvancedOptionsEnabled: checked })}
          disabled={disabled}
        />
      </div>

      {enabled && (
        <>
          {/* Add-option dropdown */}
          <div className="flex items-center gap-2">
            <Select
              key={options.length}
              onValueChange={(value) => addOption(value as YtdlpAdvancedOptionId)}
            >
              <SelectTrigger className="h-8 w-full bg-background text-xs" disabled={disabled}>
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  <SelectValue placeholder={t('ytdlpEditor.addOption')} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableDefinitions.map((definition) => (
                  <SelectItem key={definition.id} value={definition.id} className="text-xs">
                    {formatYtdlpOptionName(definition)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Option rows */}
          {options.length > 0 && (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
              {options.map((option, index) => {
                const definition = getYtdlpAdvancedOptionDefinition(option.id);
                if (!definition) return null;
                return (
                  <div
                    key={`${option.id}-${index}`}
                    className="rounded-md border border-dashed border-border/70 bg-muted/20 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[11px] font-semibold text-foreground">
                            {formatYtdlpOptionName(definition)}
                          </p>
                          {definition.securityLevel === 'advanced' && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                              {t('download.ytdlpAdvanced.advancedBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] leading-tight text-muted-foreground/75">
                          {t(`settings:${definition.descriptionKey}`)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        disabled={disabled}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        title={t('queue.remove')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2">{renderOptionValue(option, definition, index)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Expert raw arguments */}
          <div
            className={cn(
              'space-y-1.5 rounded-md border p-2.5',
              hasRawArgs
                ? 'border-red-500/50 bg-red-500/5'
                : 'border-dashed border-border/70 bg-muted/10',
            )}
          >
            <button
              type="button"
              onClick={handleRawArgsOpen}
              className="flex w-full items-center justify-between gap-2 text-start"
              disabled={disabled}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <Terminal className="h-3.5 w-3.5" />
                {t('ytdlpEditor.rawArgsTitle')}
                {hasRawArgs && (
                  <span className="rounded bg-red-500/15 px-1.5 py-0 text-[9px] font-medium text-red-600 dark:text-red-400">
                    {t('ytdlpEditor.rawArgsActive')}
                  </span>
                )}
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </button>
            {rawArgsAcknowledged && (
              <>
                <Textarea
                  value={rawArgs}
                  onChange={(event) => onChange({ rawArgs: event.currentTarget.value })}
                  placeholder={t('ytdlpEditor.rawArgsHint')}
                  disabled={disabled}
                  rows={3}
                  className={cn(
                    'h-auto min-h-[3.5rem] font-mono text-[11px]',
                    hasRawArgs && 'border-red-500/50 focus:ring-red-500/40 focus:border-red-500/60',
                  )}
                />
                <p className="text-[10px] leading-tight text-muted-foreground/70">
                  {t('ytdlpEditor.rawArgsHint')}
                </p>
              </>
            )}
          </div>

          {/* Command preview */}
          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handlePreview()}
              disabled={disabled || isPreviewing}
              className="h-7 w-full gap-1.5 text-xs"
            >
              {isPreviewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SlidersHorizontal className="h-3.5 w-3.5" />
              )}
              {t('ytdlpEditor.preview')}
            </Button>
            {preview !== null && (
              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t('ytdlpEditor.previewTitle')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyPreview()}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={t('ytdlpEditor.copy')}
                  >
                    {previewCopied ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {previewCopied ? t('ytdlpEditor.copied') : t('ytdlpEditor.copy')}
                  </button>
                </div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[10px] leading-relaxed text-foreground/90">
                  {preview}
                </pre>
              </div>
            )}
          </div>

          {/* Presets */}
          <div className="space-y-1.5 border-t border-border/50 pt-2.5">
            <Label className="text-[11px] text-muted-foreground">{t('ytdlpEditor.presets')}</Label>
            <div className="flex items-center gap-1.5">
              <Select
                value={selectedPresetId}
                onValueChange={handleApplyPreset}
                disabled={disabled}
              >
                <SelectTrigger className="h-7 flex-1 bg-background text-xs">
                  <SelectValue placeholder={t('ytdlpEditor.presetPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {presets.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {t('ytdlpEditor.presetEmpty')}
                    </div>
                  )}
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-xs">
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPresetId && (
                <button
                  type="button"
                  onClick={handleDeletePreset}
                  disabled={disabled}
                  className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  title={t('queue.remove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={presetName}
                onChange={(event) => setPresetName(event.currentTarget.value)}
                placeholder={t('ytdlpEditor.presetSavePlaceholder')}
                disabled={disabled}
                className="h-7 flex-1 bg-background text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSavePreset}
                disabled={disabled || presets.length >= YTDLP_PRESET_LIMITS.max}
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                title={t('ytdlpEditor.presetSave')}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Raw-args warning gate */}
      <AlertDialog open={showRawArgsWarning} onOpenChange={setShowRawArgsWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ytdlpEditor.rawArgsWarningTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('ytdlpEditor.rawArgsWarningBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ytdlpEditor.rawArgsCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRawArgs}>
              {t('ytdlpEditor.rawArgsConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

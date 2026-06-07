import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Film,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Sun,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useHistory } from '@/contexts/HistoryContext';
import { useProcessing } from '@/contexts/ProcessingContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeName } from '@/lib/themes';
import { themes } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsDivider, SettingsRow, SettingsSection } from '../SettingsSection';

const isMacOS = navigator.platform.includes('Mac');
const LANGUAGE_REQUEST_DISCUSSION_URL = 'https://github.com/vanloctech/youwee/discussions/18';
const CLI_GUIDE_URL = 'https://github.com/vanloctech/youwee/blob/develop/docs/CLI.md';

interface CliShortcutStatus {
  platform: 'macos' | 'windows' | 'linux' | 'unknown';
  installed: boolean;
  target_path: string | null;
  exe_path: string | null;
  can_auto_install: boolean;
  note: string | null;
  note_key: 'path_not_in_path' | 'linux_system_installed' | 'unsupported' | null;
  note_path: string | null;
}

// Gradient backgrounds for theme preview
const themeGradients: Record<ThemeName, string> = {
  midnight: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500',
  aurora: 'bg-gradient-to-br from-emerald-400 via-cyan-500 to-blue-500',
  sunset: 'bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500',
  ocean: 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500',
  forest: 'bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500',
  candy: 'bg-gradient-to-br from-pink-500 via-rose-500 to-red-500',
};

interface GeneralSectionProps {
  highlightId?: string | null;
}

export function GeneralSection({ highlightId }: GeneralSectionProps) {
  const { t: tCommon, i18n } = useTranslation('common');
  const { t } = useTranslation('settings');
  const toast = useToast();
  const { theme, setTheme, mode, setMode } = useTheme();
  const { maxEntries, setMaxEntries, totalCount } = useHistory();
  const { previewSizeThreshold, setPreviewSizeThreshold } = useProcessing();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState('');
  const [cliStatus, setCliStatus] = useState<CliShortcutStatus | null>(null);
  const [cliLoading, setCliLoading] = useState(true);
  const [cliInstalling, setCliInstalling] = useState(false);

  const [hideDockOnClose, setHideDockOnClose] = useState(() => {
    return localStorage.getItem('youwee_hide_dock_on_close') === 'true';
  });

  const handleToggleHideDock = useCallback((checked: boolean) => {
    setHideDockOnClose(checked);
    localStorage.setItem('youwee_hide_dock_on_close', String(checked));
    invoke('set_hide_dock_on_close', { hide: checked }).catch(() => {});
  }, []);

  const refreshCliStatus = useCallback(async () => {
    setCliLoading(true);
    try {
      const status = await invoke<CliShortcutStatus>('get_cli_shortcut_status');
      setCliStatus(status);
    } catch (error) {
      setCliStatus(null);
      console.error('Failed to inspect CLI shortcut status:', error);
    } finally {
      setCliLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCliStatus();
  }, [refreshCliStatus]);

  const handleInstallCliShortcut = useCallback(async () => {
    setCliInstalling(true);
    try {
      const path = await invoke<string>('install_cli_shortcut');
      setCliStatus((current) =>
        current
          ? {
              ...current,
              installed: true,
              target_path: path,
            }
          : current,
      );
      toast.success({
        title: t('extension.cliInstallSuccess'),
        message: t('extension.cliInstallSuccessDesc', { path }),
      });
      void refreshCliStatus();
    } catch (error) {
      toast.error({
        title: t('extension.cliInstallError'),
        message: String(error),
      });
    } finally {
      setCliInstalling(false);
    }
  }, [refreshCliStatus, t, toast]);

  const cliStatusNote = useMemo(() => {
    if (!cliStatus) return null;
    if (cliStatus.note_key === 'path_not_in_path') {
      return t('extension.cliNotePathNotInPath', { path: cliStatus.note_path });
    }
    if (cliStatus.note_key === 'linux_system_installed') {
      return t('extension.cliNoteLinuxSystemInstalled', { path: cliStatus.note_path });
    }
    if (cliStatus.note_key === 'unsupported') {
      return t('extension.cliNoteUnsupported');
    }
    return cliStatus.note;
  }, [cliStatus, t]);

  const supportedLanguages = useMemo(() => {
    const resources = i18n.options.resources ?? {};
    return Object.keys(resources).map((code) => ({
      code,
      name: tCommon(`language.${code}`, { defaultValue: code }),
    }));
  }, [i18n.options.resources, tCommon]);

  const currentLanguageCode = useMemo(() => {
    const current = i18n.resolvedLanguage || i18n.language || 'en';
    return (
      supportedLanguages.find((lang) => current.toLowerCase().startsWith(lang.code.toLowerCase()))
        ?.code || 'en'
    );
  }, [i18n.language, i18n.resolvedLanguage, supportedLanguages]);

  const filteredLanguages = useMemo(() => {
    const keyword = languageQuery.trim().toLowerCase();
    if (!keyword) return supportedLanguages;
    return supportedLanguages.filter((lang) => {
      return lang.code.toLowerCase().includes(keyword) || lang.name.toLowerCase().includes(keyword);
    });
  }, [languageQuery, supportedLanguages]);

  const handleLanguageChange = (langCode: string) => {
    void i18n.changeLanguage(langCode);
    // Update system tray menu language
    invoke('rebuild_tray_menu_cmd', { lang: langCode }).catch(() => {});
    setLanguageOpen(false);
    setLanguageQuery('');
  };

  return (
    <div className="space-y-8">
      {/* Appearance */}
      <SettingsSection
        title={t('general.appearance')}
        description={t('general.appearanceDesc')}
        icon={<Palette className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/20"
      >
        <SettingsCard>
          {/* Mode Toggle */}
          <SettingsRow
            id="mode"
            label={t('general.colorMode')}
            description={t('general.colorModeDesc')}
            highlight={highlightId === 'mode'}
          >
            <div className="flex w-full flex-wrap items-center gap-1 rounded-xl bg-muted/50 p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setMode('light')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  mode === 'light'
                    ? 'bg-background text-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('general.light')}
              </button>
              <button
                type="button"
                onClick={() => setMode('dark')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  mode === 'dark'
                    ? 'bg-background text-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('general.dark')}
              </button>
            </div>
          </SettingsRow>

          {/* Language */}
          <SettingsRow
            id="language"
            label={tCommon('language.label')}
            description={tCommon('language.select')}
            highlight={highlightId === 'language'}
          >
            <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'h-9 w-full sm:w-[260px]',
                    'inline-flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm',
                    'text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span className="truncate">
                    {tCommon(`language.${currentLanguageCode}`, {
                      defaultValue: currentLanguageCode,
                    })}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-2" align="start">
                <div className="space-y-2">
                  <Input
                    value={languageQuery}
                    onChange={(e) => setLanguageQuery(e.target.value)}
                    placeholder={t('search.placeholder')}
                    className="h-9 bg-background"
                  />
                  <div className="max-h-56 overflow-y-auto pr-1">
                    {filteredLanguages.length > 0 ? (
                      filteredLanguages.map((lang) => {
                        const selected = lang.code === currentLanguageCode;
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => handleLanguageChange(lang.code)}
                            className={cn(
                              'w-full rounded-md px-2 py-2 text-left text-sm transition-colors',
                              'flex items-center justify-between gap-2',
                              selected
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                            )}
                          >
                            <span className="truncate">{lang.name}</span>
                            {selected && <Check className="h-4 w-4" />}
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-2 py-2 text-sm text-muted-foreground">
                        {t('search.noResults')}
                      </p>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </SettingsRow>

          <SettingsRow
            id="language-request"
            label={t('general.languageRequest')}
            description={t('general.languageRequestDesc')}
            highlight={highlightId === 'language-request'}
          >
            <a
              href={LANGUAGE_REQUEST_DISCUSSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'h-9 px-3 rounded-md border border-dashed border-border/70',
                'inline-flex items-center gap-1.5 text-sm font-medium',
                'text-muted-foreground hover:text-foreground',
                'hover:border-primary/50 hover:bg-primary/5 transition-colors',
              )}
            >
              <span>{t('general.languageRequestButton')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </SettingsRow>

          {/* Theme Colors */}
          <div
            id="theme"
            className={cn(
              'py-3 rounded-lg px-2 -mx-2 transition-all duration-500',
              highlightId === 'theme' && 'bg-primary/10 ring-1 ring-primary/30',
            )}
          >
            <p className="text-sm font-medium mb-3">{t('general.colorTheme')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {themes.map((themeItem) => (
                <button
                  type="button"
                  key={themeItem.name}
                  onClick={() => setTheme(themeItem.name)}
                  className={cn(
                    'group flex items-center gap-3 p-3 rounded-xl transition-all',
                    'border-2',
                    theme === themeItem.name
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/30 hover:bg-muted/50',
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg shadow-md flex items-center justify-center transition-transform group-hover:scale-110',
                      themeGradients[themeItem.name],
                    )}
                  >
                    {theme === themeItem.name && (
                      <Check className="w-4 h-4 text-white drop-shadow" />
                    )}
                  </div>
                  <span className="text-sm font-medium">{themeItem.label}</span>
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Storage */}
      <SettingsSection
        title={t('general.storage')}
        description={t('general.storageDesc')}
        icon={<Database className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-cyan-500 to-teal-600 shadow-cyan-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="max-history"
            label={t('general.maxHistory')}
            description={t('general.currentlyStoring', { count: totalCount })}
            highlight={highlightId === 'max-history'}
          >
            <Select
              value={String(maxEntries)}
              onValueChange={(v) => setMaxEntries(Number.parseInt(v, 10))}
            >
              <SelectTrigger className="h-9 w-full bg-background sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="2000">2,000</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsDivider />

      {/* Processing */}
      <SettingsSection
        title={t('general.processing')}
        description={t('general.processingDesc')}
        icon={<Film className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20"
      >
        <SettingsCard>
          <SettingsRow
            id="preview-threshold"
            label={t('general.previewThreshold')}
            description={t('general.previewThresholdDesc')}
            highlight={highlightId === 'preview-threshold'}
          >
            <Select
              value={String(previewSizeThreshold)}
              onValueChange={(v) => setPreviewSizeThreshold(Number.parseInt(v, 10))}
            >
              <SelectTrigger className="h-9 w-full bg-background sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('general.previewAlways')}</SelectItem>
                <SelectItem value="100">100 MB</SelectItem>
                <SelectItem value="200">200 MB</SelectItem>
                <SelectItem value="300">300 MB</SelectItem>
                <SelectItem value="500">500 MB</SelectItem>
                <SelectItem value="1000">1 GB</SelectItem>
                <SelectItem value="2000">2 GB</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {/* System (macOS only) */}
      {isMacOS && (
        <>
          <SettingsDivider />
          <SettingsSection
            title={t('system.title')}
            description={t('system.titleDesc')}
            icon={<Monitor className="w-5 h-5 text-white" />}
            iconClassName="bg-gradient-to-br from-slate-500 to-gray-600 shadow-slate-500/20"
          >
            <SettingsCard>
              <SettingsRow
                id="hide-dock"
                label={t('system.hideDockOnClose')}
                description={t('system.hideDockOnCloseDesc')}
                highlight={highlightId === 'hide-dock'}
              >
                <Switch checked={hideDockOnClose} onCheckedChange={handleToggleHideDock} />
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>
        </>
      )}

      <SettingsDivider />

      {/* Command Line */}
      <SettingsSection
        title={t('extension.cliTitle')}
        description={t('extension.cliDesc')}
        icon={<Terminal className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-emerald-500/20"
      >
        <SettingsCard highlight={highlightId === 'cli-shortcut'}>
          <SettingsRow
            id="cli-shortcut"
            label={t('extension.cliInstall')}
            description={t('extension.cliInstallDesc')}
            highlight={highlightId === 'cli-shortcut'}
            controlClassName="md:min-w-[360px]"
          >
            <div className="flex w-full flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <div
                  className={cn(
                    'inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium',
                    cliLoading
                      ? 'bg-muted text-muted-foreground'
                      : cliStatus?.installed
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  )}
                >
                  {cliLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : cliStatus?.installed ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Terminal className="h-4 w-4" />
                  )}
                  <span className="truncate">
                    {cliLoading
                      ? t('extension.cliChecking')
                      : cliStatus?.installed
                        ? t('extension.cliInstalled')
                        : t('extension.cliNotInstalled')}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleInstallCliShortcut}
                  disabled={cliLoading || cliInstalling || cliStatus?.can_auto_install === false}
                  className={cn(
                    'h-9 rounded-md border border-dashed border-border/70 px-3',
                    'text-sm font-medium text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                  )}
                >
                  {cliInstalling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Terminal className="h-4 w-4" />
                  )}
                  {cliInstalling
                    ? t('extension.cliInstalling')
                    : cliStatus?.installed
                      ? t('extension.cliReinstall')
                      : t('extension.cliInstallButton')}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-9 rounded-md border border-dashed border-border/70 px-3',
                    'text-sm font-medium text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-foreground',
                  )}
                  asChild
                >
                  <a href={CLI_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t('extension.cliOpenGuide')}
                  </a>
                </Button>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                <code className="block truncate font-mono text-xs text-muted-foreground">
                  youwee &lt;url&gt; --quality 720 --skip-live
                </code>
              </div>

              {cliStatus && (cliStatus.target_path || cliStatusNote) && (
                <div className="space-y-2 text-xs text-muted-foreground">
                  {cliStatus.target_path && (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-left sm:flex-row sm:items-center">
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">
                        {t('extension.cliInstalledAtLabel')}
                      </span>
                      <code className="min-w-0 flex-1 truncate rounded bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground">
                        {cliStatus.target_path}
                      </code>
                    </div>
                  )}
                  {cliStatusNote && <p className="md:text-right">{cliStatusNote}</p>}
                </div>
              )}
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}

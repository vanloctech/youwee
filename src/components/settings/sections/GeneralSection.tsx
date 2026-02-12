import { invoke } from '@tauri-apps/api/core';
import { Check, Database, Moon, Palette, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHistory } from '@/contexts/HistoryContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeName } from '@/lib/themes';
import { themes } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { SettingsDivider, SettingsRow, SettingsSection } from '../SettingsSection';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'zh-CN', name: '简体中文' },
];

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
  const { theme, setTheme, mode, setMode } = useTheme();
  const { maxEntries, setMaxEntries, totalCount } = useHistory();

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    // Update system tray menu language
    invoke('rebuild_tray_menu_cmd', { lang: langCode }).catch(() => {});
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
        {/* Mode Toggle */}
        <SettingsRow
          id="mode"
          label={t('general.colorMode')}
          description={t('general.colorModeDesc')}
          highlight={highlightId === 'mode'}
        >
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
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
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  i18n.language?.startsWith(lang.code)
                    ? 'bg-background text-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {lang.name}
              </button>
            ))}
          </div>
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
          <div className="grid grid-cols-3 gap-2">
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
                  {theme === themeItem.name && <Check className="w-4 h-4 text-white drop-shadow" />}
                </div>
                <span className="text-sm font-medium">{themeItem.label}</span>
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsDivider />

      {/* Storage */}
      <SettingsSection
        title={t('general.storage')}
        description={t('general.storageDesc')}
        icon={<Database className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-cyan-500 to-teal-600 shadow-cyan-500/20"
      >
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
            <SelectTrigger className="w-[120px] h-9">
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
      </SettingsSection>
    </div>
  );
}

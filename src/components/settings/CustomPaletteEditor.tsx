import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import {
  CUSTOM_THEME_KEY,
  getCustomPalette,
  hexToHsl,
  hslToHex,
  saveCustomPalette,
} from '@/lib/themes';

export function CustomPaletteEditor() {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();
  const customPalette = getCustomPalette();

  const primaryHex = customPalette ? hslToHex(customPalette.primary) : '#2563eb';
  const accentHex = customPalette ? hslToHex(customPalette.accent) : '#ff6d00';

  const applyCustom = (primary: string, accent: string) => {
    saveCustomPalette({ primary: hexToHsl(primary), accent: hexToHsl(accent) });
    setTheme('custom');
  };

  const resetCustom = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CUSTOM_THEME_KEY);
    }
    if (theme === 'custom') {
      setTheme('midnight');
    }
  };

  const isCustomActive = theme === 'custom';

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{t('general.customPalette')}</p>
      <div className="flex items-center gap-2">
        <label className="flex flex-col items-center gap-1 text-xs">
          <input
            type="color"
            value={primaryHex}
            onChange={(e) => applyCustom(e.target.value, accentHex)}
            className="h-8 w-12 cursor-pointer rounded border"
            aria-label={t('general.customPalettePrimary')}
          />
          {t('general.customPalettePrimary')}
        </label>
        <label className="flex flex-col items-center gap-1 text-xs">
          <input
            type="color"
            value={accentHex}
            onChange={(e) => applyCustom(primaryHex, e.target.value)}
            className="h-8 w-12 cursor-pointer rounded border"
            aria-label={t('general.customPaletteAccent')}
          />
          {t('general.customPaletteAccent')}
        </label>
        <div className="ms-auto flex items-center gap-1">
          {isCustomActive && (
            <span className="text-[10px] text-muted-foreground">{t('general.customPaletteApplied')}</span>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={resetCustom}
            aria-label={t('general.customPaletteReset')}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {t('general.customPaletteHint')}
      </p>
    </div>
  );
}

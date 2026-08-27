import { Check, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTheme } from '@/contexts/ThemeContext';
import { CustomPaletteEditor } from '@/components/settings/CustomPaletteEditor';
import type { Theme, ThemeName } from '@/lib/themes';
import { getAllThemes } from '@/lib/themes';
import { cn } from '@/lib/utils';

// Gradient backgrounds for theme preview
const themeGradients: Record<ThemeName, string> = {
  midnight: 'bg-gradient-to-br from-blue-500 via-indigo-500 to-orange-500',
  sunny: 'bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-500',
  rain: 'bg-gradient-to-br from-slate-500 via-sky-600 to-indigo-500',
  aurora: 'bg-gradient-to-br from-emerald-400 via-cyan-500 to-blue-500',
  ocean: 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500',
  forest: 'bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500',
  sunset: 'bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500',
  candy: 'bg-gradient-to-br from-pink-500 via-rose-500 to-red-500',
  custom: 'bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500',
};

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const allThemes = getAllThemes();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Palette className="h-4 w-4" />
          <span className="sr-only">Change theme</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Theme</p>
            <div className="grid grid-cols-3 gap-2">
              {allThemes.map((t: Theme) => (
                <button
                  type="button"
                  key={t.name}
                  onClick={() => setTheme(t.name)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all',
                    theme === t.name
                      ? 'border-primary bg-accent'
                      : 'border-transparent hover:bg-accent/50',
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shadow-lg',
                      themeGradients[t.name],
                    )}
                  >
                    {theme === t.name ? (
                      <Check className="w-4 h-4 text-white drop-shadow" />
                    ) : (
                      <span className="text-sm">{t.emoji}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <CustomPaletteEditor />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
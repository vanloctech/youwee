import { Check, Subtitles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type SubtitleModeOption<TMode extends string> = {
  value: TMode;
  label: string;
  title?: string;
};

type SubtitleFormatOption<TFormat extends string> = {
  value: TFormat;
  label: string;
};

interface SubtitlePopoverContentProps<TMode extends string, TFormat extends string> {
  title: string;
  headerAction?: {
    active: boolean;
    activeLabel: string;
    inactiveLabel: string;
    onToggle: () => void;
  };
  mode?: {
    label: string;
    value: TMode;
    options: SubtitleModeOption<TMode>[];
    onChange: (value: TMode) => void;
  };
  showDetails?: boolean;
  languageLabel: string;
  languageCodes: string[];
  selectedLanguages: string[];
  onToggleLanguage: (code: string) => void;
  getLanguageLabel: (code: string) => string;
  emptyLanguageText: string;
  selectedLanguagesText: string;
  formatLabel: string;
  formatValue: TFormat;
  formatOptions: SubtitleFormatOption<TFormat>[];
  onFormatChange: (value: TFormat) => void;
  embed?: {
    label: string;
    valueLabel: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
  hint?: ReactNode;
}

export function SubtitlePopoverContent<TMode extends string, TFormat extends string>({
  title,
  headerAction,
  mode,
  showDetails = true,
  languageLabel,
  languageCodes,
  selectedLanguages,
  onToggleLanguage,
  getLanguageLabel,
  emptyLanguageText,
  selectedLanguagesText,
  formatLabel,
  formatValue,
  formatOptions,
  onFormatChange,
  embed,
  hint,
}: SubtitlePopoverContentProps<TMode, TFormat>) {
  return (
    <>
      <div
        className={cn(
          'flex border-b bg-muted/30 px-4 py-3',
          headerAction ? 'items-center justify-between' : 'items-center gap-2',
        )}
      >
        <div className="flex items-center gap-2">
          <Subtitles className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium">{title}</h4>
        </div>

        {headerAction ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={headerAction.onToggle}
            className={cn(
              'h-6 px-2.5 text-[11px] font-medium',
              headerAction.active
                ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {headerAction.active ? headerAction.activeLabel : headerAction.inactiveLabel}
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        {mode ? (
          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">{mode.label}</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {mode.options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => mode.onChange(option.value)}
                  className={cn(
                    'h-8 rounded-md px-2 text-xs font-medium transition-colors',
                    mode.value === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={option.title}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showDetails ? (
          <>
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">{languageLabel}</Label>
              <div className="flex flex-wrap gap-1.5">
                {languageCodes.map((code) => {
                  const isSelected = selectedLanguages.includes(code);
                  return (
                    <button
                      type="button"
                      key={code}
                      onClick={() => onToggleLanguage(code)}
                      className={cn(
                        'flex h-7 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors',
                        isSelected
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                      title={getLanguageLabel(code)}
                    >
                      {isSelected ? <Check className="h-3 w-3" /> : null}
                      {code.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {selectedLanguages.length === 0 ? emptyLanguageText : selectedLanguagesText}
              </p>
            </div>

            <div className={cn('gap-3', embed ? 'grid grid-cols-2' : 'space-y-1.5')}>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">{formatLabel}</Label>
                <Select
                  value={formatValue}
                  onValueChange={(value) => onFormatChange(value as TFormat)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formatOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-xs">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {embed ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">{embed.label}</Label>
                  <div className="flex h-8 items-center justify-between rounded-md border bg-background px-3">
                    <span className="text-xs text-muted-foreground">{embed.valueLabel}</span>
                    <Switch checked={embed.checked} onCheckedChange={embed.onChange} />
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {hint ? (
          <div className="text-[10px] leading-relaxed text-muted-foreground">{hint}</div>
        ) : null}
      </div>
    </>
  );
}

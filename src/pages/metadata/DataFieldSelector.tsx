import { Check, Clock, Columns3, Eye, FileText, Hash } from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { DEFAULT_FIELDS, FIELD_IDS, type FieldId } from './dataExportUtils';

type DataFieldSelectorProps = {
  selectedFields: FieldId[];
  setSelectedFields: Dispatch<SetStateAction<FieldId[]>>;
};

const FIELD_GROUPS: { id: string; labelKey: string; icon: ReactNode; fields: FieldId[] }[] = [
  {
    id: 'basic',
    labelKey: 'data.fieldGroups.basic',
    icon: <FileText className="w-3.5 h-3.5" />,
    fields: ['title', 'videoUrl', 'channelName', 'thumbnail'],
  },
  {
    id: 'engagement',
    labelKey: 'data.fieldGroups.engagement',
    icon: <Eye className="w-3.5 h-3.5" />,
    fields: ['viewCount', 'likeCount', 'commentCount'],
  },
  {
    id: 'content',
    labelKey: 'data.fieldGroups.content',
    icon: <Hash className="w-3.5 h-3.5" />,
    fields: ['tags', 'description', 'descriptionTags', 'descriptionEmails', 'descriptionLinks'],
  },
  {
    id: 'time',
    labelKey: 'data.fieldGroups.time',
    icon: <Clock className="w-3.5 h-3.5" />,
    fields: ['duration', 'durationSeconds', 'durationMinutes', 'durationTimestamp', 'uploadedTime'],
  },
];

export function DataFieldSelector({ selectedFields, setSelectedFields }: DataFieldSelectorProps) {
  const { t } = useTranslation('metadata');

  const toggleField = (field: FieldId) => {
    setSelectedFields((current) => {
      if (current.includes(field)) {
        return current.filter((item) => item !== field);
      }
      return [...current, field];
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-dashed bg-background/70 px-2.5"
        >
          <Columns3 className="w-4 h-4" />
          <span>{t('data.columns')}</span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary">
            {selectedFields.length}/{FIELD_IDS.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
      >
        <div className="border-b border-border/60 bg-muted/25 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-sm font-medium text-foreground">{t('data.columns')}</div>
            <div className="shrink-0 text-xs text-muted-foreground">
              {t('data.fieldsSelected', {
                selected: selectedFields.length,
                total: FIELD_IDS.length,
              })}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 rounded-md border-dashed bg-background/70 px-2 text-xs"
              onClick={() => setSelectedFields(FIELD_IDS)}
            >
              {t('data.selectAllFields')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 rounded-md border-dashed bg-background/70 px-2 text-xs"
              onClick={() => setSelectedFields(DEFAULT_FIELDS)}
            >
              {t('data.defaultFields')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 rounded-md border-dashed bg-background/70 px-2 text-xs"
              onClick={() => setSelectedFields([])}
            >
              {t('data.clearFields')}
            </Button>
          </div>
        </div>
        <div className="max-h-[18rem] overflow-y-auto overscroll-contain p-2">
          {FIELD_GROUPS.map((group) => {
            const selectedInGroup = group.fields.filter((field) =>
              selectedFields.includes(field),
            ).length;

            return (
              <section key={group.id} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="text-primary">{group.icon}</span>
                    {t(group.labelKey)}
                  </span>
                  <span>
                    {selectedInGroup}/{group.fields.length}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {group.fields.map((field) => {
                    const selected = selectedFields.includes(field);
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() => toggleField(field)}
                        className={cn(
                          'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition hover:bg-muted/60',
                          selected && 'bg-primary/10 text-primary',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background text-transparent',
                            selected && 'border-primary bg-primary text-primary-foreground',
                          )}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {t(`data.columnsMap.${field}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

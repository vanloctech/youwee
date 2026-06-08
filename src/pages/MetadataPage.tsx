import { FileCode2, TableProperties } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssetsExportTab } from '@/pages/metadata/AssetsExportTab';
import { DataExportTab } from '@/pages/metadata/DataExportTab';

export function MetadataPage() {
  const { t } = useTranslation('metadata');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
        <ThemePicker />
      </header>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <Tabs defaultValue="data" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-shrink-0 px-4 sm:px-6 pt-3">
          <TabsList className="grid w-full max-w-sm grid-cols-2">
            <TabsTrigger value="data" className="gap-1.5">
              <TableProperties className="w-4 h-4" />
              {t('tabs.data')}
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-1.5">
              <FileCode2 className="w-4 h-4" />
              {t('tabs.assets')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="data"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
        >
          <DataExportTab />
        </TabsContent>
        <TabsContent
          value="assets"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex"
        >
          <AssetsExportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

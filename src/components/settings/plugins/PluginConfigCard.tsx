import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PluginSummary } from '@/lib/types';
import { PluginConfigFieldEditor } from './PluginConfigFieldEditor';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginConfigCardControllerProps = Pick<
  PostDownloadPluginsCardController,
  | 'getConfigDraftValue'
  | 'handleClearPluginConfig'
  | 'handlePickPluginConfigPath'
  | 'handleSavePluginConfig'
  | 'setConfigDraftValue'
>;

export function PluginConfigCard({
  controller,
  plugin,
}: {
  controller: PluginConfigCardControllerProps;
  plugin: PluginSummary;
}) {
  const { t } = useTranslation('settings');

  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <SlidersHorizontal className="h-4 w-4 text-emerald-500" />
        <span>{t('download.pluginConfigTitle')}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t('download.pluginConfigDesc')}</p>

      <div className="mt-3 space-y-3">
        {plugin.manifest.configFields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{t('download.pluginConfigEmpty')}</p>
        ) : (
          plugin.manifest.configFields.map((field) => (
            <PluginConfigFieldEditor
              key={`${plugin.manifest.id}-${field.key}`}
              controller={controller}
              plugin={plugin}
              field={field}
            />
          ))
        )}
      </div>
    </div>
  );
}

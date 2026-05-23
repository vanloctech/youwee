import { Atom } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PostDownloadPluginsCard } from '@/components/settings/PostDownloadPluginsCard';
import { SettingsSection } from '../SettingsSection';

interface PluginsSectionProps {
  highlightId?: string | null;
}

export function PluginsSection({ highlightId }: PluginsSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-8">
      <div
        id="plugins-manager"
        className={highlightId === 'plugins-manager' ? 'rounded-2xl ring-2 ring-primary/30' : ''}
      >
        <SettingsSection
          title={t('plugins.title')}
          description={t('plugins.description')}
          icon={<Atom className="w-5 h-5 text-white" />}
          iconClassName="bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-purple-500/20"
        >
          <PostDownloadPluginsCard />
        </SettingsSection>
      </div>
    </div>
  );
}

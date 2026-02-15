import { BookOpen, Download, ExternalLink, Puzzle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SettingsCard, SettingsRow, SettingsSection } from '../SettingsSection';

interface ExtensionSectionProps {
  highlightId?: string | null;
}

const RELEASES_LATEST_URL = 'https://github.com/vanloctech/youwee/releases/latest';
const EXTENSION_DOCS_URL =
  'https://github.com/vanloctech/youwee/blob/main/docs/browser-extension.md';
const CHROMIUM_DOWNLOAD_URL =
  'https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Chromium.zip';
const FIREFOX_DOWNLOAD_URL =
  'https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Firefox-signed.xpi';

const actionButtonClass = cn(
  'h-9 px-3 rounded-md border border-dashed border-border/70',
  'inline-flex items-center gap-1.5 text-sm font-medium',
  'text-muted-foreground hover:text-foreground',
  'hover:border-primary/50 hover:bg-primary/5 transition-colors',
);

export function ExtensionSection({ highlightId }: ExtensionSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('extension.title')}
        description={t('extension.description')}
        icon={<Puzzle className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/20"
      >
        <SettingsCard id="extension-download" highlight={highlightId === 'extension-download'}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t('extension.releaseAssetLabel')}</Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {t('extension.latest')}
            </Badge>
          </div>

          <SettingsRow
            id="extension-desktop-required"
            label={t('extension.desktopRequired')}
            description={t('extension.desktopRequiredDesc')}
            highlight={highlightId === 'extension-desktop-required'}
            className="mt-3"
          >
            <a
              href={RELEASES_LATEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={actionButtonClass}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('extension.openLatestRelease')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </SettingsRow>

          <SettingsRow
            id="extension-chromium"
            label={t('extension.chromium')}
            description={t('extension.chromiumDesc')}
            highlight={highlightId === 'extension-chromium'}
          >
            <a
              href={CHROMIUM_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={actionButtonClass}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('extension.downloadZip')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </SettingsRow>

          <SettingsRow
            id="extension-firefox"
            label={t('extension.firefox')}
            description={t('extension.firefoxDesc')}
            highlight={highlightId === 'extension-firefox'}
          >
            <a
              href={FIREFOX_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={actionButtonClass}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('extension.downloadXpi')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </SettingsRow>

          <SettingsRow
            id="extension-guide"
            label={t('extension.guide')}
            description={t('extension.guideDesc')}
            highlight={highlightId === 'extension-guide'}
          >
            <a
              href={EXTENSION_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={actionButtonClass}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t('extension.openGuide')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard id="extension-install" highlight={highlightId === 'extension-install'}>
          <p className="text-sm font-medium">{t('extension.installSteps')}</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-background/60 p-3">
              <p className="text-sm font-medium text-foreground">{t('extension.chromiumSteps')}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>{t('extension.chromiumStep1')}</li>
                <li>{t('extension.chromiumStep2')}</li>
                <li>{t('extension.chromiumStep3')}</li>
                <li>{t('extension.chromiumStep4')}</li>
              </ol>
            </div>

            <div className="rounded-xl bg-background/60 p-3">
              <p className="text-sm font-medium text-foreground">{t('extension.firefoxSteps')}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>{t('extension.firefoxStep1')}</li>
                <li>{t('extension.firefoxStep2')}</li>
                <li>{t('extension.firefoxStep3')}</li>
              </ol>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}

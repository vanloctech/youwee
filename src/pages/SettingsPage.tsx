import { getVersion } from '@tauri-apps/api/app';
import {
  Bug,
  Check,
  CheckCircle2,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Info,
  Loader2,
  RefreshCw,
  Settings,
  Share2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AISection,
  DependenciesSection,
  DownloadSection,
  ExtensionSection,
  GeneralSection,
  NetworkSection,
  PluginsSection,
  RemoteDownloadSection,
  SettingsRow,
  SettingsSearch,
  SettingsSection,
  type SettingsSectionId,
  SettingsSidebar,
} from '@/components/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useDownload } from '@/contexts/DownloadContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useUpdater } from '@/contexts/UpdaterContext';
import { cn } from '@/lib/utils';

export function SettingsPage({
  initialSection = 'general',
}: {
  initialSection?: SettingsSectionId;
}) {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const updater = useUpdater();

  // Load app version
  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // Handle search navigation
  const handleSearchNavigate = useCallback((section: SettingsSectionId, settingId: string) => {
    setActiveSection(section);
    setHighlightId(settingId);

    // Scroll to element after section change
    setTimeout(() => {
      const element = document.getElementById(settingId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after animation
      setTimeout(() => setHighlightId(null), 2000);
    }, 100);
  }, []);

  // Updater state helpers
  const isAppChecking = updater.status === 'checking';
  const isAppUpdateAvailable = updater.status === 'available';
  const isAppUpToDate = updater.status === 'up-to-date';
  const isAppError = updater.status === 'error';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{t('title')}</h1>
              <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <SettingsSearch onNavigate={handleSearchNavigate} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div ref={contentRef} className="mx-auto w-full max-w-6xl py-6">
              {/* Animated section transitions */}
              <div
                className={cn(
                  'transition-all duration-300 ease-out',
                  'animate-in fade-in-0 slide-in-from-right-4',
                )}
                key={activeSection}
              >
                {activeSection === 'general' && <GeneralSection highlightId={highlightId} />}

                {activeSection === 'dependencies' && (
                  <DependenciesSection highlightId={highlightId} />
                )}

                {activeSection === 'download' && <DownloadSection highlightId={highlightId} />}

                {activeSection === 'remote-download' && (
                  <RemoteDownloadSection highlightId={highlightId} />
                )}

                {activeSection === 'plugins' && <PluginsSection highlightId={highlightId} />}

                {activeSection === 'extension' && <ExtensionSection highlightId={highlightId} />}

                {activeSection === 'ai' && <AISection highlightId={highlightId} />}

                {activeSection === 'network' && <NetworkSection highlightId={highlightId} />}

                {activeSection === 'about' && (
                  <AboutSettingsContent
                    appVersion={appVersion}
                    updater={updater}
                    isAppChecking={isAppChecking}
                    isAppUpdateAvailable={isAppUpdateAvailable}
                    isAppUpToDate={isAppUpToDate}
                    isAppError={isAppError}
                    highlightId={highlightId}
                  />
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// About Settings Content
function AboutSettingsContent({
  appVersion,
  updater,
  isAppChecking,
  isAppUpdateAvailable,
  isAppUpToDate,
  isAppError,
  highlightId,
}: {
  appVersion: string;
  updater: ReturnType<typeof useUpdater>;
  isAppChecking: boolean;
  isAppUpdateAvailable: boolean;
  isAppUpToDate: boolean;
  isAppError: boolean;
  highlightId: string | null;
}) {
  const { t } = useTranslation('settings');
  const { settings, updateAutoCheckUpdate } = useDownload();
  const { mode } = useTheme();
  const [copied, setCopied] = useState(false);

  const appUrl = 'https://github.com/vanloctech/youwee';
  const buyMeACoffeeUrl = 'https://buymeacoffee.com/vanloctech';
  const redditUrl = 'https://www.reddit.com/r/youwee/';
  const productHuntUrl =
    'https://www.producthunt.com/products/youwee/reviews/new?utm_source=badge-product_review&utm_medium=badge&utm_source=badge-youwee';
  const productHuntBadgeUrl = `https://api.producthunt.com/widgets/embed-image/v1/product_review.svg?product_id=1154224&theme=${mode}`;
  const shareText = t('about.shareText');
  const encodedUrl = encodeURIComponent(appUrl);
  const encodedText = encodeURIComponent(shareText);

  const shareLinks = [
    {
      key: 'x',
      label: 'X',
      faIcon: 'fa-twitter',
      color: 'text-sky-400',
      hoverBg: 'hover:bg-sky-500/10',
      href: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      faIcon: 'fa-facebook',
      color: 'text-blue-600 dark:text-blue-400',
      hoverBg: 'hover:bg-blue-500/10',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      key: 'reddit',
      label: 'Reddit',
      faIcon: 'fa-reddit',
      color: 'text-orange-500',
      hoverBg: 'hover:bg-orange-500/10',
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    },
    {
      key: 'telegram',
      label: 'Telegram',
      faIcon: 'fa-telegram',
      color: 'text-sky-500',
      hoverBg: 'hover:bg-sky-500/10',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      faIcon: 'fa-whatsapp',
      color: 'text-green-500',
      hoverBg: 'hover:bg-green-500/10',
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${appUrl}`)}`,
    },
    {
      key: 'weibo',
      label: 'Weibo',
      faIcon: 'fa-weibo',
      color: 'text-rose-500',
      hoverBg: 'hover:bg-rose-500/10',
      href: `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedText}`,
    },
  ];

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('Failed to copy share link:', error);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('about.title')}
        description={t('about.description')}
        icon={<Info className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-pink-500 to-rose-600 shadow-pink-500/20"
      >
        {/* ── Hero App Info Card ── */}
        <div
          id="app-version"
          className={cn(
            'relative overflow-hidden rounded-[1.4rem] transition-all duration-500',
            'bg-background/78 shadow-[0_16px_40px_rgba(0,0,0,0.08)] backdrop-blur-2xl',
            'dark:shadow-[0_22px_50px_rgba(0,0,0,0.25)]',
            highlightId === 'app-version' &&
              'ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_hsl(var(--gradient-via)/0.16),_transparent_34%)]" />
          <div className="relative p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden">
                  <img src="/logo-128.png" alt="Youwee" className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl font-bold tracking-tight gradient-text">Youwee</span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-xs bg-primary/10 text-primary border-0"
                    >
                      v{appVersion}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{t('about.appDesc')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isAppChecking ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        {t('about.checkingUpdates')}
                      </span>
                    ) : isAppUpdateAvailable && updater.updateInfo ? (
                      <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                        <Download className="w-3 h-3" />
                        {t('about.versionAvailable', { version: updater.updateInfo.version })}
                      </span>
                    ) : isAppUpToDate ? (
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('about.upToDate')}
                      </span>
                    ) : isAppError ? (
                      <span className="text-destructive">
                        {updater.error || t('about.checkFailed')}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isAppUpdateAvailable && (
                  <Button
                    size="sm"
                    onClick={updater.downloadAndInstall}
                    disabled={updater.status === 'downloading' || updater.status === 'ready'}
                    className="gap-1.5"
                  >
                    {updater.status === 'downloading' || updater.status === 'ready' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {updater.status === 'downloading'
                          ? `${updater.progress ? Math.round((updater.progress.downloaded / updater.progress.total) * 100) : 0}%`
                          : t('about.restarting')}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {t('about.update')}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={updater.checkForUpdate}
                  disabled={isAppChecking}
                  title={t('about.checkForUpdates')}
                  className="h-9 w-9"
                >
                  <RefreshCw className={cn('w-4 h-4', isAppChecking && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {/* Quick Links */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/30">
              <a
                href="https://github.com/vanloctech/youwee/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/60 hover:bg-background text-xs font-medium transition-all hover:shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                {t('about.license')}
              </a>
              <a
                href="https://github.com/vanloctech/youwee/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/60 hover:bg-background text-xs font-medium transition-all hover:shadow-sm"
              >
                <Bug className="w-3.5 h-3.5 text-muted-foreground" />
                {t('about.reportIssue')}
              </a>
            </div>
          </div>
        </div>

        {/* ── Community & Support Row ── */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Community Card */}
          <div className="rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/40">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                <i
                  className="fa fa-github text-[16px] text-violet-600 dark:text-violet-400"
                  aria-hidden="true"
                />
              </div>
              <p className="text-sm font-semibold">{t('about.communityTitle')}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              {t('about.communityDesc')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://github.com/vanloctech/youwee"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/60 hover:bg-background text-xs font-medium transition-all hover:shadow-sm"
              >
                <i className="fa fa-github text-[14px]" aria-hidden="true" />
                GitHub
              </a>
              <a
                href={redditUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/60 hover:bg-orange-500/10 text-xs font-medium transition-all text-orange-500 hover:shadow-sm"
              >
                <i className="fa fa-reddit text-[12px]" aria-hidden="true" />
                Reddit
              </a>
            </div>
            <div className="mt-3">
              <a
                href={productHuntUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full transition-opacity hover:opacity-90"
              >
                <img
                  src={productHuntBadgeUrl}
                  alt={t('about.productHuntBadgeAlt')}
                  width={250}
                  height={54}
                  className="h-[54px] w-[250px] max-w-full rounded-lg"
                />
              </a>
            </div>
          </div>

          {/* Support Card */}
          <div className="rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/40">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10">
                <Heart className="w-4 h-4 text-rose-500" />
              </div>
              <p className="text-sm font-semibold">{t('about.supportTitle')}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              {t('about.supportDesc')}
            </p>
            <a
              href={buyMeACoffeeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-dashed border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10 px-4 py-3 transition-colors hover:border-amber-500/50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Coffee className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span>{t('about.buyMeACoffee')}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {t('about.buyMeACoffeeDesc')}
                </p>
              </div>
            </a>
          </div>
        </div>

        {/* ── Share Card ── */}
        <div className="rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/40">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t('about.shareTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('about.shareDesc')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {shareLinks.map((item) => (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background/60 text-xs font-medium transition-all hover:shadow-sm hover:scale-105',
                  item.color,
                  item.hoverBg,
                )}
              >
                <i className={cn('fa', item.faIcon, 'text-[13px]')} aria-hidden="true" />
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={handleCopyLink}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background/60 hover:bg-background text-xs font-medium transition-all hover:shadow-sm hover:scale-105',
                copied && 'text-emerald-500',
              )}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              {copied ? t('about.copied') : t('about.copyLink')}
            </button>
          </div>
        </div>

        {/* ── Made with love ── */}
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="text-xs text-muted-foreground">{t('about.madeWith')}</span>
          <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">{t('about.by')}</span>
          <a
            href="https://github.com/vanloctech"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-bold gradient-text hover:opacity-80 transition-opacity"
          >
            vanloctech
          </a>
        </div>

        {/* Auto Update Toggle */}
        <SettingsRow
          id="auto-update"
          label={t('about.autoUpdate')}
          description={t('about.autoUpdateDesc')}
          highlight={highlightId === 'auto-update'}
        >
          <Switch checked={settings.autoCheckUpdate} onCheckedChange={updateAutoCheckUpdate} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AlertCircle, ExternalLink, FolderOpen, Globe, KeyRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDownload } from '@/contexts/DownloadContext';
import type { BrowserProfile, BrowserType, CookieMode, ProxyMode } from '@/lib/types';
import { BROWSER_OPTIONS } from '@/lib/types';
import { SettingsCard, SettingsSection } from '../SettingsSection';

interface NetworkSectionProps {
  highlightId?: string | null;
}

export function NetworkSection({ highlightId }: NetworkSectionProps) {
  const { t } = useTranslation('settings');
  const { cookieSettings, proxySettings, updateCookieSettings, updateProxySettings } =
    useDownload();

  const [detectedBrowsers, setDetectedBrowsers] = useState<
    { name: string; browser_type: string }[]
  >([]);
  const [isDetectingBrowsers, setIsDetectingBrowsers] = useState(false);
  const [browserProfiles, setBrowserProfiles] = useState<BrowserProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [useCustomProfile, setUseCustomProfile] = useState(false);

  // Detect browsers
  useEffect(() => {
    const detectBrowsers = async () => {
      setIsDetectingBrowsers(true);
      try {
        const browsers = await invoke<{ name: string; browser_type: string }[]>(
          'detect_installed_browsers',
        );
        setDetectedBrowsers(browsers);
      } catch (error) {
        console.error('Failed to detect browsers:', error);
      } finally {
        setIsDetectingBrowsers(false);
      }
    };
    detectBrowsers();
  }, []);

  // Load browser profiles when browser changes
  useEffect(() => {
    const loadProfiles = async () => {
      if (!cookieSettings.browser || cookieSettings.browser === 'safari') {
        setBrowserProfiles([]);
        return;
      }

      setIsLoadingProfiles(true);
      try {
        const profiles = await invoke<BrowserProfile[]>('get_browser_profiles', {
          browser: cookieSettings.browser,
        });
        setBrowserProfiles(profiles);

        // Auto-select first profile if none selected
        if (profiles.length > 0 && !cookieSettings.browserProfile) {
          updateCookieSettings({ browserProfile: profiles[0].folder_name });
        }
      } catch (error) {
        console.error('Failed to load profiles:', error);
        setBrowserProfiles([]);
      } finally {
        setIsLoadingProfiles(false);
      }
    };

    if (cookieSettings.mode === 'browser') {
      loadProfiles();
    }
  }, [
    cookieSettings.browser,
    cookieSettings.mode,
    cookieSettings.browserProfile,
    updateCookieSettings,
  ]);

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('network.title')}
        description={t('network.description')}
        icon={<Globe className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-blue-500 to-cyan-600 shadow-blue-500/20"
      >
        {/* Video Authentication */}
        <SettingsCard
          id="cookie-mode"
          highlight={highlightId === 'cookie-mode' || highlightId === 'cookie-browser'}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-medium">{t('network.videoAuth')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">{t('network.videoAuthDesc')}</p>
            </div>
          </div>

          {/* Cookie Mode Selection */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">{t('network.cookieSource')}</p>
                <p className="text-xs text-muted-foreground">{t('network.cookieSourceDesc')}</p>
              </div>
              <Select
                value={cookieSettings.mode}
                onValueChange={(v) => updateCookieSettings({ mode: v as CookieMode })}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">{t('network.off')}</SelectItem>
                  <SelectItem value="browser">{t('network.fromBrowser')}</SelectItem>
                  <SelectItem value="file">{t('network.fromFile')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Browser Selection */}
          {cookieSettings.mode === 'browser' && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{t('network.browser')}</p>
                  <p className="text-xs text-muted-foreground">
                    {isDetectingBrowsers
                      ? t('network.detecting')
                      : t('network.browsersDetected', { count: detectedBrowsers.length })}
                  </p>
                </div>
                <Select
                  value={cookieSettings.browser || ''}
                  onValueChange={(v) => updateCookieSettings({ browser: v as BrowserType })}
                  disabled={isDetectingBrowsers}
                >
                  <SelectTrigger className="w-[160px] h-8">
                    <SelectValue placeholder={t('network.selectBrowser')} />
                  </SelectTrigger>
                  <SelectContent>
                    {detectedBrowsers.map((browser) => (
                      <SelectItem key={browser.browser_type} value={browser.browser_type}>
                        <div className="flex items-center gap-2">
                          <Globe className="w-3 h-3" />
                          {browser.name}
                        </div>
                      </SelectItem>
                    ))}
                    {detectedBrowsers.length === 0 &&
                      BROWSER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Browser Profile */}
              {cookieSettings.browser !== 'safari' && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{t('network.profile')}</p>
                    <p className="text-xs text-muted-foreground">
                      {isLoadingProfiles
                        ? t('network.loading')
                        : browserProfiles.length > 0
                          ? t('network.profilesFound', { count: browserProfiles.length })
                          : t('network.noProfilesDetected')}
                    </p>
                  </div>
                  {!useCustomProfile && browserProfiles.length > 0 ? (
                    <Select
                      value={cookieSettings.browserProfile || ''}
                      onValueChange={(v) => {
                        if (v === '__custom__') {
                          setUseCustomProfile(true);
                          updateCookieSettings({ browserProfile: '' });
                        } else {
                          updateCookieSettings({ browserProfile: v });
                        }
                      }}
                      disabled={isLoadingProfiles}
                    >
                      <SelectTrigger className="w-[200px] h-8">
                        <SelectValue placeholder={t('network.selectProfile')} />
                      </SelectTrigger>
                      <SelectContent>
                        {browserProfiles.map((profile) => (
                          <SelectItem key={profile.folder_name} value={profile.folder_name}>
                            {profile.folder_name === profile.display_name
                              ? profile.folder_name
                              : `${profile.folder_name} (${profile.display_name})`}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">
                          <span className="text-muted-foreground">{t('network.custom')}</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={cookieSettings.browserProfile || ''}
                        onChange={(e) => updateCookieSettings({ browserProfile: e.target.value })}
                        placeholder={t('network.profileName')}
                        className="w-[160px] h-8 text-xs"
                      />
                      {browserProfiles.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => {
                            setUseCustomProfile(false);
                            if (browserProfiles.length > 0) {
                              updateCookieSettings({
                                browserProfile: browserProfiles[0].folder_name,
                              });
                            }
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* macOS Permission Warning */}
              {navigator.platform.includes('Mac') && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <p className="font-medium text-amber-500">{t('network.fullDiskAccess')}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {t('network.fullDiskAccessDesc')}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        onClick={async () => {
                          try {
                            await invoke('open_macos_privacy_settings');
                          } catch (error) {
                            console.error('Failed to open settings:', error);
                          }
                        }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {t('network.openSettings')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Windows Browser Lock Warning */}
              {navigator.platform.includes('Win') && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <p className="font-medium text-amber-500">{t('network.browserMustBeClosed')}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {t('network.browserMustBeClosedDesc')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* File Selection */}
          {cookieSettings.mode === 'file' && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{t('network.cookieFile')}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {cookieSettings.filePath || t('network.noFileSelected')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const file = await open({
                        multiple: false,
                        filters: [{ name: 'Cookie files', extensions: ['txt'] }],
                        title: 'Select cookies.txt file',
                      });
                      if (file) {
                        updateCookieSettings({ filePath: file as string });
                      }
                    } catch (error) {
                      console.error('Failed to select cookie file:', error);
                    }
                  }}
                  className="gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('network.browse')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('network.cookieFileHelp')}{' '}
                <a
                  href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get cookies.txt LOCALLY
                </a>
              </p>
            </div>
          )}
        </SettingsCard>

        {/* Network Proxy */}
        <SettingsCard id="proxy" highlight={highlightId === 'proxy'}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-medium">{t('network.networkProxy')}</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('network.networkProxyDesc')}
              </p>
            </div>
          </div>

          {/* Proxy Mode Selection */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">{t('network.proxyType')}</p>
                <p className="text-xs text-muted-foreground">{t('network.proxyTypeDesc')}</p>
              </div>
              <Select
                value={proxySettings.mode}
                onValueChange={(v) => updateProxySettings({ mode: v as ProxyMode })}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">{t('network.off')}</SelectItem>
                  <SelectItem value="http">{t('network.httpHttps')}</SelectItem>
                  <SelectItem value="socks5">{t('network.socks5')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Proxy Settings */}
          {proxySettings.mode !== 'off' && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              {/* Host and Port */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-xs font-medium mb-1">{t('network.host')}</p>
                  <Input
                    type="text"
                    value={proxySettings.host || ''}
                    onChange={(e) => updateProxySettings({ host: e.target.value })}
                    placeholder="127.0.0.1 or proxy.example.com"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="w-24">
                  <p className="text-xs font-medium mb-1">{t('network.port')}</p>
                  <Input
                    type="number"
                    value={proxySettings.port || ''}
                    onChange={(e) =>
                      updateProxySettings({
                        port: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="7890"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Username and Password */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-xs font-medium mb-1">{t('network.usernameOptional')}</p>
                  <Input
                    type="text"
                    value={proxySettings.username || ''}
                    onChange={(e) => updateProxySettings({ username: e.target.value })}
                    placeholder="username"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium mb-1">{t('network.passwordOptional')}</p>
                  <Input
                    type="password"
                    value={proxySettings.password || ''}
                    onChange={(e) => updateProxySettings({ password: e.target.value })}
                    placeholder="password"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t('network.commonProxies')}</p>
            </div>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}

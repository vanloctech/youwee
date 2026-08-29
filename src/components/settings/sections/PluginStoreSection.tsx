import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldQuestion,
  ShoppingBag,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type {
  PluginStoreEntry,
  PluginStorePublisherKind,
  PreparedPluginStorePackage,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { renderPluginManifestIcon } from '../plugins/post-download-plugins-shared';
import { SettingsSection } from '../SettingsSection';

type PluginStoreFilter = 'all' | PluginStorePublisherKind;

let pluginStoreEntriesCache: PluginStoreEntry[] | null = null;
let pluginStoreEntriesRequest: Promise<PluginStoreEntry[]> | null = null;
const PLUGIN_STORE_LOCAL_TIMEOUT_MS = 12000;

interface PluginStoreSectionProps {
  onOpenPlugins?: (pluginId?: string) => void;
}

function formatPackageSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getLatestVersion(entry: PluginStoreEntry) {
  return entry.versions.find((version) => version.version === entry.latestVersion);
}

function entryMatchesQuery(entry: PluginStoreEntry, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    entry.name,
    entry.description,
    entry.pluginId,
    entry.slug,
    entry.publisher.name,
    entry.repository,
    ...entry.categories,
    ...entry.tags,
    ...entry.permissionsSummary,
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalized));
}

function pluginStoreLocalTimeout() {
  return new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error('Plugin Store took too long to load. Please try Refresh again.')),
      PLUGIN_STORE_LOCAL_TIMEOUT_MS,
    );
  });
}

async function getPluginStoreEntries(forceRefresh = false) {
  if (!forceRefresh && pluginStoreEntriesCache) {
    return pluginStoreEntriesCache;
  }

  if (!forceRefresh && pluginStoreEntriesRequest) {
    return pluginStoreEntriesRequest;
  }

  pluginStoreEntriesRequest = Promise.race([
    invoke<PluginStoreEntry[]>('list_plugin_store_entries', { forceRefresh }),
    pluginStoreLocalTimeout(),
  ])
    .then((result) => {
      pluginStoreEntriesCache = result;
      return result;
    })
    .finally(() => {
      pluginStoreEntriesRequest = null;
    });

  return pluginStoreEntriesRequest;
}

export function PluginStoreSection({ onOpenPlugins }: PluginStoreSectionProps) {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [entries, setEntries] = useState<PluginStoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [publisherFilter, setPublisherFilter] = useState<PluginStoreFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [reviewPackage, setReviewPackage] = useState<PreparedPluginStorePackage | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadEntries = useCallback(async (forceRefresh = false) => {
    setLoading(forceRefresh || !pluginStoreEntriesCache);
    setError(null);
    try {
      const result = await getPluginStoreEntries(forceRefresh);
      if (!mountedRef.current) return;
      setEntries(result);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Failed to load plugin store:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const categories = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => entry.categories))).sort(),
    [entries],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (publisherFilter !== 'all' && entry.publisher.kind !== publisherFilter) return false;
        if (categoryFilter !== 'all' && !entry.categories.includes(categoryFilter)) return false;
        return entryMatchesQuery(entry, query);
      }),
    [categoryFilter, entries, publisherFilter, query],
  );

  const installPreparedPackage = useCallback(
    async (prepared: PreparedPluginStorePackage) => {
      setInstallingId(prepared.entry.pluginId);
      try {
        await invoke('install_plugin_package', { path: prepared.path, trusted: true });
        toast.success({
          title: t('pluginStore.installSuccessTitle'),
          message: t('pluginStore.installSuccessMessage', { name: prepared.entry.name }),
        });
        setReviewPackage(null);
        await loadEntries(true);
      } catch (err) {
        console.error('Failed to install plugin store package:', err);
        toast.error({
          title: t('pluginStore.installErrorTitle'),
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setInstallingId(null);
      }
    },
    [loadEntries, t, toast],
  );

  const handleInstall = useCallback(
    async (entry: PluginStoreEntry) => {
      setInstallingId(entry.pluginId);
      try {
        const prepared = await invoke<PreparedPluginStorePackage>('prepare_plugin_store_package', {
          pluginId: entry.pluginId,
          version: entry.latestVersion,
        });
        if (prepared.entry.publisher.kind === 'third-party') {
          setReviewPackage(prepared);
          return;
        }
        await installPreparedPackage(prepared);
      } catch (err) {
        console.error('Failed to prepare plugin store package:', err);
        toast.error({
          title: t('pluginStore.installErrorTitle'),
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setInstallingId(null);
      }
    },
    [installPreparedPackage, t, toast],
  );

  return (
    <div id="plugin-store" className="space-y-6">
      <SettingsSection
        title={t('pluginStore.title')}
        description={t('pluginStore.description')}
        icon={<ShoppingBag className="w-5 h-5 text-white" />}
        iconClassName="bg-gradient-to-br from-pink-500 to-orange-500 shadow-pink-500/20"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('pluginStore.searchPlaceholder')}
                className="ps-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'official', 'third-party'] as PluginStoreFilter[]).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  variant={publisherFilter === filter ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPublisherFilter(filter)}
                  className="rounded-md border-dashed"
                >
                  {t(`pluginStore.publisherFilter.${filter}`)}
                </Button>
              ))}
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-9 rounded-md border border-dashed border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary/50"
              >
                <option value="all">{t('pluginStore.allCategories')}</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadEntries(true)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="me-1.5 h-4 w-4" />
                )}
                {t('pluginStore.refresh')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('pluginStore.thirdPartyNotice')}</p>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t('pluginStore.loadError')}: {error}
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
            {loading ? (
              <div className="col-span-full flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('pluginStore.loading')}
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="col-span-full rounded-xl border border-border/60 bg-muted/20 p-5 text-sm text-muted-foreground">
                {t('pluginStore.noResults')}
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const latestVersion = getLatestVersion(entry);
                const isInstalled = entry.installedStatus === 'installed';
                const isInstalling = installingId === entry.pluginId;
                return (
                  <article
                    key={entry.pluginId}
                    className="flex min-w-0 flex-col gap-4 rounded-xl border border-border/70 bg-muted/20 p-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/80 text-primary">
                        {renderPluginManifestIcon(entry.icon, 'h-5 w-5')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-sm font-semibold text-foreground">
                            {entry.name}
                          </h3>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
                              entry.publisher.kind === 'official'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                            )}
                          >
                            {entry.publisher.kind === 'official' ? (
                              <ShieldCheck className="h-3 w-3" />
                            ) : (
                              <ShieldQuestion className="h-3 w-3" />
                            )}
                            {t(`pluginStore.publisherKind.${entry.publisher.kind}`)}
                          </span>
                          <span className="inline-flex items-center rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {entry.publisher.name}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" dir="auto">
                          {entry.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                        v{entry.latestVersion}
                        {latestVersion?.packageSize
                          ? ` - ${formatPackageSize(latestVersion.packageSize)}`
                          : ''}
                      </span>
                      {entry.categories.map((category) => (
                        <span
                          key={category}
                          className="rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary"
                        >
                          {category}
                        </span>
                      ))}
                    </div>

                    <div className="min-h-8 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {t('pluginStore.permissions')}:{' '}
                      </span>
                      {entry.permissionsSummary.length > 0
                        ? entry.permissionsSummary.join(', ')
                        : t('pluginStore.noPermissions')}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={() => openUrl(entry.repository)}
                      >
                        <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                        {t('pluginStore.repository')}
                      </Button>
                      {isInstalled ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('pluginStore.installed')}
                            {entry.installedVersion ? ` v${entry.installedVersion}` : ''}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenPlugins?.(entry.pluginId)}
                          >
                            {t('pluginStore.openInPlugins')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleInstall(entry)}
                          disabled={isInstalling}
                        >
                          {isInstalling ? (
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="me-2 h-4 w-4" />
                          )}
                          {isInstalling ? t('pluginStore.installing') : t('pluginStore.install')}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </SettingsSection>

      <Dialog open={!!reviewPackage} onOpenChange={(open) => !open && setReviewPackage(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('pluginStore.thirdPartyTitle')}</DialogTitle>
            <DialogDescription>{t('pluginStore.thirdPartyDescription')}</DialogDescription>
          </DialogHeader>
          {reviewPackage && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium text-foreground">{reviewPackage.entry.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {reviewPackage.entry.publisher.name} - v{reviewPackage.version.version}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('pluginStore.thirdPartySecurityNote')}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewPackage(null)}>
              {t('pluginStore.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => reviewPackage && installPreparedPackage(reviewPackage)}
              disabled={!!installingId}
            >
              {installingId && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('pluginStore.confirmInstall')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

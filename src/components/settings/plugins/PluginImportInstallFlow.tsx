import { Download, Info, PackageOpen, ShieldCheck } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  formatPackageFormat,
  formatSignatureStatus,
  formatSignerFingerprint,
  formatSourceKind,
  LANGUAGE_LABELS,
  renderPluginManifestIcon,
  ToggleChoiceCard,
} from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginImportInstallActionsProps = Pick<
  PostDownloadPluginsCardController,
  'handleImportPackage' | 'inspecting'
>;

type PluginImportInstallFlowProps = Pick<
  PostDownloadPluginsCardController,
  | 'dismissInspection'
  | 'handleConfirmImportPackage'
  | 'handleInstallInspection'
  | 'importDisclaimerOpen'
  | 'inspection'
  | 'inspectionCompatibilityEntries'
  | 'inspectionSigned'
  | 'installAcknowledged'
  | 'installSource'
  | 'installing'
  | 'openPluginGuide'
  | 'setImportDisclaimerOpen'
  | 'setInstallAcknowledged'
>;

export const PluginImportInstallActions = memo(function PluginImportInstallActions({
  handleImportPackage,
  inspecting,
}: PluginImportInstallActionsProps) {
  const { t } = useTranslation('settings');

  return (
    <Button size="sm" onClick={handleImportPackage} disabled={inspecting}>
      <PackageOpen className="h-4 w-4" />
      {t('download.pluginImportPlugin')}
    </Button>
  );
});

export const PluginImportInstallFlow = memo(function PluginImportInstallFlow({
  dismissInspection,
  handleConfirmImportPackage,
  handleInstallInspection,
  importDisclaimerOpen,
  inspection,
  inspectionCompatibilityEntries,
  inspectionSigned,
  installAcknowledged,
  installSource,
  installing,
  openPluginGuide,
  setImportDisclaimerOpen,
  setInstallAcknowledged,
}: PluginImportInstallFlowProps) {
  const { t } = useTranslation('settings');

  return (
    <>
      {inspection && installSource && (
        <div className="relative overflow-hidden rounded-[1.4rem] bg-background/78 backdrop-blur-2xl transition-all duration-500">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.10),_transparent_32%),radial-gradient(circle_at_bottom_right,_hsl(var(--gradient-via)/0.08),_transparent_34%)]" />
          <div className="relative space-y-3 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
                {renderPluginManifestIcon(inspection.manifest.icon, 'h-5 w-5')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{inspection.manifest.name}</p>
                  <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground">
                    v{inspection.manifest.version}
                  </span>
                  <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {LANGUAGE_LABELS[inspection.manifest.runtime.language]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {inspection.manifest.description || t('download.pluginNoDescription')}
                </p>
              </div>
            </div>

            <div className="grid gap-x-4 gap-y-1 rounded-xl bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground sm:grid-cols-2">
              <p>
                <span className="text-foreground/70">{t('download.pluginIdentifierLabel')}:</span>{' '}
                {inspection.manifest.id}
              </p>
              <p>
                <span className="text-foreground/70">{t('download.pluginSourceLabel')}:</span>{' '}
                {formatSourceKind(inspection.source.kind, t)}
              </p>
              <p>
                <span className="text-foreground/70">{t('download.pluginSignatureTitle')}:</span>{' '}
                <span
                  className={cn(
                    inspectionSigned
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {formatSignatureStatus(inspection.signatureStatus, t)}
                </span>
              </p>
              {inspection.signerFingerprint && (
                <p>
                  <span className="text-foreground/70">
                    {t('download.pluginSignerFingerprintLabel')}:
                  </span>{' '}
                  {formatSignerFingerprint(inspection.signerFingerprint)}
                </p>
              )}
              {inspection.signedAt && (
                <p>
                  <span className="text-foreground/70">{t('download.pluginSignedAtLabel')}:</span>{' '}
                  {inspection.signedAt}
                </p>
              )}
              {inspection.packageFormat && (
                <p>
                  <span className="text-foreground/70">
                    {t('download.pluginPackageFormatLabel')}:
                  </span>{' '}
                  {formatPackageFormat(inspection.packageFormat, inspection.packageFormatVersion)}
                </p>
              )}
              {inspection.builderSdkVersion && (
                <p>
                  <span className="text-foreground/70">
                    {t('download.pluginBuilderSdkVersionLabel')}:
                  </span>{' '}
                  v{inspection.builderSdkVersion}
                </p>
              )}
              {inspection.packageChecksum && (
                <p className="break-all sm:col-span-2">
                  <span className="text-foreground/70">
                    {t('download.pluginPackageChecksumLabel')}:
                  </span>{' '}
                  {inspection.packageChecksum}
                </p>
              )}
              {inspectionCompatibilityEntries.length > 0 ? (
                inspectionCompatibilityEntries.map((entry) => <p key={entry}>{entry}</p>)
              ) : (
                <p>{t('download.pluginCompatibilityNone')}</p>
              )}
            </div>

            {inspection.warnings.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {inspection.warnings.map((warning) => (
                  <span
                    key={warning}
                    className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400"
                  >
                    {warning}
                  </span>
                ))}
              </div>
            )}

            <ToggleChoiceCard
              checked={installAcknowledged}
              onToggle={() => setInstallAcknowledged((current) => !current)}
              label={t('download.pluginInstallConfirmLabel')}
              description={t('download.pluginInstallConfirmHelp')}
              className="border-border/40 bg-background/50"
            />

            <div className="flex items-center gap-2">
              {inspection.readmeContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openPluginGuide(inspection.manifest.name, inspection.readmeContent ?? '')
                  }
                  disabled={installing}
                >
                  <Info className="h-3.5 w-3.5" />
                  {t('download.pluginGuideButton')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={dismissInspection} disabled={installing}>
                {t('download.pluginDismiss')}
              </Button>
              <Button
                size="sm"
                onClick={handleInstallInspection}
                disabled={installing || !installAcknowledged || !inspectionSigned}
              >
                <Download className="h-3.5 w-3.5" />
                {installing ? t('download.pluginInstalling') : t('download.pluginInstall')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={importDisclaimerOpen} onOpenChange={setImportDisclaimerOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              {t('download.pluginImportDisclaimerTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('download.pluginImportDisclaimerIntro')}
            </p>

            <div className="space-y-2 rounded-xl bg-muted/30 p-3">
              <div className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                <span>{t('download.pluginImportDisclaimerBody')}</span>
              </div>
              <div className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                <span>{t('download.pluginImportDisclaimerSignature')}</span>
              </div>
              <div className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                <span>{t('download.pluginImportDisclaimerRecommendation')}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setImportDisclaimerOpen(false)}>
                {t('download.pluginDismiss')}
              </Button>
              <Button size="sm" onClick={handleConfirmImportPackage}>
                <Download className="h-3.5 w-3.5" />
                {t('download.pluginImportPlugin')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

import { ArrowDownToLine, Globe, Info, Package, Palette, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SettingsSectionId } from './searchable-settings';

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSectionChange: (section: SettingsSectionId) => void;
}

const SECTION_ICONS: Record<SettingsSectionId, React.ReactNode> = {
  general: <Palette className="w-4 h-4" />,
  dependencies: <Package className="w-4 h-4" />,
  download: <ArrowDownToLine className="w-4 h-4" />,
  ai: <Sparkles className="w-4 h-4" />,
  network: <Globe className="w-4 h-4" />,
  about: <Info className="w-4 h-4" />,
};

export function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
  const { t } = useTranslation('settings');

  const sections: { id: SettingsSectionId; labelKey: string }[] = [
    { id: 'general', labelKey: 'sections.general' },
    { id: 'dependencies', labelKey: 'sections.dependencies' },
    { id: 'download', labelKey: 'sections.download' },
    { id: 'ai', labelKey: 'sections.ai' },
    { id: 'network', labelKey: 'sections.network' },
    { id: 'about', labelKey: 'sections.about' },
  ];

  return (
    <nav className="w-48 xl:w-52 2xl:w-56 flex-shrink-0 border-r border-border/50 p-3 space-y-1">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSectionChange(section.id)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
            activeSection === section.id
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <span
            className={cn(
              'transition-colors duration-200',
              activeSection === section.id ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {SECTION_ICONS[section.id]}
          </span>
          {t(section.labelKey)}
        </button>
      ))}
    </nav>
  );
}

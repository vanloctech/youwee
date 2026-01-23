import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { 
  Youtube,
  Globe,
  Sparkles,
  FolderDown,
  ScrollText,
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type Page = 'youtube' | 'universal' | 'summary' | 'library' | 'logs' | 'settings';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    icon: <Youtube className="w-5 h-5" />,
  },
  {
    id: 'universal',
    label: 'Universal',
    icon: <Globe className="w-5 h-5" />,
  },
  {
    id: 'summary',
    label: 'AI Summary',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    id: 'library',
    label: 'Library',
    icon: <FolderDown className="w-5 h-5" />,
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: <ScrollText className="w-5 h-5" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
  },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { mode, toggleMode } = useTheme();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'h-full flex flex-col rounded-2xl transition-all duration-300 ease-out',
          'bg-card/30 backdrop-blur-xl',
          'border border-white/[0.08] dark:border-white/[0.05]',
          'shadow-[0_8px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.25)]',
          'relative overflow-hidden',
          isCollapsed ? 'w-[60px]' : 'w-[180px]'
        )}
      >
        {/* Subtle gradient overlay */}
        <div 
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-50"
          style={{
            background: `
              linear-gradient(180deg, 
                hsl(var(--gradient-from) / 0.05) 0%, 
                transparent 30%,
                transparent 70%,
                hsl(var(--gradient-to) / 0.03) 100%
              )
            `
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center justify-center h-16 px-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className={cn(
              "flex-shrink-0 rounded-xl overflow-hidden transition-all duration-300",
              "ring-2 ring-primary/20 shadow-lg shadow-primary/10",
              isCollapsed ? "w-9 h-9" : "w-10 h-10"
            )}>
              <img 
                src="/logo-64.png" 
                alt="Youwee" 
                className="w-full h-full object-cover"
              />
            </div>
            <span
              className={cn(
                'font-bold text-lg whitespace-nowrap transition-all duration-300 gradient-text',
                isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100'
              )}
            >
              Youwee
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Navigation */}
        <nav className="relative flex-1 p-2 space-y-1 mt-2">
          {navItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onPageChange(item.id)}
                  className={cn(
                    'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                    'transition-all duration-200 ease-out',
                    'hover:bg-white/[0.08] dark:hover:bg-white/[0.05]',
                    currentPage === item.id && [
                      'bg-primary/10',
                      'text-primary',
                    ],
                    currentPage !== item.id && 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className={cn(
                    "flex-shrink-0 transition-all duration-200",
                    "group-hover:scale-110",
                    currentPage === item.id && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                  )}>
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium whitespace-nowrap transition-all duration-300',
                      isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                    )}
                  >
                    {item.label}
                  </span>
                  
                  {/* Active indicator */}
                  {currentPage === item.id && (
                    <div className="absolute left-0 w-1 h-5 rounded-r-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)]" />
                  )}
                </button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" className="font-medium">
                  {item.label}
                </TooltipContent>
              )}
            </Tooltip>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="relative p-2 space-y-1">
          {/* Divider */}
          <div className="mx-1 mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleMode}
                className={cn(
                  'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-white/[0.08] dark:hover:bg-white/[0.05]'
                )}
              >
                <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                  {mode === 'dark' ? (
                    <Sun className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Moon className="w-5 h-5 text-indigo-400" />
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium whitespace-nowrap transition-all duration-300',
                    isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                  )}
                >
                  {mode === 'dark' ? 'Light' : 'Dark'}
                </span>
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="font-medium">
                {mode === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </TooltipContent>
            )}
          </Tooltip>

          {/* Collapse Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={cn(
                  'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-white/[0.08] dark:hover:bg-white/[0.05]'
                )}
              >
                <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">
                  {isCollapsed ? (
                    <ChevronRight className="w-5 h-5" />
                  ) : (
                    <ChevronLeft className="w-5 h-5" />
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium whitespace-nowrap transition-all duration-300',
                    isCollapsed ? 'opacity-0 w-0' : 'opacity-100'
                  )}
                >
                  Collapse
                </span>
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className="font-medium">
                Expand
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

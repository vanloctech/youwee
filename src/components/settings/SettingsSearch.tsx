import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { type SearchResult, type SettingsSectionId, searchSettings } from './searchable-settings';

interface SettingsSearchProps {
  onNavigate: (section: SettingsSectionId, settingId: string) => void;
}

export function SettingsSearch({ onNavigate }: SettingsSearchProps) {
  const { t } = useTranslation('settings');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim()) {
      const searchResults = searchSettings(query, t);
      setResults(searchResults);
      setSelectedIndex(0);
      setIsOpen(searchResults.length > 0);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [query, t]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onNavigate(result.section, result.id);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [onNavigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % results.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect(results[selectedIndex]);
          break;
        case 'Escape':
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex, handleSelect],
  );

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && results.length > 0 && setIsOpen(true)}
          className="pl-9 pr-8 h-9 bg-muted/50 border-transparent focus:border-primary/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
          {results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              onClick={() => handleSelect(result)}
              className={cn(
                'w-full text-left px-3 py-2 transition-colors',
                index === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <div className="text-sm font-medium">{result.label}</div>
              <div className="text-xs text-muted-foreground">{result.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

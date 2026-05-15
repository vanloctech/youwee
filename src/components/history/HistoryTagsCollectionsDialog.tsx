import { Hash, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useHistory } from '@/contexts/HistoryContext';
import type { HistoryEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

interface HistoryTagsCollectionsDialogProps {
  entry: HistoryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCollectionsManager: () => void;
}

export function HistoryTagsCollectionsDialog({
  entry,
  open,
  onOpenChange,
  onOpenCollectionsManager,
}: HistoryTagsCollectionsDialogProps) {
  const { t } = useTranslation('pages');
  const { tags, collections, assignHistoryTags, assignHistoryCollections, createCollection } =
    useHistory();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedTags(entry.tags.map((tag) => tag.name));
    setSelectedCollectionIds(entry.collections.map((collection) => collection.id));
    setTagInput('');
    setNewCollectionName('');
    setError(null);
  }, [entry, open]);

  const availableTags = useMemo(
    () =>
      tags.filter(
        (tag) =>
          !selectedTags.some((selected) => selected.toLowerCase() === tag.name.toLowerCase()),
      ),
    [selectedTags, tags],
  );

  const addTag = (rawValue: string) => {
    const next = rawValue.trim().replace(/^#+/, '');
    if (!next) return;
    if (selectedTags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      setTagInput('');
      return;
    }
    setSelectedTags((prev) => [...prev, next]);
    setTagInput('');
  };

  const toggleCollection = (collectionId: string) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(collectionId)
        ? prev.filter((id) => id !== collectionId)
        : [...prev, collectionId],
    );
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createCollection(newCollectionName.trim(), null);
      setNewCollectionName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.collections.errors.create'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await assignHistoryTags(entry.id, selectedTags);
      await assignHistoryCollections(entry.id, selectedCollectionIds);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.tagging.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{t('library.tagging.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('library.tagging.dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">{t('library.tagging.tags')}</h3>
                <p className="text-xs text-muted-foreground">{t('library.tagging.tagsHint')}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder={t('library.tagging.tagPlaceholder')}
                className="bg-background/70"
              />
              <Button onClick={() => addTag(tagInput)} disabled={!tagInput.trim() || saving}>
                <Plus className="w-4 h-4" />
                {t('library.tagging.addTag')}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedTags.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t('library.tagging.noTags')}</span>
              ) : (
                selectedTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.filter((item) => item.toLowerCase() !== tag.toLowerCase()),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
                  >
                    <Hash className="w-3 h-3" />
                    {tag}
                    <X className="w-3 h-3" />
                  </button>
                ))
              )}
            </div>

            {availableTags.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('library.tagging.existingTags')}</p>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => addTag(tag.name)}
                      className="rounded-md border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      #{tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">{t('library.collections.title')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('library.collections.assignHint')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onOpenCollectionsManager}>
                {t('library.collections.manage')}
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newCollectionName}
                onChange={(event) => setNewCollectionName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleCreateCollection();
                  }
                }}
                placeholder={t('library.collections.newPlaceholder')}
                className="bg-background/70"
              />
              <Button
                variant="outline"
                onClick={() => void handleCreateCollection()}
                disabled={!newCollectionName.trim() || saving}
              >
                <Plus className="w-4 h-4" />
                {t('library.collections.create')}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {collections.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t('library.collections.empty')}
                </span>
              ) : (
                collections.map((collection) => {
                  const active = selectedCollectionIds.includes(collection.id);
                  return (
                    <button
                      type="button"
                      key={collection.id}
                      onClick={() => toggleCollection(collection.id)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors',
                        active
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-border/60 bg-background/70 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full bg-amber-500/80"
                        style={collection.color ? { backgroundColor: collection.color } : undefined}
                      />
                      {collection.name}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('library.tagging.cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {t('library.tagging.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
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
import { cn } from '@/lib/utils';

interface CollectionManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionManagerDialog({ open, onOpenChange }: CollectionManagerDialogProps) {
  const { t } = useTranslation('pages');
  const { collections, createCollection, renameCollection, deleteCollection } = useHistory();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetEditor = () => {
    setEditingId(null);
    setEditingName('');
    setError(null);
  };

  const handleCreate = async () => {
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createCollection(newName.trim(), null);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.collections.errors.create'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRename = async () => {
    if (!editingId || !editingName.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await renameCollection(editingId, editingName.trim());
      resetEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.collections.errors.rename'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (collectionId: string, name: string) => {
    if (!confirm(t('library.collections.deleteConfirm', { name }))) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteCollection(collectionId);
      if (editingId === collectionId) {
        resetEditor();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('library.collections.errors.delete'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('library.collections.managerTitle')}</DialogTitle>
          <DialogDescription>{t('library.collections.managerDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t('library.collections.newPlaceholder')}
                className="bg-background/70"
              />
              <Button onClick={() => void handleCreate()} disabled={submitting || !newName.trim()}>
                <Plus className="w-4 h-4" />
                {t('library.collections.create')}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
            {collections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                {t('library.collections.empty')}
              </div>
            ) : (
              collections.map((collection) => {
                const isEditing = editingId === collection.id;

                return (
                  <div
                    key={collection.id}
                    className="rounded-lg border border-border/50 bg-background/60 p-3"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="bg-background"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleRename()}
                            disabled={submitting || !editingName.trim()}
                          >
                            {t('library.item.renameSave')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetEditor}
                            disabled={submitting}
                          >
                            <X className="w-4 h-4" />
                            {t('library.item.renameCancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex h-2.5 w-2.5 rounded-full bg-amber-500/80',
                                collection.color && 'ring-1 ring-border/50',
                              )}
                              style={
                                collection.color ? { backgroundColor: collection.color } : undefined
                              }
                            />
                            <p className="truncate text-sm font-medium">{collection.name}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('library.collections.itemCount', {
                              count: collection.itemCount ?? 0,
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingId(collection.id);
                              setEditingName(collection.name);
                              setError(null);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                            {t('library.collections.rename')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            onClick={() => void handleDelete(collection.id, collection.name)}
                            disabled={submitting}
                          >
                            <Trash2 className="w-4 h-4" />
                            {t('library.collections.delete')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

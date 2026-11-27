// Queue mutations are centralized in creator-processing.ts. Refresh on those
// mutations instead of repeatedly reading historical jobs and probing files.
const listeners = new Set<() => void>();

export function notifyCreatorQueueChanged(): void {
  for (const listener of listeners) listener();
}

export function watchCreatorQueue(refresh: () => Promise<void>): () => void {
  let disposed = false;
  let refreshing = false;
  let dirty = false;
  const run = async () => {
    dirty = true;
    if (refreshing) return;
    refreshing = true;
    try {
      // Changes during an in-flight read require one further read. Never let
      // overlapping requests overwrite the final state with an older response.
      while (dirty && !disposed) {
        dirty = false;
        try {
          await refresh();
        } catch (error) {
          console.error('Cannot refresh creator queue:', error);
        }
      }
    } finally {
      refreshing = false;
    }
  };
  const changed = () => void run();
  listeners.add(changed);
  changed();
  return () => {
    disposed = true;
    listeners.delete(changed);
  };
}

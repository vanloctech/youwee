import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import {
  createEmptyEntry,
  generateEntryId,
  parseSubtitles,
  reindexEntries,
  type SubtitleEntry,
  serializeSubtitles,
  sortEntries,
} from '@/lib/subtitle-parser';
import type { SubtitleFormat } from '@/lib/types';

// ---- Undo/Redo ----

interface HistoryState {
  entries: SubtitleEntry[];
  label: string; // description for undo menu
}

const MAX_UNDO_HISTORY = 50;

// ---- Context Value ----

interface SubtitleContextValue {
  // State
  isWorkspaceOpen: boolean;
  entries: SubtitleEntry[];
  format: SubtitleFormat;
  assHeader: string | undefined;
  filePath: string | null;
  fileName: string | null;
  isDirty: boolean;
  selectedIds: Set<string>;
  activeEntryId: string | null;

  // Video sync
  videoPath: string | null;
  videoCurrentTime: number; // ms
  videoDurationMs: number;
  isVideoPlaying: boolean;

  // Translator mode
  isTranslatorMode: boolean;
  translationSourceMap: Record<string, string> | null;

  // Undo/Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // File operations
  loadFromContent: (content: string, filename: string, format?: SubtitleFormat) => void;
  loadFromFile: (
    entries: SubtitleEntry[],
    format: SubtitleFormat,
    filePath: string,
    assHeader?: string,
  ) => void;
  createNew: () => void;
  closeFile: () => void;
  getSerializedContent: () => string;
  setFormat: (format: SubtitleFormat) => void;
  setFilePath: (path: string | null) => void;
  markSaved: () => void;

  // Entry operations
  updateEntry: (id: string, updates: Partial<SubtitleEntry>) => void;
  updateEntries: (updates: Array<{ id: string; changes: Partial<SubtitleEntry> }>) => void;
  insertEntry: (afterId: string | null, entry?: Partial<SubtitleEntry>) => SubtitleEntry;
  insertEntryBefore: (beforeId: string, entry?: Partial<SubtitleEntry>) => SubtitleEntry;
  deleteEntries: (ids: string[]) => void;
  replaceAllEntries: (entries: SubtitleEntry[], label?: string) => void;
  sortByTime: () => void;

  // Selection
  selectEntry: (id: string, multi?: boolean) => void;
  selectRange: (fromId: string, toId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  setActiveEntry: (id: string | null) => void;

  // Video
  setVideoPath: (path: string | null) => void;
  setVideoCurrentTime: (ms: number) => void;
  setVideoDurationMs: (ms: number) => void;
  setIsVideoPlaying: (playing: boolean) => void;

  // Translator mode
  captureTranslationSource: (ids?: string[]) => void;
  clearTranslationSource: () => void;
  setTranslatorMode: (enabled: boolean) => void;

  // Merge/Split
  mergeEntries: (ids: string[]) => void;
  splitEntry: (id: string, splitTimeMs: number) => void;
}

const SubtitleContext = createContext<SubtitleContextValue | null>(null);

// ---- Provider ----

export function SubtitleProvider({ children }: { children: ReactNode }) {
  // Core state
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [entries, setEntries] = useState<SubtitleEntry[]>([]);
  const [format, setFormatState] = useState<SubtitleFormat>('srt');
  const [assHeader, setAssHeader] = useState<string | undefined>(undefined);
  const [filePath, setFilePathState] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  // Video state
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Translator mode
  const [isTranslatorMode, setIsTranslatorMode] = useState(false);
  const [translationSourceMap, setTranslationSourceMap] = useState<Record<string, string> | null>(
    null,
  );

  // Undo/Redo
  const undoStack = useRef<HistoryState[]>([]);
  const redoStack = useRef<HistoryState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushUndo = useCallback(
    (label: string) => {
      undoStack.current.push({ entries: [...entries], label });
      if (undoStack.current.length > MAX_UNDO_HISTORY) {
        undoStack.current.shift();
      }
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);
    },
    [entries],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push({ entries: [...entries], label: prev.label });
    setEntries(prev.entries);
    setIsDirty(true);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, [entries]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ entries: [...entries], label: next.label });
    setEntries(next.entries);
    setIsDirty(true);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, [entries]);

  // File operations
  const loadFromContent = useCallback((content: string, filename: string, fmt?: SubtitleFormat) => {
    const result = parseSubtitles(content, fmt);
    setIsWorkspaceOpen(true);
    setEntries(result.entries);
    setFormatState(result.format);
    setAssHeader(result.assHeader);
    setFileName(filename);
    setFilePathState(null);
    setIsDirty(false);
    setSelectedIds(new Set());
    setActiveEntryId(null);
    setIsTranslatorMode(false);
    setTranslationSourceMap(null);
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const loadFromFile = useCallback(
    (newEntries: SubtitleEntry[], fmt: SubtitleFormat, path: string, header?: string) => {
      setIsWorkspaceOpen(true);
      setEntries(newEntries);
      setFormatState(fmt);
      setAssHeader(header);
      setFilePathState(path);
      const name = path.split('/').pop() || path.split('\\').pop() || path;
      setFileName(name);
      setIsDirty(false);
      setSelectedIds(new Set());
      setActiveEntryId(null);
      setIsTranslatorMode(false);
      setTranslationSourceMap(null);
      undoStack.current = [];
      redoStack.current = [];
      setCanUndo(false);
      setCanRedo(false);
    },
    [],
  );

  const createNew = useCallback(() => {
    const firstEntry = createEmptyEntry(0, 2000, 1);
    setIsWorkspaceOpen(true);
    setEntries([firstEntry]);
    setFormatState('srt');
    setAssHeader(undefined);
    setFilePathState(null);
    setFileName(null);
    setIsDirty(false);
    setSelectedIds(new Set([firstEntry.id]));
    setActiveEntryId(firstEntry.id);
    setVideoPath(null);
    setVideoCurrentTime(0);
    setVideoDurationMs(0);
    setIsVideoPlaying(false);
    setIsTranslatorMode(false);
    setTranslationSourceMap(null);
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const closeFile = useCallback(() => {
    setIsWorkspaceOpen(false);
    setEntries([]);
    setFormatState('srt');
    setAssHeader(undefined);
    setFilePathState(null);
    setFileName(null);
    setIsDirty(false);
    setSelectedIds(new Set());
    setActiveEntryId(null);
    setVideoPath(null);
    setVideoCurrentTime(0);
    setVideoDurationMs(0);
    setIsVideoPlaying(false);
    setIsTranslatorMode(false);
    setTranslationSourceMap(null);
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const getSerializedContent = useCallback(() => {
    return serializeSubtitles(entries, format, assHeader);
  }, [entries, format, assHeader]);

  const setFormat = useCallback((fmt: SubtitleFormat) => {
    setFormatState(fmt);
    setIsDirty(true);
  }, []);

  const setFilePath = useCallback((path: string | null) => {
    setFilePathState(path);
    if (path) {
      const name = path.split('/').pop() || path.split('\\').pop() || path;
      setFileName(name);
    }
  }, []);

  const markSaved = useCallback(() => {
    setIsDirty(false);
  }, []);

  // Entry operations
  const updateEntry = useCallback(
    (id: string, updates: Partial<SubtitleEntry>) => {
      pushUndo('Edit entry');
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
      setIsDirty(true);
    },
    [pushUndo],
  );

  const updateEntries = useCallback(
    (updates: Array<{ id: string; changes: Partial<SubtitleEntry> }>) => {
      pushUndo('Edit entries');
      const updateMap = new Map(updates.map((u) => [u.id, u.changes]));
      setEntries((prev) =>
        prev.map((e) => {
          const changes = updateMap.get(e.id);
          return changes ? { ...e, ...changes } : e;
        }),
      );
      setIsDirty(true);
    },
    [pushUndo],
  );

  const insertEntry = useCallback(
    (afterId: string | null, partial?: Partial<SubtitleEntry>): SubtitleEntry => {
      pushUndo('Insert entry');

      let insertIdx = entries.length;
      let startTime = 0;

      if (afterId) {
        const afterIdx = entries.findIndex((e) => e.id === afterId);
        if (afterIdx >= 0) {
          insertIdx = afterIdx + 1;
          startTime = entries[afterIdx].endTime + 100; // 100ms gap
        }
      } else if (entries.length > 0) {
        startTime = entries[entries.length - 1].endTime + 100;
      }

      const newEntry: SubtitleEntry = {
        ...createEmptyEntry(startTime),
        ...partial,
        id: partial?.id || generateEntryId(),
      };

      setEntries((prev) => {
        const next = [...prev];
        next.splice(insertIdx, 0, newEntry);
        return reindexEntries(next);
      });
      setIsDirty(true);
      setActiveEntryId(newEntry.id);
      return newEntry;
    },
    [entries, pushUndo],
  );

  const insertEntryBefore = useCallback(
    (beforeId: string, partial?: Partial<SubtitleEntry>): SubtitleEntry => {
      pushUndo('Insert entry before');

      const beforeIdx = entries.findIndex((e) => e.id === beforeId);
      const insertIdx = beforeIdx >= 0 ? beforeIdx : 0;

      let startTime = 0;
      if (beforeIdx > 0) {
        startTime = entries[beforeIdx - 1].endTime + 100;
      } else if (beforeIdx === 0) {
        startTime = Math.max(0, entries[0].startTime - 2100);
      }

      const newEntry: SubtitleEntry = {
        ...createEmptyEntry(startTime),
        ...partial,
        id: partial?.id || generateEntryId(),
      };

      setEntries((prev) => {
        const next = [...prev];
        next.splice(insertIdx, 0, newEntry);
        return reindexEntries(next);
      });
      setIsDirty(true);
      setActiveEntryId(newEntry.id);
      return newEntry;
    },
    [entries, pushUndo],
  );

  const deleteEntries = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      pushUndo('Delete entries');
      const idSet = new Set(ids);
      setEntries((prev) => reindexEntries(prev.filter((e) => !idSet.has(e.id))));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      if (activeEntryId && ids.includes(activeEntryId)) {
        setActiveEntryId(null);
      }
      setIsDirty(true);
    },
    [pushUndo, activeEntryId],
  );

  const replaceAllEntries = useCallback(
    (newEntries: SubtitleEntry[], label = 'Replace all') => {
      pushUndo(label);
      setEntries(reindexEntries(newEntries));
      setIsDirty(true);
    },
    [pushUndo],
  );

  const sortByTime = useCallback(() => {
    pushUndo('Sort by time');
    setEntries((prev) => sortEntries(prev));
    setIsDirty(true);
  }, [pushUndo]);

  // Selection
  const selectEntry = useCallback((id: string, multi = false) => {
    if (multi) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
    setActiveEntryId(id);
  }, []);

  const selectRange = useCallback(
    (fromId: string, toId: string) => {
      const fromIdx = entries.findIndex((e) => e.id === fromId);
      const toIdx = entries.findIndex((e) => e.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;

      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const ids = new Set<string>();
      for (let i = start; i <= end; i++) {
        ids.add(entries[i].id);
      }
      setSelectedIds(ids);
      setActiveEntryId(toId);
    },
    [entries],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(entries.map((e) => e.id)));
  }, [entries]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const setActiveEntry = useCallback((id: string | null) => {
    setActiveEntryId(id);
  }, []);

  const captureTranslationSource = useCallback(
    (ids?: string[]) => {
      const idSet = ids && ids.length > 0 ? new Set(ids) : null;
      const map: Record<string, string> = {};
      for (const entry of entries) {
        if (!idSet || idSet.has(entry.id)) {
          map[entry.id] = entry.text;
        }
      }
      if (Object.keys(map).length === 0) return;
      setTranslationSourceMap(map);
      setIsTranslatorMode(true);
    },
    [entries],
  );

  const clearTranslationSource = useCallback(() => {
    setTranslationSourceMap(null);
    setIsTranslatorMode(false);
  }, []);

  const setTranslatorMode = useCallback(
    (enabled: boolean) => {
      setIsTranslatorMode((prev) => {
        if (enabled && !translationSourceMap) {
          return prev;
        }
        return enabled;
      });
    },
    [translationSourceMap],
  );

  // Merge/Split
  const mergeEntries = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;
      pushUndo('Merge entries');

      const toMerge = entries
        .filter((e) => ids.includes(e.id))
        .sort((a, b) => a.startTime - b.startTime);

      if (toMerge.length < 2) return;

      const merged: SubtitleEntry = {
        id: toMerge[0].id,
        index: toMerge[0].index,
        startTime: toMerge[0].startTime,
        endTime: toMerge[toMerge.length - 1].endTime,
        text: toMerge.map((e) => e.text).join('\n'),
      };

      const mergedIds = new Set(ids);
      setEntries((prev) => {
        const result: SubtitleEntry[] = [];
        let inserted = false;
        for (const e of prev) {
          if (e.id === toMerge[0].id) {
            result.push(merged);
            inserted = true;
          } else if (!mergedIds.has(e.id)) {
            result.push(e);
          }
        }
        if (!inserted) result.push(merged);
        return reindexEntries(result);
      });
      setSelectedIds(new Set([merged.id]));
      setActiveEntryId(merged.id);
      setIsDirty(true);
    },
    [entries, pushUndo],
  );

  const splitEntry = useCallback(
    (id: string, splitTimeMs: number) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      if (splitTimeMs <= entry.startTime || splitTimeMs >= entry.endTime) return;

      pushUndo('Split entry');

      const firstHalf: SubtitleEntry = {
        ...entry,
        endTime: splitTimeMs,
      };

      const secondHalf: SubtitleEntry = {
        id: generateEntryId(),
        index: entry.index + 1,
        startTime: splitTimeMs,
        endTime: entry.endTime,
        text: entry.text, // User can edit later
      };

      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === id);
        if (idx < 0) return prev;
        const next = [...prev];
        next.splice(idx, 1, firstHalf, secondHalf);
        return reindexEntries(next);
      });
      setIsDirty(true);
    },
    [entries, pushUndo],
  );

  const value: SubtitleContextValue = {
    isWorkspaceOpen,
    entries,
    format,
    assHeader,
    filePath,
    fileName,
    isDirty,
    selectedIds,
    activeEntryId,
    videoPath,
    videoCurrentTime,
    videoDurationMs,
    isVideoPlaying,
    isTranslatorMode,
    translationSourceMap,
    canUndo,
    canRedo,
    undo,
    redo,
    loadFromContent,
    loadFromFile,
    createNew,
    closeFile,
    getSerializedContent,
    setFormat,
    setFilePath,
    markSaved,
    updateEntry,
    updateEntries,
    insertEntry,
    insertEntryBefore,
    deleteEntries,
    replaceAllEntries,
    sortByTime,
    selectEntry,
    selectRange,
    selectAll,
    deselectAll,
    setActiveEntry,
    setVideoPath,
    setVideoCurrentTime,
    setVideoDurationMs,
    setIsVideoPlaying,
    captureTranslationSource,
    clearTranslationSource,
    setTranslatorMode,
    mergeEntries,
    splitEntry,
  };

  return <SubtitleContext.Provider value={value}>{children}</SubtitleContext.Provider>;
}

export function useSubtitle() {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within SubtitleProvider');
  }
  return context;
}

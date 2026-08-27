import { createClientId } from '@/lib/client-id';
import type { ItemDownloadSettings } from '@/lib/types';
import { sanitizeYtdlpAdvancedOptions } from '@/lib/ytdlp-advanced-options';

/**
 * Named yt-dlp option presets (P0-2 A5).
 * Stored in localStorage under `youwee-ytdlp-presets` (max 20 entries).
 * A preset is a sanitized subset of the per-item yt-dlp settings:
 * `ytdlpAdvancedOptionsEnabled`, `ytdlpAdvancedOptions`, `rawArgs`.
 */

const STORAGE_KEY = 'youwee-ytdlp-presets';
const MAX_PRESETS = 20;
const MAX_RAW_ARGS_LENGTH = 4000;

export interface YtdlpPreset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: YtdlpPresetSettings;
}

export type YtdlpPresetSettings = Partial<
  Pick<ItemDownloadSettings, 'ytdlpAdvancedOptionsEnabled' | 'ytdlpAdvancedOptions' | 'rawArgs'>
>;

export function sanitizeYtdlpPresetSettings(value: unknown): YtdlpPresetSettings {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const settings: YtdlpPresetSettings = {};
  if (candidate.ytdlpAdvancedOptionsEnabled === true) {
    settings.ytdlpAdvancedOptionsEnabled = true;
  }
  const options = sanitizeYtdlpAdvancedOptions(candidate.ytdlpAdvancedOptions);
  if (options.length > 0) {
    settings.ytdlpAdvancedOptions = options;
  }
  if (typeof candidate.rawArgs === 'string' && candidate.rawArgs.trim()) {
    settings.rawArgs = candidate.rawArgs.trim().slice(0, MAX_RAW_ARGS_LENGTH);
  }
  return settings;
}

function sanitizePresetEntry(entry: unknown): YtdlpPreset | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) return null;
  const settings = sanitizeYtdlpPresetSettings(candidate.settings);
  if (Object.keys(settings).length === 0) return null;
  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createClientId('preset'),
    name: candidate.name.trim().slice(0, 80),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    settings,
  };
}

export function loadYtdlpPresets(): YtdlpPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizePresetEntry)
      .filter((preset): preset is YtdlpPreset => preset !== null)
      .slice(0, MAX_PRESETS);
  } catch (error) {
    console.error('Failed to load yt-dlp presets:', error);
    return [];
  }
}

function persistPresets(presets: YtdlpPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
  } catch (error) {
    console.error('Failed to save yt-dlp presets:', error);
  }
}

/** Saves (or updates by name) a preset. Returns the saved preset, or null if rejected (empty settings / over limit). */
export function saveYtdlpPreset(name: string, settings: YtdlpPresetSettings): YtdlpPreset | null {
  const sanitized = sanitizeYtdlpPresetSettings(settings);
  if (Object.keys(sanitized).length === 0) return null;
  const presetName = name.trim().slice(0, 80) || 'Untitled preset';
  const now = Date.now();

  const presets = loadYtdlpPresets();
  const existing = presets.find((preset) => preset.name.toLowerCase() === presetName.toLowerCase());
  if (existing) {
    const updated: YtdlpPreset = { ...existing, name: presetName, updatedAt: now, settings: sanitized };
    persistPresets(presets.map((preset) => (preset.id === existing.id ? updated : preset)));
    return updated;
  }

  const created: YtdlpPreset = {
    id: createClientId('preset'),
    name: presetName,
    createdAt: now,
    updatedAt: now,
    settings: sanitized,
  };
  const next = [...presets, created];
  // Drop oldest when over the cap.
  if (next.length > MAX_PRESETS) {
    next.sort((a, b) => a.createdAt - b.createdAt);
    next.splice(0, next.length - MAX_PRESETS);
  }
  persistPresets(next);
  return created;
}

export function deleteYtdlpPreset(id: string): void {
  const presets = loadYtdlpPresets().filter((preset) => preset.id !== id);
  persistPresets(presets);
}

export function getYtdlpPresetById(id: string): YtdlpPreset | null {
  return loadYtdlpPresets().find((preset) => preset.id === id) ?? null;
}

export const YTDLP_PRESET_LIMITS = { max: MAX_PRESETS, maxRawArgsLength: MAX_RAW_ARGS_LENGTH } as const;

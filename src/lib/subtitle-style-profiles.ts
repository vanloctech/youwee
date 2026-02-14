import type { SubtitleQcThresholds } from '@/lib/subtitle-qc';

export type SubtitleStyleProfileId = 'youtube' | 'netflix' | 'broadcast' | 'shortform';

export interface SubtitleStyleProfile {
  id: SubtitleStyleProfileId;
  labelKey: string;
  descriptionKey: string;
  thresholds: SubtitleQcThresholds;
}

export const SUBTITLE_STYLE_PROFILES: SubtitleStyleProfile[] = [
  {
    id: 'youtube',
    labelKey: 'styleProfiles.youtube.label',
    descriptionKey: 'styleProfiles.youtube.description',
    thresholds: {
      maxCps: 21,
      maxWpm: 190,
      maxCpl: 42,
      minDurationMs: 700,
      maxDurationMs: 7000,
      minGapMs: 80,
    },
  },
  {
    id: 'netflix',
    labelKey: 'styleProfiles.netflix.label',
    descriptionKey: 'styleProfiles.netflix.description',
    thresholds: {
      maxCps: 20,
      maxWpm: 180,
      maxCpl: 42,
      minDurationMs: 833,
      maxDurationMs: 7000,
      minGapMs: 83,
    },
  },
  {
    id: 'broadcast',
    labelKey: 'styleProfiles.broadcast.label',
    descriptionKey: 'styleProfiles.broadcast.description',
    thresholds: {
      maxCps: 18,
      maxWpm: 170,
      maxCpl: 37,
      minDurationMs: 1000,
      maxDurationMs: 6000,
      minGapMs: 120,
    },
  },
  {
    id: 'shortform',
    labelKey: 'styleProfiles.shortform.label',
    descriptionKey: 'styleProfiles.shortform.description',
    thresholds: {
      maxCps: 24,
      maxWpm: 210,
      maxCpl: 48,
      minDurationMs: 600,
      maxDurationMs: 5000,
      minGapMs: 60,
    },
  },
];

export const DEFAULT_SUBTITLE_STYLE_PROFILE_ID: SubtitleStyleProfileId = 'youtube';

export function getSubtitleStyleProfile(id: SubtitleStyleProfileId): SubtitleStyleProfile {
  return SUBTITLE_STYLE_PROFILES.find((profile) => profile.id === id) || SUBTITLE_STYLE_PROFILES[0];
}

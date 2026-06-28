import type { YtdlpAdvancedOption, YtdlpAdvancedOptionId } from '@/lib/types';

export type YtdlpAdvancedOptionValueType =
  | 'boolean'
  | 'text'
  | 'number'
  | 'size'
  | 'url'
  | 'country'
  | 'header'
  | 'select';

export type YtdlpAdvancedOptionSecurityLevel = 'standard' | 'advanced';

export interface YtdlpAdvancedOptionDefinition {
  id: YtdlpAdvancedOptionId;
  ytDlpFlag: string;
  valueType: YtdlpAdvancedOptionValueType;
  descriptionKey: string;
  placeholderKey?: string;
  securityLevel: YtdlpAdvancedOptionSecurityLevel;
  options?: readonly string[];
  conflictsWith?: readonly YtdlpAdvancedOptionId[];
  repeatable?: boolean;
}

export const YTDLP_ADVANCED_OPTION_DEFINITIONS: readonly YtdlpAdvancedOptionDefinition[] = [
  {
    id: 'impersonate',
    ytDlpFlag: '--impersonate',
    valueType: 'text',
    descriptionKey: 'download.ytdlpAdvanced.option.impersonateDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.impersonate',
    securityLevel: 'standard',
  },
  {
    id: 'forceIpv4',
    ytDlpFlag: '--force-ipv4',
    valueType: 'boolean',
    descriptionKey: 'download.ytdlpAdvanced.option.forceIpv4Desc',
    securityLevel: 'standard',
    conflictsWith: ['forceIpv6'],
  },
  {
    id: 'forceIpv6',
    ytDlpFlag: '--force-ipv6',
    valueType: 'boolean',
    descriptionKey: 'download.ytdlpAdvanced.option.forceIpv6Desc',
    securityLevel: 'standard',
    conflictsWith: ['forceIpv4'],
  },
  {
    id: 'socketTimeout',
    ytDlpFlag: '--socket-timeout',
    valueType: 'number',
    descriptionKey: 'download.ytdlpAdvanced.option.socketTimeoutDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.seconds',
    securityLevel: 'standard',
  },
  {
    id: 'userAgent',
    ytDlpFlag: '--user-agent',
    valueType: 'text',
    descriptionKey: 'download.ytdlpAdvanced.option.userAgentDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.userAgent',
    securityLevel: 'advanced',
  },
  {
    id: 'referer',
    ytDlpFlag: '--referer',
    valueType: 'url',
    descriptionKey: 'download.ytdlpAdvanced.option.refererDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.url',
    securityLevel: 'advanced',
  },
  {
    id: 'addHeaders',
    ytDlpFlag: '--add-headers',
    valueType: 'header',
    descriptionKey: 'download.ytdlpAdvanced.option.addHeadersDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.headerName',
    securityLevel: 'advanced',
    repeatable: true,
  },
  {
    id: 'sleepRequests',
    ytDlpFlag: '--sleep-requests',
    valueType: 'number',
    descriptionKey: 'download.ytdlpAdvanced.option.sleepRequestsDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.seconds',
    securityLevel: 'standard',
  },
  {
    id: 'sleepInterval',
    ytDlpFlag: '--sleep-interval',
    valueType: 'number',
    descriptionKey: 'download.ytdlpAdvanced.option.sleepIntervalDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.seconds',
    securityLevel: 'standard',
  },
  {
    id: 'maxSleepInterval',
    ytDlpFlag: '--max-sleep-interval',
    valueType: 'number',
    descriptionKey: 'download.ytdlpAdvanced.option.maxSleepIntervalDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.seconds',
    securityLevel: 'standard',
  },
  {
    id: 'concurrentFragments',
    ytDlpFlag: '--concurrent-fragments',
    valueType: 'number',
    descriptionKey: 'download.ytdlpAdvanced.option.concurrentFragmentsDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.fragments',
    securityLevel: 'standard',
  },
  {
    id: 'throttledRate',
    ytDlpFlag: '--throttled-rate',
    valueType: 'size',
    descriptionKey: 'download.ytdlpAdvanced.option.throttledRateDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.rate',
    securityLevel: 'standard',
  },
  {
    id: 'httpChunkSize',
    ytDlpFlag: '--http-chunk-size',
    valueType: 'size',
    descriptionKey: 'download.ytdlpAdvanced.option.httpChunkSizeDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.size',
    securityLevel: 'standard',
  },
  {
    id: 'geoBypass',
    ytDlpFlag: '--geo-bypass',
    valueType: 'boolean',
    descriptionKey: 'download.ytdlpAdvanced.option.geoBypassDesc',
    securityLevel: 'standard',
  },
  {
    id: 'geoBypassCountry',
    ytDlpFlag: '--geo-bypass-country',
    valueType: 'country',
    descriptionKey: 'download.ytdlpAdvanced.option.geoBypassCountryDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.country',
    securityLevel: 'standard',
  },
  {
    id: 'matchFilters',
    ytDlpFlag: '--match-filters',
    valueType: 'text',
    descriptionKey: 'download.ytdlpAdvanced.option.matchFiltersDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.matchFilters',
    securityLevel: 'advanced',
    repeatable: true,
  },
  {
    id: 'formatSort',
    ytDlpFlag: '--format-sort',
    valueType: 'text',
    descriptionKey: 'download.ytdlpAdvanced.option.formatSortDesc',
    placeholderKey: 'download.ytdlpAdvanced.placeholder.formatSort',
    securityLevel: 'advanced',
  },
  {
    id: 'youtubePlayerClient',
    ytDlpFlag: '--extractor-args',
    valueType: 'select',
    descriptionKey: 'download.ytdlpAdvanced.option.youtubePlayerClientDesc',
    securityLevel: 'advanced',
    options: ['web', 'mweb', 'tv', 'ios', 'android', 'web_safari'],
  },
] as const;

export const YTDLP_ADVANCED_OPTION_IDS = new Set<YtdlpAdvancedOptionId>(
  YTDLP_ADVANCED_OPTION_DEFINITIONS.map((definition) => definition.id),
);

export function getYtdlpAdvancedOptionDefinition(id: YtdlpAdvancedOptionId) {
  return YTDLP_ADVANCED_OPTION_DEFINITIONS.find((definition) => definition.id === id);
}

export function sanitizeYtdlpAdvancedOptions(value: unknown): YtdlpAdvancedOption[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): YtdlpAdvancedOption[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<YtdlpAdvancedOption>;
    if (!candidate.id || !YTDLP_ADVANCED_OPTION_IDS.has(candidate.id)) return [];

    return [
      {
        id: candidate.id,
        ...(typeof candidate.value === 'string' ? { value: candidate.value } : {}),
        ...(typeof candidate.secondaryValue === 'string'
          ? { secondaryValue: candidate.secondaryValue }
          : {}),
      },
    ];
  });
}

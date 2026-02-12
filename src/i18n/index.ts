import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import enChannels from './locales/en/channels.json';
// Import translations
import enCommon from './locales/en/common.json';
import enDownload from './locales/en/download.json';
import enMetadata from './locales/en/metadata.json';
import enPages from './locales/en/pages.json';
import enSettings from './locales/en/settings.json';
import enUniversal from './locales/en/universal.json';
import viChannels from './locales/vi/channels.json';
import viCommon from './locales/vi/common.json';
import viDownload from './locales/vi/download.json';
import viMetadata from './locales/vi/metadata.json';
import viPages from './locales/vi/pages.json';
import viSettings from './locales/vi/settings.json';
import viUniversal from './locales/vi/universal.json';
import zhCNChannels from './locales/zh-CN/channels.json';
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNDownload from './locales/zh-CN/download.json';
import zhCNMetadata from './locales/zh-CN/metadata.json';
import zhCNPages from './locales/zh-CN/pages.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNUniversal from './locales/zh-CN/universal.json';

const resources = {
  en: {
    common: enCommon,
    channels: enChannels,
    download: enDownload,
    metadata: enMetadata,
    universal: enUniversal,
    pages: enPages,
    settings: enSettings,
  },
  vi: {
    common: viCommon,
    channels: viChannels,
    download: viDownload,
    metadata: viMetadata,
    universal: viUniversal,
    pages: viPages,
    settings: viSettings,
  },
  'zh-CN': {
    common: zhCNCommon,
    channels: zhCNChannels,
    download: zhCNDownload,
    metadata: zhCNMetadata,
    universal: zhCNUniversal,
    pages: zhCNPages,
    settings: zhCNSettings,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'channels', 'download', 'metadata', 'universal', 'pages', 'settings'],

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

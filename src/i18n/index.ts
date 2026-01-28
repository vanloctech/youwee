import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// Import translations
import enCommon from './locales/en/common.json';
import enDownload from './locales/en/download.json';
import enPages from './locales/en/pages.json';
import enSettings from './locales/en/settings.json';
import enUniversal from './locales/en/universal.json';
import viCommon from './locales/vi/common.json';
import viDownload from './locales/vi/download.json';
import viPages from './locales/vi/pages.json';
import viSettings from './locales/vi/settings.json';
import viUniversal from './locales/vi/universal.json';
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNDownload from './locales/zh-CN/download.json';
import zhCNPages from './locales/zh-CN/pages.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNUniversal from './locales/zh-CN/universal.json';

const resources = {
  en: {
    common: enCommon,
    download: enDownload,
    universal: enUniversal,
    pages: enPages,
    settings: enSettings,
  },
  vi: {
    common: viCommon,
    download: viDownload,
    universal: viUniversal,
    pages: viPages,
    settings: viSettings,
  },
  'zh-CN': {
    common: zhCNCommon,
    download: zhCNDownload,
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
    ns: ['common', 'download', 'universal', 'pages', 'settings'],

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

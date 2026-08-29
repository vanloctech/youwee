import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import arChannels from './locales/ar/channels.json';
import arCommon from './locales/ar/common.json';
import arDownload from './locales/ar/download.json';
import arGallery from './locales/ar/gallery.json';
import arMetadata from './locales/ar/metadata.json';
import arPages from './locales/ar/pages.json';
import arSettings from './locales/ar/settings.json';
import arSubtitles from './locales/ar/subtitles.json';
import arUniversal from './locales/ar/universal.json';
import enChannels from './locales/en/channels.json';
// Import translations
import enCommon from './locales/en/common.json';
import enDownload from './locales/en/download.json';
import enGallery from './locales/en/gallery.json';
import enMetadata from './locales/en/metadata.json';
import enPages from './locales/en/pages.json';
import enSettings from './locales/en/settings.json';
import enSubtitles from './locales/en/subtitles.json';
import enUniversal from './locales/en/universal.json';
import esChannels from './locales/es/channels.json';
import esCommon from './locales/es/common.json';
import esDownload from './locales/es/download.json';
import esGallery from './locales/es/gallery.json';
import esMetadata from './locales/es/metadata.json';
import esPages from './locales/es/pages.json';
import esSettings from './locales/es/settings.json';
import esSubtitles from './locales/es/subtitles.json';
import esUniversal from './locales/es/universal.json';
import faChannels from './locales/fa/channels.json';
import faCommon from './locales/fa/common.json';
import faDownload from './locales/fa/download.json';
import faGallery from './locales/fa/gallery.json';
import faMetadata from './locales/fa/metadata.json';
import faPages from './locales/fa/pages.json';
import faSettings from './locales/fa/settings.json';
import faSubtitles from './locales/fa/subtitles.json';
import faUniversal from './locales/fa/universal.json';
import frChannels from './locales/fr/channels.json';
import frCommon from './locales/fr/common.json';
import frDownload from './locales/fr/download.json';
import frGallery from './locales/fr/gallery.json';
import frMetadata from './locales/fr/metadata.json';
import frPages from './locales/fr/pages.json';
import frSettings from './locales/fr/settings.json';
import frSubtitles from './locales/fr/subtitles.json';
import frUniversal from './locales/fr/universal.json';
import jaChannels from './locales/ja/channels.json';
import jaCommon from './locales/ja/common.json';
import jaDownload from './locales/ja/download.json';
import jaGallery from './locales/ja/gallery.json';
import jaMetadata from './locales/ja/metadata.json';
import jaPages from './locales/ja/pages.json';
import jaSettings from './locales/ja/settings.json';
import jaSubtitles from './locales/ja/subtitles.json';
import jaUniversal from './locales/ja/universal.json';
import ptChannels from './locales/pt/channels.json';
import ptCommon from './locales/pt/common.json';
import ptDownload from './locales/pt/download.json';
import ptGallery from './locales/pt/gallery.json';
import ptMetadata from './locales/pt/metadata.json';
import ptPages from './locales/pt/pages.json';
import ptSettings from './locales/pt/settings.json';
import ptSubtitles from './locales/pt/subtitles.json';
import ptUniversal from './locales/pt/universal.json';
import roChannels from './locales/ro/channels.json';
import roCommon from './locales/ro/common.json';
import roDownload from './locales/ro/download.json';
import roGallery from './locales/ro/gallery.json';
import roMetadata from './locales/ro/metadata.json';
import roPages from './locales/ro/pages.json';
import roSettings from './locales/ro/settings.json';
import roSubtitles from './locales/ro/subtitles.json';
import roUniversal from './locales/ro/universal.json';

import ruChannels from './locales/ru/channels.json';
import ruCommon from './locales/ru/common.json';
import ruDownload from './locales/ru/download.json';
import ruGallery from './locales/ru/gallery.json';
import ruMetadata from './locales/ru/metadata.json';
import ruPages from './locales/ru/pages.json';
import ruSettings from './locales/ru/settings.json';
import ruSubtitles from './locales/ru/subtitles.json';
import ruUniversal from './locales/ru/universal.json';
import thChannels from './locales/th/channels.json';
import thCommon from './locales/th/common.json';
import thDownload from './locales/th/download.json';
import thGallery from './locales/th/gallery.json';
import thMetadata from './locales/th/metadata.json';
import thPages from './locales/th/pages.json';
import thSettings from './locales/th/settings.json';
import thSubtitles from './locales/th/subtitles.json';
import thUniversal from './locales/th/universal.json';
import trChannels from './locales/tr/channels.json';
import trCommon from './locales/tr/common.json';
import trDownload from './locales/tr/download.json';
import trGallery from './locales/tr/gallery.json';
import trMetadata from './locales/tr/metadata.json';
import trPages from './locales/tr/pages.json';
import trSettings from './locales/tr/settings.json';
import trSubtitles from './locales/tr/subtitles.json';
import trUniversal from './locales/tr/universal.json';
import uzChannels from './locales/uz/channels.json';
import uzCommon from './locales/uz/common.json';
import uzDownload from './locales/uz/download.json';
import uzGallery from './locales/uz/gallery.json';
import uzMetadata from './locales/uz/metadata.json';
import uzPages from './locales/uz/pages.json';
import uzSettings from './locales/uz/settings.json';
import uzSubtitles from './locales/uz/subtitles.json';
import uzUniversal from './locales/uz/universal.json';
import viChannels from './locales/vi/channels.json';
import viCommon from './locales/vi/common.json';
import viDownload from './locales/vi/download.json';
import viGallery from './locales/vi/gallery.json';
import viMetadata from './locales/vi/metadata.json';
import viPages from './locales/vi/pages.json';
import viSettings from './locales/vi/settings.json';
import viSubtitles from './locales/vi/subtitles.json';
import viUniversal from './locales/vi/universal.json';
import zhCNChannels from './locales/zh-CN/channels.json';
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNDownload from './locales/zh-CN/download.json';
import zhCNGallery from './locales/zh-CN/gallery.json';
import zhCNMetadata from './locales/zh-CN/metadata.json';
import zhCNPages from './locales/zh-CN/pages.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNSubtitles from './locales/zh-CN/subtitles.json';
import zhCNUniversal from './locales/zh-CN/universal.json';

const resources = {
  ar: {
    common: arCommon,
    channels: arChannels,
    download: arDownload,
    gallery: arGallery,
    metadata: arMetadata,
    universal: arUniversal,
    pages: arPages,
    settings: arSettings,
    subtitles: arSubtitles,
  },
  fa: {
    common: faCommon,
    channels: faChannels,
    download: faDownload,
    gallery: faGallery,
    metadata: faMetadata,
    universal: faUniversal,
    pages: faPages,
    settings: faSettings,
    subtitles: faSubtitles,
  },
  en: {
    common: enCommon,
    channels: enChannels,
    download: enDownload,
    gallery: enGallery,
    metadata: enMetadata,
    universal: enUniversal,
    pages: enPages,
    settings: enSettings,
    subtitles: enSubtitles,
  },
  es: {
    common: esCommon,
    channels: esChannels,
    download: esDownload,
    gallery: esGallery,
    metadata: esMetadata,
    universal: esUniversal,
    pages: esPages,
    settings: esSettings,
    subtitles: esSubtitles,
  },
  fr: {
    common: frCommon,
    channels: frChannels,
    download: frDownload,
    gallery: frGallery,
    metadata: frMetadata,
    universal: frUniversal,
    pages: frPages,
    settings: frSettings,
    subtitles: frSubtitles,
  },
  ja: {
    common: jaCommon,
    channels: jaChannels,
    download: jaDownload,
    gallery: jaGallery,
    metadata: jaMetadata,
    universal: jaUniversal,
    pages: jaPages,
    settings: jaSettings,
    subtitles: jaSubtitles,
  },
  vi: {
    common: viCommon,
    channels: viChannels,
    download: viDownload,
    gallery: viGallery,
    metadata: viMetadata,
    universal: viUniversal,
    pages: viPages,
    settings: viSettings,
    subtitles: viSubtitles,
  },
  'zh-CN': {
    common: zhCNCommon,
    channels: zhCNChannels,
    download: zhCNDownload,
    gallery: zhCNGallery,
    metadata: zhCNMetadata,
    universal: zhCNUniversal,
    pages: zhCNPages,
    settings: zhCNSettings,
    subtitles: zhCNSubtitles,
  },
  pt: {
    common: ptCommon,
    channels: ptChannels,
    download: ptDownload,
    gallery: ptGallery,
    metadata: ptMetadata,
    universal: ptUniversal,
    pages: ptPages,
    settings: ptSettings,
    subtitles: ptSubtitles,
  },
  ro: {
    common: roCommon,
    channels: roChannels,
    download: roDownload,
    gallery: roGallery,
    metadata: roMetadata,
    universal: roUniversal,
    pages: roPages,
    settings: roSettings,
    subtitles: roSubtitles,
  },
  ru: {
    common: ruCommon,
    channels: ruChannels,
    download: ruDownload,
    gallery: ruGallery,
    metadata: ruMetadata,
    universal: ruUniversal,
    pages: ruPages,
    settings: ruSettings,
    subtitles: ruSubtitles,
  },
  th: {
    common: thCommon,
    channels: thChannels,
    download: thDownload,
    gallery: thGallery,
    metadata: thMetadata,
    universal: thUniversal,
    pages: thPages,
    settings: thSettings,
    subtitles: thSubtitles,
  },
  tr: {
    common: trCommon,
    channels: trChannels,
    download: trDownload,
    gallery: trGallery,
    metadata: trMetadata,
    universal: trUniversal,
    pages: trPages,
    settings: trSettings,
    subtitles: trSubtitles,
  },
  uz: {
    common: uzCommon,
    channels: uzChannels,
    download: uzDownload,
    gallery: uzGallery,
    metadata: uzMetadata,
    universal: uzUniversal,
    pages: uzPages,
    settings: uzSettings,
    subtitles: uzSubtitles,
  },
};

const RTL_LANGUAGES = new Set(['ar', 'fa']);

function applyDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return;

  const baseLanguage = language.toLowerCase().split('-')[0];
  document.documentElement.lang = language;
  document.documentElement.dir = RTL_LANGUAGES.has(baseLanguage) ? 'rtl' : 'ltr';
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [
      'common',
      'channels',
      'download',
      'gallery',
      'metadata',
      'universal',
      'pages',
      'settings',
      'subtitles',
    ],

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false,
    },
  });

applyDocumentLanguage(i18n.resolvedLanguage || i18n.language || 'en');
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;

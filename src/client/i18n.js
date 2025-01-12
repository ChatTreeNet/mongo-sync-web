import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import zhTranslation from './locales/zh/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslation
      },
      zh: {
        translation: zhTranslation
      }
    },
    fallbackLng: 'en',
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lng',
      lookupCookie: 'i18next',
      lookupLocalStorage: 'i18nextLng',
      lookupSessionStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
      cookieMinutes: 10080 // 7 days
    },
    load: 'languageOnly', // will strip region code, zh-CN -> zh
    lowerCaseLng: true,
    cleanCode: true,
    interpolation: {
      escapeValue: false
    },
    // Map all Chinese variants to 'zh'
    languageUtils: {
      formatLanguageCode: function(code) {
        if (code.startsWith('zh')) return 'zh';
        return code;
      }
    }
  });

// Force language detection to run again
i18n.services.languageDetector.detect();

export default i18n;

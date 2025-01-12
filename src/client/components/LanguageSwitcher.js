import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { t, i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState(i18n.language);

  useEffect(() => {
    // Normalize language code (zh-CN -> zh)
    const lang = i18n.language.startsWith('zh') ? 'zh' : 'en';
    if (currentLang !== lang) {
      setCurrentLang(lang);
      i18n.changeLanguage(lang);
    }
  }, [i18n.language]);

  const changeLanguage = (lng) => {
    setCurrentLang(lng);
    i18n.changeLanguage(lng);
  };

  return (
    <div className="language-switcher">
      <span>{t('language.title')}: </span>
      <select 
        value={currentLang} 
        onChange={(e) => changeLanguage(e.target.value)}
        className="language-select"
      >
        <option value="en">{t('language.en')}</option>
        <option value="zh">{t('language.zh')}</option>
      </select>
    </div>
  );
};

export default LanguageSwitcher;

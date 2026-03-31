import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/LanguageSwitcher.css';

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18n.language);

  // 语言代码映射
  const langCodeMap = {
    en: 'EN',
    fr: 'FR',
    zh: 'CN'
  };

  const languages = [
    { code: 'en', name: 'English', shortCode: 'EN', flag: '🇬🇧' },
    { code: 'fr', name: 'Français', shortCode: 'FR', flag: '🇫🇷' },
    { code: 'zh', name: '中文', shortCode: 'CN', flag: '🇨🇳' }
  ];

  useEffect(() => {
    setCurrentLang(i18n.language);
  }, [i18n.language]);

  const handleLanguageChange = (langCode) => {
    setCurrentLang(langCode);
    i18n.changeLanguage(langCode);
    // localStorage 保存在 i18n config.js 中自动处理
    setIsOpen(false);
  };

  const currentLanguage = languages.find(l => l.code === currentLang) || languages[0];

  return (
    <div className="language-switcher">
      {/* 下拉菜单触发按钮 */}
      <button
        className="lang-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select language"
        title="Click to change language"
      >
        <span className="lang-code">{currentLanguage.shortCode}</span>
        <span className={`chevron ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="lang-dropdown">
          {languages.map(lang => (
            <button
              key={lang.code}
              className={`lang-option ${currentLang === lang.code ? 'active' : ''}`}
              onClick={() => handleLanguageChange(lang.code)}
            >
              <span className="lang-flag">{lang.flag}</span>
              <span className="lang-code">{lang.shortCode}</span>
              <span className="lang-name-full">{lang.name}</span>
              {currentLang === lang.code && <span className="checkmark">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

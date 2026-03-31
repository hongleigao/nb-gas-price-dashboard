import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import fr from '../locales/fr.json';
import zh from '../locales/zh.json';

// ============ 1️⃣ 自动检测浏览器语言并记住用户选择 ============
const detectLanguage = () => {
  // 先检查 localStorage 中是否有保存的语言选择
  const savedLanguage = localStorage.getItem('preferredLanguage');
  
  if (savedLanguage) {
    console.log(`✅ 使用保存的语言: ${savedLanguage}`);
    return savedLanguage;
  }

  // 获取浏览器的首选语言
  const browserLanguage = navigator.language.split('-')[0].toLowerCase();
  const supportedLanguages = ['en', 'fr', 'zh'];

  if (supportedLanguages.includes(browserLanguage)) {
    console.log(`✅ 检测到浏览器语言: ${browserLanguage}`);
    return browserLanguage;
  }

  console.log(`⚠️ 浏览器语言不支持，默认使用: en`);
  return 'en';
};

// ============ 2️⃣ 初始化 i18next ============
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      zh: { translation: zh }
    },
    lng: detectLanguage(), // 使用检测到的或保存的语言
    fallbackLng: 'en', // 如果翻译不存在，使用英文
    interpolation: {
      escapeValue: false // React 已经防止 XSS 攻击
    },
    ns: ['translation'],
    defaultNS: 'translation'
  });

// ============ 3️⃣ 监听语言变化，保存到 localStorage ============
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('preferredLanguage', lng);
  console.log(`🌍 语言已切换为: ${lng}`);
  // 更新 HTML lang 属性（用于 SEO 和 CSS）
  document.documentElement.lang = lng;
});

export default i18n;

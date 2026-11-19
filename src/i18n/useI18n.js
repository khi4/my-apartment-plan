import { ref, computed } from 'vue';
import en from './en.js';
import ar from './ar.js';

const LS_LANG = 'fpb-lang';
const STR = { en, ar };

function detectInitialLang() {
  if (typeof location !== 'undefined') {
    if (location.hash === '#ar') return 'ar';
    if (location.hash === '#en') return 'en';
  }
  try {
    const saved = localStorage.getItem(LS_LANG);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch (_) {}
  if (typeof document !== 'undefined' && document.documentElement.lang === 'ar') {
    return 'ar';
  }
  return 'en';
}

function applyDomLang(nextLang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = nextLang;
  document.documentElement.dir = nextLang === 'ar' ? 'rtl' : 'ltr';
}

const lang = ref(detectInitialLang());
applyDomLang(lang.value);

const isAr = computed(() => lang.value === 'ar');
const dir = computed(() => (lang.value === 'ar' ? 'rtl' : 'ltr'));

let langTransTimer = null;

function setLang(next) {
  const normalized = next === 'ar' ? 'ar' : 'en';
  if (normalized !== lang.value && typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root && root.classList) {
      if (langTransTimer) {
        clearTimeout(langTransTimer);
        langTransTimer = null;
      }
      root.classList.remove('lang-transitioning');
      try {
        void root.offsetWidth;
      } catch (_) {}
      root.classList.add('lang-transitioning');
      langTransTimer = setTimeout(() => {
        if (typeof document !== 'undefined' && document.documentElement?.classList) {
          document.documentElement.classList.remove('lang-transitioning');
        }
        langTransTimer = null;
      }, 260);
    }
  }
  lang.value = normalized;
  try {
    localStorage.setItem(LS_LANG, normalized);
  } catch (_) {}
  applyDomLang(normalized);
  if (typeof location !== 'undefined') {
    const targetHash = '#' + normalized;
    if (location.hash !== targetHash) {
      try {
        history.replaceState(null, '', targetHash);
      } catch (_) {
        location.hash = targetHash;
      }
    }
  }
}

function t(key, ...args) {
  const dict = STR[lang.value] || STR.en;
  let val = dict[key];
  if (val === undefined) val = STR.en[key];
  if (val === undefined) return key;
  return typeof val === 'function' ? val(...args) : val;
}

export function useI18n() {
  return {
    lang,
    isAr,
    dir,
    t,
    setLang,
  };
}

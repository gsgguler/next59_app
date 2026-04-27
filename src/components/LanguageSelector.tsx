import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

const LANGUAGES = [
  { code: 'tr', label: 'T\u00fcrk\u00e7e', flag: '\u{1F1F9}\u{1F1F7}' },
  { code: 'en', label: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
];

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useParams();

  function switchLang(newLang: string) {
    i18n.changeLanguage(newLang);
    const newPath = location.pathname.replace(`/${lang}`, `/${newLang}`);
    navigate(newPath, { replace: true });
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
        <span className="text-lg">{LANGUAGES.find(l => l.code === i18n.language)?.flag || '\u{1F310}'}</span>
        <span className="text-sm text-white/80 hidden md:inline">
          {LANGUAGES.find(l => l.code === i18n.language)?.label || 'Language'}
        </span>
        <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => switchLang(l.code)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 transition-colors first:rounded-t-lg last:rounded-b-lg ${
              i18n.language === l.code ? 'text-amber-500' : 'text-white/80'
            }`}
          >
            <span className="text-lg">{l.flag}</span>
            <span className="text-sm">{l.label}</span>
            {i18n.language === l.code && (
              <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

import { Languages } from 'lucide-react';
import { useLanguage } from '../lib/use-language.js';
import ModelSelect from './ModelSelect.jsx';

const languages = [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }];

export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return <div className="language-switcher"><Languages size={15} aria-hidden="true" />
    <ModelSelect value={language} options={languages} onChange={setLanguage} ariaLabel={t('切换语言')} />
  </div>;
}

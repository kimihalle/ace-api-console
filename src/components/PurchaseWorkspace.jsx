import { useId, useRef } from 'react';
import { CreditCard, Receipt } from 'lucide-react';
import { useLanguage } from '../lib/use-language.js';
import './purchase-workspace.css';

const tabs = [
  { value: 'purchase', label: '购买订阅', icon: CreditCard },
  { value: 'bills', label: '账单明细', icon: Receipt },
];

export default function PurchaseWorkspace({ activeTab, onTabChange, purchase, bills }) {
  const { t } = useLanguage();
  const id = useId();
  const buttons = useRef([]);
  const handleKey = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onTabChange(tabs[next].value);
  };

  return <div className="purchase-workspace">
    <div className="store-tabs purchase-workspace-tabs" role="tablist" aria-label={t('购买与账单')}>
      {tabs.map(({ value, label, icon: Icon }, index) => <button key={value} ref={(button) => { buttons.current[index] = button; }} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}-panel`} aria-selected={activeTab === value} tabIndex={activeTab === value ? 0 : -1} onClick={() => onTabChange(value)} onKeyDown={(event) => handleKey(event, index)}><Icon size={16} aria-hidden="true" />{t(label)}</button>)}
    </div>
    {tabs.map(({ value }) => <div key={value} className="purchase-tab-panel" role="tabpanel" id={`${id}-${value}-panel`} aria-labelledby={`${id}-${value}-tab`} hidden={activeTab !== value} tabIndex={0}>
      {activeTab === value && (value === 'purchase' ? purchase : bills)}
    </div>)}
  </div>;
}

import { t } from '../lib/i18n.js';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../lib/use-language.js';
import './ModelSelect.css';

/** Accessible themed select. Options are strings or {value,label,group,disabled,description}. */
export default function ModelSelect({
  value,
  onChange,
  options = [],
  groups = [],
  placeholder = t("请选择"),
  ariaLabel = t("选择项"),
  disabled = false,
  className = '',
}) {
  useLanguage();
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalize = (item) => {
    if (typeof item === 'string' || typeof item === 'number') return { value: String(item), label: String(item) };
    return {
      value: item?.value ?? item?.id ?? item?.name ?? '',
      label: item?.label ?? item?.name ?? item?.value ?? '',
      group: item?.group,
      icon: item?.icon,
      disabled: Boolean(item?.disabled),
      description: item?.description,
    };
  };

  const flatOptions = useMemo(() => {
    const grouped = groups.flatMap((group) =>
      (group?.options || []).map((item) => ({ ...normalize(item), group: group.label || item?.group })),
    );
    return [...grouped, ...options.map(normalize)].filter((item) => item.value !== '');
  }, [groups, options]);
  const selected = flatOptions.find((item) => String(item.value) === String(value));
  const enabledIndexes = useMemo(() => flatOptions.reduce((result, item, index) => {
    if (!item.disabled) result.push(index);
    return result;
  }, []), [flatOptions]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const index = flatOptions.findIndex((item) => String(item.value) === String(value));
    setActiveIndex(index >= 0 && !flatOptions[index]?.disabled ? index : enabledIndexes[0] ?? -1);
  }, [open, value, flatOptions, enabledIndexes]);

  useEffect(() => {
    if (open && activeIndex >= 0) listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const choose = (item) => {
    if (!item || item.disabled) return;
    onChange?.(item.value, item);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (open && ['Home', 'End'].includes(event.key)) { event.preventDefault(); setActiveIndex(event.key === 'Home' ? enabledIndexes[0] : enabledIndexes.at(-1)); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) setOpen(true); else choose(flatOptions[activeIndex]);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const current = enabledIndexes.indexOf(activeIndex);
      const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
      setActiveIndex(enabledIndexes[Math.max(0, Math.min(enabledIndexes.length - 1, next))] ?? -1);
    }
  };

  const rows = useMemo(() => {
    const result = [];
    let lastGroup;
    flatOptions.forEach((item, index) => {
      if (item.group && item.group !== lastGroup) {
        result.push({ type: 'group', label: item.group, key: `group-${item.group}-${index}` });
        lastGroup = item.group;
      }
      result.push({ type: 'option', item, index, key: `${item.value}-${index}` });
    });
    return result;
  }, [flatOptions]);

  return (
    <div ref={rootRef} className={`model-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}>
      <button type="button" role="combobox" className="model-select__trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} aria-label={ariaLabel} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={onKeyDown}>
        <span className={selected ? 'model-select__value model-select__label-content' : 'model-select__placeholder'}>{selected?.icon}<span>{selected?.label || placeholder}</span></span>
        <span className="model-select__chevron" aria-hidden="true" />
      </button>
      {open && <div id={listId} ref={listRef} className="model-select__menu" role="listbox" aria-label={ariaLabel} tabIndex={-1}>
        {rows.length === 0 ? <div className="model-select__empty">{t("暂无可选项")}</div> : rows.map((row) => row.type === 'group' ? (
          <div className="model-select__group" key={row.key}>{row.label}</div>
        ) : (
          <button type="button" id={`${listId}-${row.index}`} key={row.key} data-index={row.index} role="option" tabIndex={-1} aria-selected={String(row.item.value) === String(value)} disabled={row.item.disabled} className={`model-select__option ${row.index === activeIndex ? 'is-active' : ''} ${String(row.item.value) === String(value) ? 'is-selected' : ''}`.trim()} onMouseEnter={() => setActiveIndex(row.index)} onClick={() => choose(row.item)}>
            <span className="model-select__label-content">{row.item.icon}<span><span className="model-select__option-label">{row.item.label}</span>{row.item.description && <span className="model-select__option-description">{row.item.description}</span>}</span></span>
            {String(row.item.value) === String(value) && <span className="model-select__check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>}
    </div>
  );
}


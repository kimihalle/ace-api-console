import { t } from '../lib/i18n.js';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../lib/use-language.js';
import './ModelSelect.css';

const emptyOptions = [];

/** Accessible themed select. Options are strings or {value,label,group,disabled,description}. */
export default function ModelSelect({
  value,
  onChange,
  options = emptyOptions,
  groups = emptyOptions,
  placeholder = t("请选择"),
  ariaLabel = t("选择项"),
  disabled = false,
  className = '',
  searchable = false,
  allowCustom = false,
  allowEmpty = false,
}) {
  useLanguage();
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalize = (item) => {
    if (typeof item === 'string' || typeof item === 'number') return { value: String(item), label: String(item) };
    return {
      value: item?.value ?? item?.id ?? item?.name ?? '',
      label: item?.label ?? item?.name ?? item?.value ?? '',
      group: item?.group,
      icon: item?.icon,
      ratio: item?.ratio,
      ratioTone: item?.ratioTone,
      disabled: Boolean(item?.disabled),
      description: item?.description,
    };
  };

  const flatOptions = useMemo(() => {
    const grouped = groups.flatMap((group) =>
      (group?.options || []).map((item) => ({ ...normalize(item), group: group.label || item?.group })),
    );
    return [...grouped, ...options.map(normalize)].filter((item) => allowEmpty || item.value !== '');
  }, [groups, options, allowEmpty]);
  const selected = flatOptions.find((item) => String(item.value) === String(value));
  const visibleOptions = useMemo(() => !searchable || !query ? flatOptions : flatOptions.filter((item) =>
    `${item.label} ${item.value}`.toLowerCase().includes(query.toLowerCase()),
  ), [flatOptions, searchable, query]);
  const enabledIndexes = useMemo(() => visibleOptions.reduce((result, item, index) => {
    if (!item.disabled) result.push(index);
    return result;
  }, []), [visibleOptions]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const index = visibleOptions.findIndex((item) => String(item.value) === String(value));
    setActiveIndex(searchable && query ? -1 : index >= 0 && !visibleOptions[index]?.disabled ? index : enabledIndexes[0] ?? -1);
  }, [open, value, visibleOptions, enabledIndexes, searchable, query]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const menu = listRef.current;
    const option = menu?.querySelector(`[data-index="${activeIndex}"]`);
    if (!menu || !option) return;
    const menuRect = menu.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    if (optionRect.top < menuRect.top) menu.scrollTop -= menuRect.top - optionRect.top;
    else if (optionRect.bottom > menuRect.bottom) menu.scrollTop += optionRect.bottom - menuRect.bottom;
  }, [activeIndex, open]);

  useEffect(() => {
    if (open && searchable) inputRef.current?.focus();
  }, [open, searchable]);

  const choose = (item) => {
    if (!item || item.disabled) return;
    onChange?.(item.value, item);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setQuery(''); return; }
    if (event.key === 'Tab') { setOpen(false); setQuery(''); return; }
    if (!searchable && open && ['Home', 'End'].includes(event.key)) { event.preventDefault(); setActiveIndex(event.key === 'Home' ? enabledIndexes[0] : enabledIndexes.at(-1)); return; }
    if (searchable && event.key === 'Enter') {
      if (open) {
        event.preventDefault();
        if (activeIndex >= 0) choose(visibleOptions[activeIndex]);
        else { setOpen(false); setQuery(''); }
      }
      return;
    }
    if (event.key === 'Enter' || (!searchable && event.key === ' ')) {
      event.preventDefault();
      if (!open) setOpen(true); else choose(visibleOptions[activeIndex]);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const current = enabledIndexes.indexOf(activeIndex);
      const next = current < 0 ? event.key === 'ArrowDown' ? 0 : enabledIndexes.length - 1 : event.key === 'ArrowDown' ? current + 1 : current - 1;
      setActiveIndex(enabledIndexes[Math.max(0, Math.min(enabledIndexes.length - 1, next))] ?? -1);
    }
  };

  const rows = useMemo(() => {
    const result = [];
    let lastGroup;
    visibleOptions.forEach((item, index) => {
      if (item.group && item.group !== lastGroup) {
        result.push({ type: 'group', label: item.group, key: `group-${item.group}-${index}` });
        lastGroup = item.group;
      }
      result.push({ type: 'option', item, index, key: `${item.value}-${index}` });
    });
    return result;
  }, [visibleOptions]);

  return (
    <div ref={rootRef} className={`model-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(''); }
    }}>
      <button type="button" role="combobox" className={`model-select__trigger ${searchable ? 'model-select__search-trigger' : ''}`.trim()} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} aria-label={ariaLabel} disabled={disabled} onClick={() => {
        if (searchable && !open) {
          setQuery(allowCustom ? value || '' : '');
          setOpen(true);
          return;
        }
        setOpen((current) => !current);
        setQuery('');
      }} onKeyDown={onKeyDown}>
        <span className={selected ? 'model-select__value model-select__label-content' : 'model-select__placeholder'}>{selected?.icon}<span>{selected?.label || placeholder}</span></span>
        {selected?.ratio != null && Number.isFinite(Number(selected.ratio)) && <span className={`mp-ratio mp-ratio-tone-${Number(selected.ratioTone) % 6}`} aria-label={t('倍率 {value}', { value: selected.ratio })}>×{selected.ratio}</span>}
        <span className="model-select__chevron" aria-hidden="true" />
      </button>
      {open && <div className="model-select__menu">
        {searchable && <input ref={inputRef} className="model-select__search-input" role="combobox" aria-label={`${ariaLabel}${t('搜索')}`} aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="true" aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} autoComplete="off" spellCheck={false} value={query} placeholder={t('搜索…')} onChange={(event) => { setQuery(event.target.value); if (allowCustom) onChange?.(event.target.value); }} onKeyDown={onKeyDown} />}
        <div id={listId} ref={listRef} className="model-select__options" role="listbox" aria-label={ariaLabel} tabIndex={-1}>
          {rows.length === 0 ? <div className="model-select__empty">{t("暂无可选项")}</div> : rows.map((row) => row.type === 'group' ? (
          <div className="model-select__group" key={row.key}>{row.label}</div>
        ) : (
          <button type="button" id={`${listId}-${row.index}`} key={row.key} data-index={row.index} role="option" tabIndex={-1} aria-selected={String(row.item.value) === String(value)} disabled={row.item.disabled} className={`model-select__option ${row.index === activeIndex ? 'is-active' : ''} ${String(row.item.value) === String(value) ? 'is-selected' : ''}`.trim()} onMouseDown={(event) => { if (searchable) event.preventDefault(); }} onClick={() => choose(row.item)}>
            <span className="model-select__label-content">{row.item.icon}<span><span className="model-select__option-label">{row.item.label}</span>{row.item.description && <span className="model-select__option-description">{row.item.description}</span>}</span></span>
            {row.item.ratio != null && Number.isFinite(Number(row.item.ratio)) && <span className={`mp-ratio mp-ratio-tone-${Number(row.item.ratioTone) % 6}`} aria-label={t('倍率 {value}', { value: row.item.ratio })}>×{row.item.ratio}</span>}
            {String(row.item.value) === String(value) && <span className="model-select__check" aria-hidden="true">✓</span>}
          </button>
        ))}
        </div>
      </div>}
    </div>
  );
}


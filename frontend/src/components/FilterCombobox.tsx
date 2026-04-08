import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComboOption { value: string; label: string; }

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder: string;
  minWidth?: number;
}

export function FilterCombobox({ value, onChange, options, placeholder, minWidth }: Props) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef           = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? '';

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: minWidth ?? 130 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', background: 'var(--bg-elevated)',
          border: `1px solid ${open ? 'var(--accent)' : value ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          color: value ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: '0.82rem', fontFamily: 'inherit',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? selectedLabel : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
          {value && (
            <span
              onMouseDown={e => { e.stopPropagation(); handleSelect(''); }}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, fontSize: 14, padding: '0 2px' }}
              title="Temizle"
            >×</span>
          )}
          <svg width="10" height="6" viewBox="0 0 10 6" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
          background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ara..."
              style={{
                width: '100%', padding: '5px 8px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text-primary)',
                fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            <div
              onMouseDown={() => handleSelect('')}
              style={{ padding: '7px 12px', fontSize: '0.8rem', cursor: 'pointer', color: !value ? 'var(--accent)' : 'var(--text-muted)', background: !value ? 'var(--accent-dim)' : 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = !value ? 'var(--accent-dim)' : 'transparent'; }}
            >
              {placeholder}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>Sonuç bulunamadı</div>
            ) : filtered.map(o => (
              <div
                key={o.value}
                onMouseDown={() => handleSelect(o.value)}
                style={{ padding: '7px 12px', fontSize: '0.8rem', cursor: 'pointer', color: o.value === value ? 'var(--accent)' : 'var(--text-primary)', background: o.value === value ? 'var(--accent-dim)' : 'transparent', fontWeight: o.value === value ? 600 : 400 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = o.value === value ? 'var(--accent-dim)' : 'transparent'; }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

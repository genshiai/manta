import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PatientRecord } from '../../../data/chartMock';
import { cn } from '../../ui/utils';
import { Kbd } from '../primitives/Kbd';

export type CommandAction = { id: string; label: string; hint?: string; kbd?: string; run: () => void };

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  actions: CommandAction[];
  patients: PatientRecord[];
  onOpenPatient: (patient: PatientRecord) => void;
};

/** ⌘K: 患者・アクション横断検索。KARTE_UI_SPEC §10 */
export function CommandPalette({ open, onClose, actions, patients, onOpenPatient }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const q = query.normalize('NFKC').toLowerCase();
  const patientMatches = useMemo(() => {
    if (!q) return patients.slice(0, 6);
    return patients
      .filter((p) => `${p.name} ${p.kana} ${p.id}`.normalize('NFKC').toLowerCase().includes(q))
      .slice(0, 8);
  }, [patients, q]);
  const actionMatches = useMemo(
    () => (q ? actions.filter((a) => a.label.normalize('NFKC').toLowerCase().includes(q)) : actions),
    [actions, q],
  );

  const flat: Array<{ kind: 'action' | 'patient'; run: () => void; label: string; sub?: string; kbd?: string }> = [
    ...actionMatches.map((a) => ({ kind: 'action' as const, run: a.run, label: a.label, sub: a.hint, kbd: a.kbd })),
    ...patientMatches.map((p) => ({
      kind: 'patient' as const,
      run: () => onOpenPatient(p),
      label: p.name,
      sub: `${p.kana} · ${p.id} · ${p.age}歳 ${p.sex}`,
    })),
  ];

  if (!open) return null;

  const runIndex = (i: number) => {
    const item = flat[i];
    if (item) {
      item.run();
      onClose();
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((v) => Math.min(flat.length - 1, v + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((v) => Math.max(0, v - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runIndex(index);
    }
  };

  let flatIdx = -1;
  const actionCount = actionMatches.length;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal keyboard host
    <div className="clinical fixed inset-0 z-50" onKeyDown={handleKey}>
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-[var(--dim)]" />
      <div
        role="dialog"
        aria-label="コマンドパレット"
        className="absolute left-1/2 top-24 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[14px] border border-border bg-popover shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={16} strokeWidth={1.7} className="text-text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            placeholder="患者・アクションを検索…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[380px] overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <p className="px-3 py-5 text-center text-[12.5px] text-text-tertiary">該当なし</p>
          ) : (
            <>
              {actionMatches.length > 0 ? (
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
                  アクション
                </div>
              ) : null}
              {flat.map((item, i) => {
                flatIdx += 1;
                const idx = flatIdx;
                const showPatientHeader = idx === actionCount && patientMatches.length > 0;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 検索結果リストの表示位置が識別子
                  <div key={`${item.kind}-${item.label}-${i}`}>
                    {showPatientHeader ? (
                      <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
                        患者
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onMouseEnter={() => setIndex(idx)}
                      onClick={() => runIndex(idx)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left',
                        idx === index ? 'bg-brand-tint' : 'hover:bg-surface-subtle',
                      )}
                    >
                      {item.kind === 'patient' ? (
                        <span className="grid size-6 flex-none place-items-center rounded-full bg-brand-tint text-[11px] font-bold text-brand">
                          {item.label.slice(0, 1)}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">{item.label}</span>
                        {item.sub ? <span className="block truncate text-[11px] text-text-tertiary">{item.sub}</span> : null}
                      </span>
                      {item.kbd ? <Kbd>{item.kbd}</Kbd> : null}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

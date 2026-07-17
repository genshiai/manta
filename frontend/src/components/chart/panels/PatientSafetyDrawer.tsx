import { ShieldAlert, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { AlertItem } from '../../../data/chartMock';
import { addPatientSafetyAlert, isUnauthorizedError, removePatientSafetyAlert } from '../../../lib/api';
import { toast, toastError } from '../../ui/toast';

type PatientSafetyDrawerProps = {
  alerts: AlertItem[];
  onAlertsChanged: (alerts: AlertItem[]) => void;
  onAuthExpired: () => void;
  onClose: () => void;
  onDataChanged: () => void;
  patientId: string;
};

const safetyPattern = /(アレルギ|同姓同名|副反応|禁忌|回避|リスク|転倒|感染|隔離|妊娠|抗凝固|透析|ペースメーカー)/;

export function PatientSafetyDrawer({ alerts, onAlertsChanged, onAuthExpired, onClose, onDataChanged, patientId }: PatientSafetyDrawerProps) {
  const [label, setLabel] = useState('');
  const [source, setSource] = useState('診察');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const safetyAlerts = alerts.map((alert, index) => ({ alert, index })).filter(({ alert }) => safetyPattern.test(alert.label));

  const save = async () => {
    if (!label.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const patient = await addPatientSafetyAlert(patientId, { label: label.trim(), source, note: note.trim() || undefined });
      onAlertsChanged(patient.alerts);
      onDataChanged();
      setLabel('');
      setNote('');
      toast('患者安全情報を登録しました');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      toastError(error instanceof Error ? error.message : '患者安全情報を登録できませんでした');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (index: number) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const patient = await removePatientSafetyAlert(patientId, index);
      onAlertsChanged(patient.alerts);
      onDataChanged();
      toast('患者安全情報を解除しました');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      toastError(error instanceof Error ? error.message : '患者安全情報を解除できませんでした');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='clinical fixed inset-0 z-[70]'>
      <button type='button' aria-label='閉じる' className='absolute inset-0 bg-black/10' onClick={onClose} />
      <aside className='absolute inset-y-0 right-0 flex w-[min(480px,94vw)] flex-col border-l border-border bg-card shadow-[var(--shadow-modal)]' role='dialog' aria-label='患者安全情報'>
        <header className='flex items-center gap-2.5 border-b border-border px-4 py-3'>
          <ShieldAlert size={18} className='text-destructive' />
          <div className='min-w-0 flex-1'><h2 className='text-[15px] font-bold text-text-primary'>患者安全情報</h2><p className='text-[10.5px] text-text-tertiary'>登録元・登録者・時刻を保存します</p></div>
          <button type='button' aria-label='閉じる' onClick={onClose} className='grid size-7 place-items-center rounded-md text-text-tertiary hover:bg-surface-subtle'><X size={16} /></button>
        </header>

        <div className='min-h-0 flex-1 overflow-y-auto p-4'>
          <section>
            <h3 className='text-[11px] font-bold uppercase tracking-wide text-text-tertiary'>登録中</h3>
            <div className='mt-2 space-y-2'>
              {safetyAlerts.length ? safetyAlerts.map(({ alert, index }) => (
                <article className='rounded-8 border border-[#ecd6d1] bg-[#faf0ee] p-3' key={`${alert.label}-${index}`}>
                  <div className='flex items-start justify-between gap-2'><div><p className='text-[13px] font-bold text-[#8e3933]'>{alert.label}</p><p className='mt-1 text-[11px] text-text-secondary'>{alert.note || '補足なし'}</p></div><button type='button' disabled={isSaving} onClick={() => void remove(index)} className='grid size-7 place-items-center rounded-md text-text-tertiary hover:bg-white hover:text-destructive' aria-label={`${alert.label}を解除`}><Trash2 size={14} /></button></div>
                  <p className='mt-2 border-t border-[#ecd6d1] pt-2 text-[10px] text-text-tertiary'>登録元: {alert.source || '既存カルテ'} · 登録者: {alert.recordedBy || '移行データ（不明）'}{alert.recordedAt ? ` · ${alert.recordedAt}` : ''}</p>
                </article>
              )) : <p className='rounded-8 border border-dashed border-border px-3 py-6 text-center text-[12px] text-text-tertiary'>患者安全情報はありません。</p>}
            </div>
          </section>

          <section className='mt-6 border-t border-border pt-5'>
            <h3 className='text-[12px] font-bold text-text-primary'>安全情報を登録</h3>
            <label htmlFor='patient-safety-label' className='mt-3 block text-[10px] font-bold text-text-tertiary'>項目</label>
            <input id='patient-safety-label' value={label} onChange={(event) => setLabel(event.target.value)} placeholder='例: 誤嚥リスク、造影剤副反応' className='mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-[12px] outline-none focus:border-brand' />
            <label htmlFor='patient-safety-source' className='mt-3 block text-[10px] font-bold text-text-tertiary'>登録元</label>
            <select id='patient-safety-source' value={source} onChange={(event) => setSource(event.target.value)} className='mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-[12px] outline-none focus:border-brand'>
              <option>診察</option><option>看護アセスメント</option><option>問診・患者申告</option><option>薬剤情報</option><option>検査・処置記録</option>
            </select>
            <label htmlFor='patient-safety-note' className='mt-3 block text-[10px] font-bold text-text-tertiary'>根拠・対応</label>
            <textarea id='patient-safety-note' value={note} onChange={(event) => setNote(event.target.value)} placeholder='観察内容、回避事項、必要な対応' className='mt-1 min-h-24 w-full resize-y rounded-md border border-border bg-white p-3 text-[12px] outline-none focus:border-brand' />
          </section>
        </div>
        <footer className='flex justify-end gap-2 border-t border-border p-3'><button type='button' onClick={onClose} className='h-8 rounded-md border border-border bg-white px-3 text-[11px] font-bold text-text-secondary'>閉じる</button><button type='button' disabled={!label.trim() || isSaving} onClick={() => void save()} className='h-8 rounded-md bg-brand px-4 text-[11px] font-bold text-white disabled:opacity-50'>{isSaving ? '保存中…' : '登録'}</button></footer>
      </aside>
    </div>
  );
}

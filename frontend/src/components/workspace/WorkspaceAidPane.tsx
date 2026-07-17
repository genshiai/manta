import { X } from 'lucide-react';
import type { PatientRecord } from '../../data/chartMock';
import type { CommunicationThread, InpatientAdmission } from '../../types/workflow';
import type { WorkspaceScreen } from './WorkspaceContextPane';

type WorkspaceAidPaneProps = {
  screen: WorkspaceScreen;
  patients: PatientRecord[];
  admissions: InpatientAdmission[];
  communicationThreads: CommunicationThread[];
  onClose: () => void;
};

function AidSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="mx-3 mb-3 overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex items-baseline gap-2 border-b border-border/70 px-3 py-2 text-[11.5px] font-bold text-text-primary">
        {title}
        {meta ? <span className="ms-auto text-[10px] font-normal tracking-normal">{meta}</span> : null}
      </div>
      <div className="[&>*]:border-b [&>*]:border-border/60 [&>*]:px-3 [&>*]:py-2 [&>*:last-child]:border-b-0">{children}</div>
    </section>
  );
}

function AidRow({ title, detail, danger = false }: { title: string; detail: string; danger?: boolean }) {
  return (
    <div>
      <p className={danger ? 'text-[12px] font-semibold text-destructive' : 'text-[12px] font-semibold text-text-primary'}>{title}</p>
      <p className="mt-0.5 text-[11px] leading-[1.55] text-text-tertiary">{detail}</p>
    </div>
  );
}

export function WorkspaceAidPane({ screen, patients, admissions, communicationThreads, onClose }: WorkspaceAidPaneProps) {
  const outpatientPatients = patients.filter((patient) => !patient.department.includes('病棟') && patient.department !== '集中治療');
  const sameName = outpatientPatients.filter((patient) => patient.sameNameDuplicateCount > 1);
  const results = outpatientPatients.filter((patient) => patient.labProgress === '結果到着');
  const partial = outpatientPatients.filter((patient) => patient.labProgress === '一部結果' || patient.labProgress === '依頼中');
  const interrupted = outpatientPatients.filter((patient) => patient.status === '診察一時中断');
  const pendingInstructions = admissions.reduce((sum, admission) => sum + admission.pendingInstructionCount, 0);

  return (
    <aside className="workspace-aid hidden min-h-0 flex-col border-s border-border bg-card min-[1150px]:flex">
      <div className="flex flex-none items-center px-4 pb-2.5 pt-3.5">
        <h2 className="text-[13px] font-bold text-text-primary">
          {screen === 'reception' ? '外来の状態' : screen === 'ward' ? '病棟の状態' : screen === 'billing' ? '医事の補助情報' : screen === 'messages' ? '連絡の状態' : '管理情報'}
        </h2>
        <button aria-label="補助情報を閉じる" className="ms-auto grid size-8 place-items-center rounded-lg text-text-tertiary hover:bg-surface-subtle hover:text-text-primary" onClick={onClose} type="button">
          <X size={14} strokeWidth={1.7} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {screen === 'reception' ? (
          <>
            <AidSection title="患者安全">
              {sameName.length > 0 ? sameName.map((patient) => (
                <AidRow danger detail={`${patient.name} — 開く前に ID と生年月日を照合`} key={patient.id} title={`同姓同名 ${patient.sameNameDuplicateCount}名`} />
              )) : <AidRow detail="本日の患者一覧に同姓同名登録はありません" title="同定注意なし" />}
            </AidSection>
            <AidSection title="検査">
              <AidRow detail={results.map((patient) => patient.name).join(' · ') || '—'} title={`診察可 ${results.length}名`} />
              <AidRow detail={partial.map((patient) => `${patient.name} · ${patient.labProgress}`).join(' · ') || '—'} title={`進行中 ${partial.length}名`} />
            </AidSection>
            <AidSection title="進行中">
              <AidRow detail={interrupted.map((patient) => `${patient.name} · ${patient.comment || '再開待ち'}`).join(' · ') || '—'} title={`診察一時中断 ${interrupted.length}件`} />
            </AidSection>
          </>
        ) : null}

        {screen === 'ward' ? (
          <>
            <AidSection title="担当全体">
              <AidRow detail={admissions.filter((item) => item.pendingInstructionCount > 0).map((item) => item.patientName).join(' · ') || '—'} title={`未実施の指示 ${pendingInstructions}件`} />
              <AidRow detail={admissions.filter((item) => item.status === 'discharge_permitted').map((item) => item.patientName).join(' · ') || '—'} title={`退院許可 ${admissions.filter((item) => item.status === 'discharge_permitted').length}名`} />
            </AidSection>
            <AidSection title="病床">
              <AidRow detail="病床の移動・清掃・閉鎖は病棟画面から更新します" title={`入院中 ${admissions.filter((item) => item.status === 'active').length}名`} />
            </AidSection>
          </>
        ) : null}

        {screen === 'billing' ? (
          <>
            <AidSection meta="確定は人" title="AI 候補">
              <AidRow detail="カルテ A 欄から病名候補を提示。採用・照会・確定は権限を持つ担当者が行います。" title="病名の候補 1" />
            </AidSection>
            <AidSection title="本日の進捗">
              <AidRow detail={`${patients.filter((patient) => patient.status === '会計済').length || 12}/${patients.length || 16} · 外来`} title="会計 完了" />
              <AidRow detail="高橋 一郎 · 6月分 — 摘要コメント不足" title="返戻・査定 1" />
            </AidSection>
          </>
        ) : null}

        {screen === 'messages' ? (
          <>
            <AidSection title="院内連絡">
              <AidRow detail="患者情報を外部チャットへ出さず、Manta 内で患者・カルテに紐づけて保存します。" title="PHI は院内に保持" />
            </AidSection>
            <AidSection title="スレッド">
              <AidRow detail={`${communicationThreads.filter((thread) => thread.kind === 'patient').length}件の患者スレッド · ${communicationThreads.filter((thread) => thread.kind !== 'patient').length}件のチャンネル`} title={`未読 ${communicationThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)}件`} />
            </AidSection>
          </>
        ) : null}

        {screen === 'settings' ? (
          <>
            <AidSection title="注意">
              <AidRow detail="admin.sato · 7/21 まで" title="パスワード期限 1名" />
            </AidSection>
            <AidSection title="接続">
              <AidRow detail="正常 · 最終同期 11:58" title="ORCA" />
              <AidRow detail="正常 · 9 リソース公開中" title="FHIR" />
            </AidSection>
          </>
        ) : null}
      </div>
    </aside>
  );
}

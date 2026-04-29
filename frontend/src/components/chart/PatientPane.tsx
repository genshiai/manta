import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { searchDiagnoses } from '../../lib/api';
import type { PatientRecord } from '../../data/chartMock';
import type {
  DiagnosisSearchResult,
  PatientProfileEntry,
  ProblemListItem,
  VisitHistoryEntry,
} from '../../types/workflow';

type EditableProfile = PatientProfileEntry & { id: string };
type EditableProblem = ProblemListItem & { id: string };

type PatientPaneProps = {
  patient: PatientRecord;
  profile: EditableProfile[];
  problems: EditableProblem[];
  visitHistory: VisitHistoryEntry[];
  isMutating: boolean;
  onSaveContext: (
    profile: EditableProfile[],
    problems: EditableProblem[],
  ) => Promise<void>;
};

type SubTab = 'basic' | 'problems' | 'visits';

const problemStatusDot = (status: string) => {
  if (status === 'active') return 'bg-warning';
  if (status === 'resolved') return 'bg-success';
  return 'bg-surface-muted';
};

const problemStatusLabel = (status: string) => {
  if (status === 'active') return '継続中';
  if (status === 'resolved') return '寛解';
  return status;
};

const newId = () => `local-${Math.random().toString(36).slice(2, 10)}`;

/**
 * 左ペイン (WHO・不変情報)
 *
 * - 基本タブ: 患者プロファイル (編集可)
 * - 問題タブ: プロブレムリスト + 病名検索で追加
 * - 受診歴タブ: 過去受診の概要
 */
export const PatientPane = ({
  patient,
  profile,
  problems,
  visitHistory,
  isMutating,
  onSaveContext,
}: PatientPaneProps) => {
  const [tab, setTab] = useState<SubTab>('basic');
  const [editingProfile, setEditingProfile] = useState<EditableProfile[]>(profile);
  const [editingProblems, setEditingProblems] = useState<EditableProblem[]>(problems);
  const [editMode, setEditMode] = useState(false);

  // 親 props 同期 (患者切替時など)
  useEffect(() => {
    setEditingProfile(profile);
    setEditingProblems(problems);
    setEditMode(false);
  }, [profile, problems]);

  const isDirty =
    JSON.stringify(editingProfile) !== JSON.stringify(profile) ||
    JSON.stringify(editingProblems) !== JSON.stringify(problems);

  const handleSave = async () => {
    await onSaveContext(editingProfile, editingProblems);
    setEditMode(false);
  };

  const handleCancel = () => {
    setEditingProfile(profile);
    setEditingProblems(problems);
    setEditMode(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SubTab)}
        className="flex h-full min-h-0 flex-col"
      >
        <div className="flex-shrink-0 border-b border-border px-3 pt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">基本</TabsTrigger>
            <TabsTrigger value="problems">問題</TabsTrigger>
            <TabsTrigger value="visits">受診歴</TabsTrigger>
          </TabsList>
          {(tab === 'basic' || tab === 'problems') && isDirty ? (
            <div className="mt-2 flex items-center gap-1.5 px-1 pb-1">
              <Button
                variant="default"
                size="xs"
                onClick={handleSave}
                disabled={isMutating}
                className="flex-1"
              >
                <Check size={12} />
                保存
              </Button>
              <Button variant="ghost" size="xs" onClick={handleCancel} disabled={isMutating}>
                <X size={12} />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="basic" className="m-0 p-4">
            <BasicTab
              patient={patient}
              profile={editingProfile}
              editMode={editMode}
              onChangeProfile={setEditingProfile}
              onToggleEdit={() => setEditMode(!editMode)}
            />
          </TabsContent>

          <TabsContent value="problems" className="m-0 p-4">
            <ProblemsTab
              problems={editingProblems}
              onChange={setEditingProblems}
            />
          </TabsContent>

          <TabsContent value="visits" className="m-0 p-4">
            <VisitsTab visitHistory={visitHistory} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

// === 基本タブ ===

const BasicTab = ({
  patient,
  profile,
  editMode,
  onChangeProfile,
  onToggleEdit,
}: {
  patient: PatientRecord;
  profile: EditableProfile[];
  editMode: boolean;
  onChangeProfile: (next: EditableProfile[]) => void;
  onToggleEdit: () => void;
}) => {
  const updateField = (id: string, key: 'label' | 'value', val: string) => {
    onChangeProfile(profile.map((p) => (p.id === id ? { ...p, [key]: val } : p)));
  };
  const removeField = (id: string) => onChangeProfile(profile.filter((p) => p.id !== id));
  const addField = () =>
    onChangeProfile([...profile, { id: newId(), label: '新規項目', value: '' }]);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div>
          <p className="text-[18px] font-bold leading-snug text-text-primary">{patient.name}</p>
          <p className="text-[13px] text-text-tertiary">
            {patient.age} {patient.sex} ・ ID: {patient.id}
          </p>
        </div>
        {patient.alerts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {patient.alerts.map((alert) => (
              <span
                key={alert.label}
                className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive"
              >
                {alert.label}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
            プロファイル
          </h3>
          <Button variant="ghost" size="xs" onClick={onToggleEdit}>
            {editMode ? (
              <>
                <Check size={12} />
                完了
              </>
            ) : (
              <>
                <Pencil size={12} />
                編集
              </>
            )}
          </Button>
        </div>
        {editMode ? (
          <div className="space-y-1.5">
            {profile.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <Input
                  value={p.label}
                  onChange={(e) => updateField(p.id, 'label', e.target.value)}
                  className="h-7 flex-1 text-[12px]"
                />
                <Input
                  value={p.value}
                  onChange={(e) => updateField(p.id, 'value', e.target.value)}
                  className="h-7 flex-1 text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => removeField(p.id)}
                  className="rounded p-1 text-text-tertiary hover:bg-destructive/10 hover:text-destructive"
                  aria-label="削除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="xs" onClick={addField}>
              <Plus size={12} />
              項目追加
            </Button>
          </div>
        ) : (
          <dl className="space-y-1.5">
            {profile.length > 0 ? (
              profile.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-2">
                  <dt className="text-[12px] text-text-tertiary">{entry.label}</dt>
                  <dd className="text-right text-[13px] text-text-primary">{entry.value}</dd>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-text-tertiary">プロファイル未登録</p>
            )}
          </dl>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          受診情報
        </h3>
        <dl className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <dt className="text-[12px] text-text-tertiary">診療科</dt>
            <dd className="text-right text-[13px] text-text-primary">{patient.department}</dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="text-[12px] text-text-tertiary">主治医</dt>
            <dd className="text-right text-[13px] text-text-primary">{patient.doctor}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
};

// === 問題タブ (病名検索付き) ===

const ProblemsTab = ({
  problems,
  onChange,
}: {
  problems: EditableProblem[];
  onChange: (next: EditableProblem[]) => void;
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiagnosisSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  // debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchMessage('');
      return;
    }
    const handle = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchDiagnoses(q, 8);
        setResults(res);
        setSearchMessage(res.length === 0 ? '一致する病名なし' : '');
      } catch {
        setSearchMessage('検索に失敗しました');
      } finally {
        setIsSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const addProblem = (d: DiagnosisSearchResult) => {
    if (problems.some((p) => p.managementNumber === d.managementNumber)) return;
    onChange([
      ...problems,
      {
        id: newId(),
        managementNumber: d.managementNumber,
        name: d.diseaseName,
        since: new Date().toISOString().split('T')[0] ?? '',
        status: 'active' as const,
        diagnosisType: 'principal',
        icd10Code: d.icd10Code,
      },
    ]);
    setQuery('');
    setResults([]);
  };

  const removeProblem = (id: string) =>
    onChange(problems.filter((p) => p.id !== id));

  const toggleStatus = (id: string) =>
    onChange(
      problems.map((p) =>
        p.id === id ? { ...p, status: p.status === 'active' ? 'resolved' : 'active' } : p,
      ),
    );

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          病名を追加
        </h3>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="標準病名マスターを検索"
            className="pl-9"
          />
        </div>
        {isSearching ? (
          <p className="text-[11px] text-text-tertiary">検索中…</p>
        ) : searchMessage ? (
          <p className="text-[11px] text-text-tertiary">{searchMessage}</p>
        ) : null}
        {results.length > 0 ? (
          <ul className="max-h-60 overflow-y-auto rounded-lg border border-border bg-card">
            {results.map((d) => (
              <li key={d.managementNumber}>
                <button
                  type="button"
                  onClick={() => addProblem(d)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-subtle"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {d.diseaseName}
                    </p>
                    {d.icd10Code ? (
                      <p className="text-[11px] text-text-tertiary">ICD10 {d.icd10Code}</p>
                    ) : null}
                  </div>
                  <Plus size={14} className="text-text-tertiary" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          プロブレムリスト ({problems.length})
        </h3>
        <ul className="space-y-1.5">
          {problems.length > 0 ? (
            problems.map((problem) => (
              <li
                key={problem.id}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleStatus(problem.id)}
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${problemStatusDot(problem.status)}`}
                    aria-label="ステータス切替"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold leading-snug text-text-primary">
                      {problem.name}
                    </p>
                    <p className="text-[11px] text-text-tertiary">
                      {problemStatusLabel(problem.status)}
                      {problem.since ? ` ・ ${problem.since}` : ''}
                      {problem.icd10Code ? ` ・ ICD10 ${problem.icd10Code}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProblem(problem.id)}
                    className="rounded p-0.5 text-text-tertiary hover:bg-destructive/10 hover:text-destructive"
                    aria-label="削除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-text-tertiary">
              プロブレム未登録
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

// === 受診歴タブ ===

const VisitsTab = ({ visitHistory }: { visitHistory: VisitHistoryEntry[] }) => {
  const sorted = useMemo(
    () => [...visitHistory].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [visitHistory],
  );

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
        受診歴 ({sorted.length})
      </h3>
      <ul className="space-y-1.5">
        {sorted.length > 0 ? (
          sorted.map((visit) => (
            <li
              key={`${visit.date}-${visit.summary}`}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-text-primary">{visit.date}</span>
                <span className="text-[11px] text-text-tertiary">{visit.department}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] leading-normal text-text-secondary">
                {visit.summary}
              </p>
            </li>
          ))
        ) : (
          <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-text-tertiary">
            受診歴なし
          </li>
        )}
      </ul>
    </div>
  );
};

// カルテ関連の型定義。実データは lib/api.ts 経由でバックエンドから取得する。
// （旧デモデータ配列は削除済み。型と isVisitClosed のみ残す）

export type NavItem = {
  label: string;
  active?: boolean;
};

export type AlertColor =
  | 'gray'
  | 'blue'
  | 'light-blue'
  | 'cyan'
  | 'green'
  | 'lime'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'magenta'
  | 'purple';

export type DetailItem = {
  label: string;
  value: string;
};

export type AlertItem = {
  label: string;
  color: AlertColor;
  source?: string;
  note?: string;
  recordedBy?: string;
  recordedAt?: string;
};

export type VisitItem = {
  date: string;
  department: string;
  summary: string;
  active?: boolean;
};

export type ProblemItem = {
  name: string;
  since: string;
  status: 'active' | 'resolved';
};

export type VitalItem = {
  label: string;
  value: string;
  unit: string;
};

export type LabResult = {
  item: string;
  result: string;
  baseline: string;
  previous: string;
  flag: 'high' | 'low' | 'normal';
};

export type Prescription = {
  type: string;
  days: string;
  drugName: string;
  dosage: string;
};

export type LabOrder = {
  category: string;
  status: 'done' | 'pending';
  items: string[];
  urgency?: '通常' | '至急';
};

export type ImagingOrder = {
  category: string;
  status: 'scheduled' | 'draft';
  scheduledAt: string;
  note: string;
};

export type ProcedureOrder = {
  title: string;
  status: 'planned' | 'done';
  note: string;
};

export type ChartHistoryItem = {
  date: string;
  department: string;
  title: string;
  summary: string;
};

export type PatientProfileItem = {
  label: string;
  value: string;
};

export type ReceptionStatus =
  | '未受付'
  | '来院済'
  | '問診中'
  | '問診済'
  | '到着済'
  | '診察中'
  | '診察終了'
  | '診察一時中断'
  | '会計済';
export type LabProgress = '依頼中' | '一部結果' | '結果到着' | '未依頼';

export type PatientRecord = {
  id: string;
  name: string;
  kana: string;
  age: string;
  sex: '女性' | '男性';
  department: string;
  doctor: string;
  receptionNumber: string;
  reservationTime: string;
  receptionTime: string;
  status: ReceptionStatus;
  elapsed: string;
  labProgress: LabProgress;
  sameNameDuplicateCount: number;
  comment: string;
  demographics: DetailItem[];
  alerts: AlertItem[];
};

export const isVisitClosed = (status: ReceptionStatus) =>
  status === '診察終了' || status === '会計済';

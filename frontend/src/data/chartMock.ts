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

export const receptionStatusColor: Record<ReceptionStatus, AlertColor> = {
  未受付: 'gray',
  来院済: 'blue',
  問診中: 'light-blue',
  問診済: 'cyan',
  到着済: 'lime',
  診察中: 'orange',
  診察終了: 'green',
  診察一時中断: 'purple',
  会計済: 'gray',
};

export const labProgressColor: Record<LabProgress, AlertColor> = {
  依頼中: 'light-blue',
  一部結果: 'yellow',
  結果到着: 'green',
  未依頼: 'gray',
};

export const defaultPatientId = '0009900040';

export const patientRecords: PatientRecord[] = [
  {
    id: '0009900040',
    name: '鈴木 花子',
    kana: 'スズキ ハナコ',
    age: '68歳',
    sex: '女性',
    department: '内科',
    doctor: '田中 太郎',
    receptionNumber: '12',
    reservationTime: '10:00',
    receptionTime: '09:42',
    status: '診察中',
    elapsed: '34分',
    labProgress: '結果到着',
    sameNameDuplicateCount: 2,
    comment: 'HbA1c・血糖フォロー。前回処方の継続希望あり。',
    demographics: [
      { label: '生年月日', value: '1958/03/15 (68歳)' },
      { label: '血液型', value: 'A型 Rh(+)' },
      { label: '身長 / 体重', value: '155.0cm / 52.3kg' },
      { label: '保険', value: '国民健康保険' },
    ],
    alerts: [
      { label: 'ペニシリンアレルギー', color: 'red' },
      { label: '糖尿病', color: 'yellow' },
    ],
  },
  {
    id: '0009900041',
    name: '鈴木 花子',
    kana: 'スズキ ハナコ',
    age: '41歳',
    sex: '女性',
    department: '皮膚科',
    doctor: '山本 奈緒',
    receptionNumber: '16',
    reservationTime: '10:30',
    receptionTime: '10:11',
    status: '来院済',
    elapsed: '19分',
    labProgress: '未依頼',
    sameNameDuplicateCount: 2,
    comment: '湿疹悪化。前回外用で改善乏しい。',
    demographics: [
      { label: '生年月日', value: '1984/09/22 (41歳)' },
      { label: '血液型', value: 'O型 Rh(+)' },
      { label: '身長 / 体重', value: '161.2cm / 53.8kg' },
      { label: '保険', value: '協会けんぽ' },
    ],
    alerts: [
      { label: 'ラテックス注意', color: 'yellow' },
    ],
  },
  {
    id: '0007712301',
    name: '佐藤 次郎',
    kana: 'サトウ ジロウ',
    age: '57歳',
    sex: '男性',
    department: '循環器内科',
    doctor: '石川 圭介',
    receptionNumber: '08',
    reservationTime: '09:30',
    receptionTime: '09:18',
    status: '問診済',
    elapsed: '58分',
    labProgress: '一部結果',
    sameNameDuplicateCount: 1,
    comment: '胸部圧迫感あり。心電図後に診察。',
    demographics: [
      { label: '生年月日', value: '1968/01/30 (57歳)' },
      { label: '血液型', value: 'B型 Rh(+)' },
      { label: '身長 / 体重', value: '172.0cm / 74.1kg' },
      { label: '保険', value: '組合健保' },
    ],
    alerts: [
      { label: '造影剤副反応歴', color: 'red' },
      { label: '高血圧', color: 'yellow' },
    ],
  },
  {
    id: '0005520007',
    name: '小林 絵美',
    kana: 'コバヤシ エミ',
    age: '33歳',
    sex: '女性',
    department: '内科',
    doctor: '田中 太郎',
    receptionNumber: '19',
    reservationTime: '11:00',
    receptionTime: '10:47',
    status: '診察終了',
    elapsed: '12分',
    labProgress: '依頼中',
    sameNameDuplicateCount: 1,
    comment: '感冒後咳嗽。処方後会計待ち。',
    demographics: [
      { label: '生年月日', value: '1993/08/19 (33歳)' },
      { label: '血液型', value: 'AB型 Rh(+)' },
      { label: '身長 / 体重', value: '158.4cm / 49.2kg' },
      { label: '保険', value: '国民健康保険' },
    ],
    alerts: [
      { label: '妊娠中', color: 'orange' },
    ],
  },
];

export const getPatientById = (patientId: string) =>
  patientRecords.find((patient) => patient.id === patientId);

export const isVisitClosed = (status: ReceptionStatus) =>
  status === '診察終了' || status === '会計済';

export const departmentOptions = Array.from(
  new Set(patientRecords.map((patient) => patient.department)),
);

export const patientNav: NavItem[] = [
  { label: 'カルテ記載', active: true },
  { label: '指示歴' },
  { label: '検査結果' },
  { label: '患者情報' },
];

export const visitHistory: VisitItem[] = [
  { date: '2026/04/13', department: '内科', summary: '定期検診・血糖コントロール', active: true },
  { date: '2026/03/16', department: '内科', summary: 'HbA1c フォロー' },
  { date: '2026/02/10', department: '眼科', summary: '糖尿病性網膜症スクリーニング' },
  { date: '2026/01/14', department: '内科', summary: '血糖・脂質検査' },
  { date: '2025/12/08', department: '整形外科', summary: '腰痛精査' },
];

export const problems: ProblemItem[] = [
  { name: '#1 2型糖尿病', since: '2018/05 〜', status: 'active' },
  { name: '#2 高血圧症', since: '2019/11 〜', status: 'active' },
  { name: '#3 脂質異常症', since: '2020/02 〜', status: 'active' },
  { name: '#4 腰椎椎間板ヘルニア', since: '2025/12 〜 2026/02 (軽快)', status: 'resolved' },
];

export const vitals: VitalItem[] = [
  { label: '血圧', value: '132 / 78', unit: 'mmHg' },
  { label: '脈拍', value: '72', unit: 'bpm' },
  { label: '体温', value: '36.4', unit: '°C' },
  { label: 'SpO2', value: '98', unit: '%' },
  { label: '体重', value: '52.3', unit: 'kg' },
  { label: 'BMI', value: '21.8', unit: '' },
];

export const labResults: LabResult[] = [
  { item: 'HbA1c', result: '7.2%', baseline: '4.6〜6.2%', previous: '7.5%', flag: 'high' },
  { item: '空腹時血糖', result: '138 mg/dL', baseline: '70〜110 mg/dL', previous: '145 mg/dL', flag: 'high' },
  { item: 'LDL-C', result: '118 mg/dL', baseline: '70〜139 mg/dL', previous: '125 mg/dL', flag: 'normal' },
  { item: 'HDL-C', result: '55 mg/dL', baseline: '40〜77 mg/dL', previous: '52 mg/dL', flag: 'normal' },
  { item: 'AST (GOT)', result: '24 U/L', baseline: '13〜33 U/L', previous: '22 U/L', flag: 'normal' },
  { item: 'ALT (GPT)', result: '28 U/L', baseline: '8〜42 U/L', previous: '25 U/L', flag: 'normal' },
  { item: 'Cr', result: '0.72 mg/dL', baseline: '0.46〜0.79 mg/dL', previous: '0.70 mg/dL', flag: 'normal' },
  { item: 'eGFR', result: '72.5 mL/min', baseline: '≥60 mL/min', previous: '74.1 mL/min', flag: 'normal' },
];

export const prescriptions: Prescription[] = [
  {
    type: '内服',
    days: '28日分',
    drugName: 'メトホルミン塩酸塩錠 500mg',
    dosage: '1回1錠 1日2回 朝夕食後',
  },
  {
    type: '内服',
    days: '28日分',
    drugName: 'アムロジピンOD錠 5mg',
    dosage: '1回1錠 1日1回 朝食後',
  },
  {
    type: '内服',
    days: '28日分',
    drugName: 'ロスバスタチン錠 2.5mg',
    dosage: '1回1錠 1日1回 朝食後',
  },
];

export const labOrders: LabOrder[] = [
  {
    category: '血液検査',
    status: 'done',
    items: ['HbA1c', '血糖', '脂質', '肝機能', '腎機能', 'CBC'],
  },
  {
    category: '尿検査',
    status: 'pending',
    items: ['尿蛋白', '尿糖', '沈渣'],
  },
];

export const imagingOrders: ImagingOrder[] = [
  {
    category: '胸部X線',
    status: 'scheduled',
    scheduledAt: '2026/04/14 11:20',
    note: '慢性咳嗽フォロー。外来撮影予約済み。',
  },
  {
    category: '腹部エコー',
    status: 'draft',
    scheduledAt: '未確定',
    note: '次回予約時に同日実施候補。',
  },
];

export const procedureOrders: ProcedureOrder[] = [
  {
    title: '生活指導',
    status: 'done',
    note: '食事療法と散歩継続を説明済み。',
  },
  {
    title: 'フットチェック',
    status: 'planned',
    note: '次回診察で末梢神経障害評価予定。',
  },
];

export const chartHistory: ChartHistoryItem[] = [
  {
    date: '2026/04/13',
    department: '内科',
    title: '定期検診',
    summary: 'HbA1c 改善傾向。メトホルミン継続。1ヶ月後再診。',
  },
  {
    date: '2026/03/16',
    department: '内科',
    title: '糖尿病フォロー',
    summary: '間食習慣あり。運動開始を提案。採血オーダー実施。',
  },
  {
    date: '2026/02/10',
    department: '眼科',
    title: '眼科連携',
    summary: '糖尿病性網膜症スクリーニング。明らかな進行所見なし。',
  },
];

export const patientProfile: PatientProfileItem[] = [
  { label: '既往歴', value: '2型糖尿病、高血圧症、脂質異常症' },
  { label: '生活歴', value: '朝30分散歩。喫煙歴なし。飲酒は機会飲酒。' },
  { label: '家族歴', value: '父に糖尿病、母に高血圧あり。' },
  { label: '感染症', value: '特記事項なし' },
  { label: '服薬アドヒアランス', value: '概ね良好。飲み忘れは月1回程度。' },
];

export const nextVisit = {
  date: '2026/05/11（月）10:00',
  department: '内科 - 田中 太郎',
  note: 'HbA1c・血糖フォロー',
};

export const soap = {
  subjective:
    '特に自覚症状なし。食事療法は継続中。間食を控えるよう努力しているとのこと。\n最近は朝の散歩を始め、30分程度歩いている。\n前回処方のメトホルミンは副作用なく服用できている。',
  objective:
    '身体所見:\n胸部聴診 - 心音整、心雑音なし。呼吸音清。\n腹部 - 平坦・軟、圧痛なし。',
  assessment:
    '#1 2型糖尿病\n  HbA1c 7.2%（前回 7.5%）、空腹時血糖 138 mg/dL。改善傾向。\n  運動療法の開始が奏功していると考える。現行治療を継続。\n\n#2 高血圧症\n  BP 132/78 mmHg。コントロール良好。現行投薬継続。',
  plan:
    '1. メトホルミン 500mg 1日2回 朝夕食後 継続\n2. アムロジピン 5mg 1日1回 朝食後 継続\n3. 食事療法・運動療法の継続を指導\n4. 次回1ヶ月後に再診、HbA1c・血糖フォロー予定',
};

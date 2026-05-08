import type { LabSetOption, PrescriptionCatalogItem, ReservationSlot, UserAccount } from '../types/workflow';

export const demoUsers: UserAccount[] = [
  {
    id: 'dr.tanaka',
    password: 'manta-demo',
    displayName: '田中 太郎',
    department: '内科',
    role: '医師',
    passwordExpiresAt: '2026-06-30',
  },
  {
    id: 'admin.sato',
    password: 'manta-admin',
    displayName: '佐藤 美紀',
    department: '医事課',
    role: '管理者',
    passwordExpiresAt: '2026-12-31',
  },
];

export const prescriptionCatalog: PrescriptionCatalogItem[] = [
  {
    id: 'metformin-500',
    drugName: 'メトホルミン塩酸塩錠 500mg',
    category: '内服',
    dosageOptions: ['1回1錠 1日2回 朝夕食後', '1回1錠 1日1回 夕食後'],
    aliases: [],
    relatedProblem: '#1 2型糖尿病',
  },
  {
    id: 'amlodipine-5',
    drugName: 'アムロジピンOD錠 5mg',
    category: '内服',
    dosageOptions: ['1回1錠 1日1回 朝食後'],
    aliases: [],
    relatedProblem: '#2 高血圧症',
  },
  {
    id: 'rosuvastatin-25',
    drugName: 'ロスバスタチン錠 2.5mg',
    category: '内服',
    dosageOptions: ['1回1錠 1日1回 朝食後'],
    aliases: [],
    relatedProblem: '#3 脂質異常症',
  },
  {
    id: 'amoxicillin-250',
    drugName: 'アモキシシリンカプセル 250mg',
    category: '内服',
    dosageOptions: ['1回2カプセル 1日3回 毎食後'],
    aliases: [],
    allergyConflictLabel: 'ペニシリンアレルギー',
  },
  {
    id: 'loxoprofen-60',
    drugName: 'ロキソプロフェン錠 60mg',
    category: '頓服',
    dosageOptions: ['疼痛時 1回1錠 1日3回まで'],
    aliases: [],
  },
];

export const prescriptionDayOptions = ['14', '21', '28', '30', '35', '60', '90'];

export const labSetOptions: LabSetOption[] = [
  {
    id: 'dm-follow',
    label: '糖尿病フォローセット',
    items: ['HbA1c', '血糖', '脂質', '肝機能', '腎機能'],
    includedSetIds: [],
  },
  {
    id: 'cbc-crp',
    label: '炎症スクリーニング',
    items: ['CBC', 'CRP'],
    includedSetIds: [],
  },
  {
    id: 'urine-basic',
    label: '尿一般セット',
    items: ['尿蛋白', '尿糖', '沈渣'],
    includedSetIds: [],
  },
];

export const reservationSlots: ReservationSlot[] = [
  {
    id: '2026-05-11-1000',
    date: '2026/05/11（月）',
    time: '10:00',
    department: '内科',
    doctor: '田中 太郎',
    state: 'available',
    capacity: 4,
    bookedCount: 1,
    remainingCount: 3,
  },
  {
    id: '2026-05-11-1030',
    date: '2026/05/11（月）',
    time: '10:30',
    department: '内科',
    doctor: '田中 太郎',
    state: 'few',
    capacity: 4,
    bookedCount: 3,
    remainingCount: 1,
  },
  {
    id: '2026-05-12-0900',
    date: '2026/05/12（火）',
    time: '09:00',
    department: '内科',
    doctor: '田中 太郎',
    state: 'full',
    capacity: 4,
    bookedCount: 4,
    remainingCount: 0,
  },
  {
    id: '2026-05-18-1000',
    date: '2026/05/18（月）',
    time: '10:00',
    department: '内科',
    doctor: '田中 太郎',
    state: 'available',
    capacity: 4,
    bookedCount: 0,
    remainingCount: 4,
  },
];

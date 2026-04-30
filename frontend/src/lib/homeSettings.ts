import { readStorage, writeStorage } from './storage';

export type HomeProfile = 'clinic' | 'hospital' | 'ward' | 'er' | 'personal';
export type HomeView = 'outpatient' | 'inpatient' | 'emergency' | 'personal' | 'pending' | 'recent';

export type HomeSettings = {
  profile: HomeProfile;
  defaultView: HomeView;
};

export type HomeProfileConfig = {
  label: string;
  description: string;
  defaultView: HomeView;
  views: HomeView[];
};

export const homeSettingsStorageKey = 'manta-home-settings';

export const homeViewLabels: Record<HomeView, string> = {
  outpatient: '外来',
  inpatient: '入院',
  emergency: '救急',
  personal: '自分の担当',
  pending: '未処理',
  recent: '最近',
};

export const homeProfileConfigs: Record<HomeProfile, HomeProfileConfig> = {
  clinic: {
    label: 'クリニック外来',
    description: '予約時刻と受付状態を中心に、本日の外来患者を開く構成です。',
    defaultView: 'outpatient',
    views: ['outpatient', 'pending', 'recent'],
  },
  hospital: {
    label: '病院外来',
    description: '外来を起点に、入院患者や未処理も横断して確認する構成です。',
    defaultView: 'outpatient',
    views: ['outpatient', 'inpatient', 'pending', 'recent'],
  },
  ward: {
    label: '病棟',
    description: '病棟・病室、主治医、入院日数、未読結果を中心に見る構成です。',
    defaultView: 'inpatient',
    views: ['inpatient', 'personal', 'pending', 'recent'],
  },
  er: {
    label: '救急',
    description: '到着時刻、トリアージ、滞在時間を優先する救急向け構成です。',
    defaultView: 'emergency',
    views: ['emergency', 'outpatient', 'inpatient', 'pending', 'recent'],
  },
  personal: {
    label: '医師個人',
    description: '自分の担当患者、未処理、最近開いたカルテを横断する構成です。',
    defaultView: 'personal',
    views: ['personal', 'outpatient', 'inpatient', 'pending', 'recent'],
  },
};

export const defaultHomeSettings: HomeSettings = {
  profile: 'hospital',
  defaultView: homeProfileConfigs.hospital.defaultView,
};

export const normalizeHomeSettings = (settings: Partial<HomeSettings> | null | undefined): HomeSettings => {
  const profile = settings?.profile && homeProfileConfigs[settings.profile] ? settings.profile : defaultHomeSettings.profile;
  const config = homeProfileConfigs[profile];
  const defaultView = settings?.defaultView && config.views.includes(settings.defaultView)
    ? settings.defaultView
    : config.defaultView;

  return { profile, defaultView };
};

export const readHomeSettings = () =>
  normalizeHomeSettings(readStorage<Partial<HomeSettings> | null>(homeSettingsStorageKey, defaultHomeSettings));

export const writeHomeSettings = (settings: HomeSettings) => {
  writeStorage(homeSettingsStorageKey, normalizeHomeSettings(settings));
};

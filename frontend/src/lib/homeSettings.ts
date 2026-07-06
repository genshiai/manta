import { readStorage, writeStorage } from './storage';

export type HomeProfile = 'clinic' | 'hospital' | 'ward' | 'er' | 'personal';
export type HomeView = 'outpatient' | 'inpatient';

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
};

export const homeProfileConfigs: Record<HomeProfile, HomeProfileConfig> = {
  clinic: {
    label: 'クリニック外来',
    description: '予約時刻と受付状態を中心に、本日の外来患者を開く構成です。',
    defaultView: 'outpatient',
    views: ['outpatient'],
  },
  hospital: {
    label: '病院外来',
    description: '外来と入院を切り替え、未処理はフィルタとして確認する構成です。',
    defaultView: 'outpatient',
    views: ['outpatient', 'inpatient'],
  },
  ward: {
    label: '病棟',
    description: '病棟・病室、主治医、入院日数、未読結果を中心に見る構成です。',
    defaultView: 'inpatient',
    views: ['inpatient', 'outpatient'],
  },
  er: {
    label: '救急',
    description: '外来の受付・到着時刻と滞在時間を中心に確認する構成です。',
    defaultView: 'outpatient',
    views: ['outpatient', 'inpatient'],
  },
  personal: {
    label: '医師個人',
    description: '外来と入院を切り替えながら、自分の担当患者を初期スコープにする構成です。',
    defaultView: 'outpatient',
    views: ['outpatient', 'inpatient'],
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

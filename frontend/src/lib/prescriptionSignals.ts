import { readStorage, writeStorage } from './storage';

const prescriptionSignalStorageKey = 'manta-prescription-signals-v1';

export type PrescriptionUsageSignal = {
  selectedCount: number;
  prescribedCount: number;
  lastSelectedAt?: string;
  lastPrescribedAt?: string;
};

type PrescriptionSignalStore = Record<string, Record<string, PrescriptionUsageSignal>>;

const readStore = () => readStorage<PrescriptionSignalStore>(prescriptionSignalStorageKey, {});

export const readPrescriptionSignals = (userId: string): Record<string, PrescriptionUsageSignal> => {
  const store = readStore();
  return store[userId] ?? {};
};

export const recordPrescriptionSignal = (
  userId: string,
  drugId: string,
  kind: 'selected' | 'prescribed',
): Record<string, PrescriptionUsageSignal> => {
  const store = readStore();
  const userSignals = store[userId] ?? {};
  const current = userSignals[drugId] ?? {
    selectedCount: 0,
    prescribedCount: 0,
  };
  const now = new Date().toISOString();
  const nextSignal: PrescriptionUsageSignal = {
    ...current,
    selectedCount: current.selectedCount + (kind === 'selected' ? 1 : 0),
    prescribedCount: current.prescribedCount + (kind === 'prescribed' ? 1 : 0),
    lastSelectedAt: kind === 'selected' ? now : current.lastSelectedAt,
    lastPrescribedAt: kind === 'prescribed' ? now : current.lastPrescribedAt,
  };

  const nextUserSignals = {
    ...userSignals,
    [drugId]: nextSignal,
  };
  writeStorage<PrescriptionSignalStore>(prescriptionSignalStorageKey, {
    ...store,
    [userId]: nextUserSignals,
  });
  return nextUserSignals;
};

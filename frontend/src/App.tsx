import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { ChartWorkspace } from './components/ChartWorkspace';
import { LoginScreen } from './components/LoginScreen';
import { ReceptionBoard } from './components/ReceptionBoard';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { StatusFooter } from './components/StatusFooter';
import { WardWorkspace } from './components/WardWorkspace';
import type { PatientRecord, ReceptionStatus } from './data/chartMock';
import { demoUsers } from './data/workflowMock';
import { getCurrentSession, isUnauthorizedError, listInpatientAdmissions, listPatients, login, updatePatientStatus } from './lib/api';
import { type HomeSettings, readHomeSettings, writeHomeSettings } from './lib/homeSettings';
import { removeStorage, readStorage, writeStorage } from './lib/storage';
import type { ChartMeta, InpatientAdmission, UserSession } from './types/workflow';

type Screen = 'login' | 'reception' | 'chart' | 'settings' | 'ward';
type ChartReturnScreen = 'reception' | 'ward';
type StatusFilter = ReceptionStatus | 'all';
type DepartmentFilter = string | 'all';
type SortKey = 'receptionNumber' | 'reservationTime' | 'elapsed';

const sessionStorageKey = 'manta-session';
const recentChartPatientsStorageKey = 'manta-recent-chart-patients';
const sessionExpiredMessage = 'セッションの有効期限が切れました。再度ログインしてください。';
const initialChartMeta: ChartMeta = {
  isDirty: false,
  lastSavedAt: null,
  version: 1,
  pendingWarnings: 0,
};

const formatTimestamp = () =>
  new Date().toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatLoginError = (message: string) => {
  if (message === 'Invalid credentials') {
    return '利用者 ID またはパスワードが一致しません。';
  }

  if (message === 'Password expired') {
    return 'パスワード有効期限を超えています。';
  }

  return `認証に失敗しました: ${message}`;
};

const formatLoadError = (message: string) => `受付患者一覧の取得に失敗しました: ${message}`;

const readStoredSession = () => {
  const storedSession = readStorage<UserSession | null>(sessionStorageKey, null);

  if (!storedSession?.accessToken) {
    return null;
  }

  return storedSession;
};

const readRecentChartPatients = () =>
  readStorage<PatientRecord[]>(recentChartPatientsStorageKey, []);

function App() {
  const [session, setSession] = useState<UserSession | null>(readStoredSession);
  const [screen, setScreen] = useState<Screen>(() =>
    readStoredSession() ? 'reception' : 'login',
  );
  const [isRestoringSession, setIsRestoringSession] = useState(() => Boolean(readStoredSession()));
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [inpatientAdmissions, setInpatientAdmissions] = useState<InpatientAdmission[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [chartReturnScreen, setChartReturnScreen] = useState<ChartReturnScreen>('reception');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('receptionNumber');
  const [lastRefreshedAt, setLastRefreshedAt] = useState(formatTimestamp);
  const [loginUserId, setLoginUserId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [chartMeta, setChartMeta] = useState<ChartMeta>(initialChartMeta);
  const [homeSettings, setHomeSettings] = useState<HomeSettings>(readHomeSettings);
  const [recentChartPatients, setRecentChartPatients] = useState<PatientRecord[]>(readRecentChartPatients);

  const resetClientSession = useCallback((message?: string) => {
    setSession(null);
    setScreen('login');
    setPatients([]);
    setInpatientAdmissions([]);
    setSelectedPatient(null);
    setLoginPassword('');
    setLoginAttempts(0);
    setPatientsError(null);
    setChartMeta(initialChartMeta);
    setLoginError(message ?? null);
  }, []);

  useEffect(() => {
    if (session) {
      writeStorage(sessionStorageKey, session);
      return;
    }

    removeStorage(sessionStorageKey);
  }, [session]);

  useEffect(() => {
    writeHomeSettings(homeSettings);
  }, [homeSettings]);

  useEffect(() => {
    writeStorage(recentChartPatientsStorageKey, recentChartPatients.slice(0, 8));
  }, [recentChartPatients]);

  useEffect(() => {
    const storedSession = readStoredSession();

    if (!storedSession?.accessToken) {
      setIsRestoringSession(false);
      return;
    }

    let cancelled = false;

    const restoreSession = async () => {
      try {
        const nextSession = await getCurrentSession(storedSession.accessToken);

        if (cancelled) {
          return;
        }

        setSession(nextSession);
        setScreen('reception');
        setLoginError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isUnauthorizedError(error)) {
          resetClientSession(sessionExpiredMessage);
        }
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [resetClientSession]);

  useEffect(() => {
    if (!session || isRestoringSession) {
      setPatients([]);
      setInpatientAdmissions([]);
      return;
    }

    const requestToken = refreshToken;
    void requestToken;

    let cancelled = false;

    const loadRemoteState = async () => {
      setPatientsLoading(true);
      setPatientsError(null);

      try {
        const [nextPatients, nextInpatientAdmissions] = await Promise.all([
          listPatients({
            searchQuery,
            statusFilter,
            departmentFilter,
            sortKey,
          }),
          listInpatientAdmissions({ status: 'active', searchQuery }),
        ]);

        if (cancelled) {
          return;
        }

        setPatients(nextPatients);
        setInpatientAdmissions(nextInpatientAdmissions);
        setLastRefreshedAt(formatTimestamp());

        if (nextPatients.length === 0) {
          return;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isUnauthorizedError(error)) {
          resetClientSession(sessionExpiredMessage);
          return;
        }

        setPatientsError(
          formatLoadError(error instanceof Error ? error.message : '不明なエラー'),
        );
      } finally {
        if (!cancelled) {
          setPatientsLoading(false);
        }
      }
    };

    loadRemoteState();

    return () => {
      cancelled = true;
    };
  }, [departmentFilter, isRestoringSession, refreshToken, resetClientSession, searchQuery, session, sortKey, statusFilter]);

  useEffect(() => {
    if (!selectedPatient?.id) {
      return;
    }

    const synced = patients.find((patient) => patient.id === selectedPatient.id);
    if (synced && synced !== selectedPatient) {
      setSelectedPatient(synced);
    }
  }, [patients, selectedPatient]);

  const currentPatient = screen === 'chart' ? selectedPatient : null;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
  };

  const handleDepartmentFilterChange = (value: DepartmentFilter) => {
    setDepartmentFilter(value);
  };

  const handleSortChange = (value: SortKey) => {
    setSortKey(value);
  };

  const handleLogin = async () => {
    if (loginAttempts >= 5 || isAuthenticating) {
      setLoginError('リトライ回数を超えたため、このセッションでは利用できません。');
      return;
    }

    setIsAuthenticating(true);

    try {
      const nextSession = await login(loginUserId.trim(), loginPassword);
      setSession(nextSession);
      setScreen('reception');
      setLoginAttempts(0);
      setLoginError(null);
      setLoginPassword('');
      setRefreshToken((current) => current + 1);
    } catch (error) {
      const nextAttempts = loginAttempts + 1;

      setLoginAttempts(nextAttempts);
      setLoginError(
        nextAttempts >= 5
          ? 'リトライ回数を超えたため、このセッションでは利用できません。'
          : formatLoginError(error instanceof Error ? error.message : '不明なエラー'),
      );
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSwitchUser = () => {
    resetClientSession();
    setLoginUserId('');
  };

  const rememberChartPatient = (patient: PatientRecord) => {
    setRecentChartPatients((current) => [
      patient,
      ...current.filter((item) => item.id !== patient.id),
    ].slice(0, 8));
  };

  const handleOpenPatient = (patient: PatientRecord, returnTo: ChartReturnScreen = 'reception') => {
    if (!patient) {
      return;
    }

    setSelectedPatient(patient);
    setChartReturnScreen(returnTo);
    rememberChartPatient(patient);
    setScreen('chart');
  };

  const handleOpenChart = (patientId: string, returnTo: ChartReturnScreen = 'reception') => {
    const patient =
      patients.find((item) => item.id === patientId) ??
      recentChartPatients.find((item) => item.id === patientId);

    if (!patient) {
      return;
    }

    handleOpenPatient(patient, returnTo);
  };

  const handlePatientStatusChange = async (
    patientId: string,
    nextStatus: ReceptionStatus,
    detail: string,
  ) => {
    if (!session) {
      return;
    }

    let updatedPatient: PatientRecord;

    try {
      updatedPatient = await updatePatientStatus(patientId, {
        status: nextStatus,
        actor: session.displayName,
        detail,
      });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        resetClientSession(sessionExpiredMessage);
      }

      throw error;
    }

    setPatients((current) =>
      current.map((patient) => (patient.id === updatedPatient.id ? updatedPatient : patient)),
    );
    if (selectedPatient?.id === updatedPatient.id) {
      setSelectedPatient(updatedPatient);
    }
    setRefreshToken((current) => current + 1);
  };

  if (isRestoringSession) {
    return (
      <div className='min-h-screen bg-surface-page text-text-primary'>
        <main className='mx-auto flex min-h-screen max-w-[720px] items-center px-4 py-8'>
          <section className='w-full rounded-8 border border-solid-gray-200 bg-white p-6'>
            <p className='text-[20px] font-bold leading-snug text-solid-gray-900'>認証状態を確認しています。</p>
            <p className='mt-2 text-[16px] font-normal leading-none text-solid-gray-700'>
              保存済みのセッションを検証中です。
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (!session || screen === 'login') {
    return (
      <div className='min-h-screen bg-surface-page text-text-primary'>
        <LoginScreen
          accounts={demoUsers}
          errorMessage={loginError}
          isLocked={loginAttempts >= 5}
          isSubmitting={isAuthenticating}
          onFillDemo={(account) => {
            setLoginUserId(account.id);
            setLoginPassword(account.password);
          }}
          onPasswordChange={setLoginPassword}
          onSubmit={handleLogin}
          onUserIdChange={setLoginUserId}
          password={loginPassword}
          remainingAttempts={Math.max(0, 5 - loginAttempts)}
          userId={loginUserId}
        />
      </div>
    );
  }

  // chart 画面はアプリシェル型 (h-screen overflow-hidden)
  // それ以外 (reception/settings) は従来の min-h-screen
  const isChartScreen = screen === 'chart' && Boolean(selectedPatient);
  const rootClassName = isChartScreen
    ? 'flex h-screen flex-col overflow-hidden bg-surface-page text-text-primary'
    : 'min-h-screen bg-surface-page text-text-primary';
  const mainSlotClassName = isChartScreen ? 'min-h-0 flex-1 overflow-hidden' : '';

  return (
    <div className={rootClassName}>
      <AppHeader
        currentUser={session}
        currentPatient={currentPatient}
        onNavigate={setScreen}
        onSearchChange={handleSearchChange}
        onSwitchUser={handleSwitchUser}
        screen={screen === 'chart' ? 'chart' : screen === 'settings' ? 'settings' : screen === 'ward' ? 'ward' : 'reception'}
        searchQuery={searchQuery}
      />

      <div className={mainSlotClassName}>
        {screen === 'settings' ? (
          <SettingsWorkspace
            currentUser={session}
            homeSettings={homeSettings}
            onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
            onHomeSettingsChange={setHomeSettings}
          />
        ) : screen === 'ward' ? (
          <WardWorkspace
            admissions={inpatientAdmissions}
            onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
            onOpenChart={(patientId) => handleOpenChart(patientId, 'ward')}
            onRefreshAdmissions={setInpatientAdmissions}
          />
        ) : screen === 'reception' ? (
          <ReceptionBoard
            currentUser={session}
            departmentFilter={departmentFilter}
            errorMessage={patientsError}
            homeSettings={homeSettings}
            inpatientAdmissions={inpatientAdmissions}
            isLoading={patientsLoading}
            lastRefreshedAt={lastRefreshedAt}
            onDepartmentFilterChange={handleDepartmentFilterChange}
            onOpenChart={(patientId) => handleOpenChart(patientId, 'reception')}
            onSearchChange={handleSearchChange}
            onSortChange={handleSortChange}
            onStatusFilterChange={handleStatusFilterChange}
            patients={patients}
            searchQuery={searchQuery}
            sortKey={sortKey}
            statusFilter={statusFilter}
          />
        ) : selectedPatient ? (
          <ChartWorkspace
            availablePatients={patients}
            currentUser={session}
            onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
            onDataChanged={() => setRefreshToken((current) => current + 1)}
            onMetaChange={setChartMeta}
            onOpenPatient={handleOpenPatient}
            onPatientStatusChange={handlePatientStatusChange}
            onReturnReception={() => setScreen(chartReturnScreen)}
            patient={selectedPatient}
            currentAdmission={inpatientAdmissions.find((admission) => admission.patientId === selectedPatient.id && admission.status === 'active')}
            recentPatients={recentChartPatients}
          />
        ) : (
          <main className='mx-auto max-w-[1600px] px-4 py-8 lg:px-6'>
            <section className='rounded-8 border border-solid-gray-200 bg-white p-6'>
              <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>カルテ対象の患者が未選択です。</p>
            </section>
          </main>
        )}
      </div>

      <StatusFooter
        chartMeta={chartMeta}
        currentPatient={currentPatient ?? undefined}
        currentUser={session}
        screen={screen === 'chart' ? 'chart' : screen === 'settings' ? 'settings' : screen === 'ward' ? 'ward' : 'reception'}
      />
    </div>
  );
}

export default App;

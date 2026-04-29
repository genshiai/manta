import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { ChartWorkspace } from './components/ChartWorkspace';
import { LoginScreen } from './components/LoginScreen';
import { ReceptionBoard } from './components/ReceptionBoard';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { StatusFooter } from './components/StatusFooter';
import type { PatientRecord, ReceptionStatus } from './data/chartMock';
import { demoUsers } from './data/workflowMock';
import { getCurrentSession, isUnauthorizedError, listPatients, login, updatePatientStatus } from './lib/api';
import { removeStorage, readStorage, writeStorage } from './lib/storage';
import type { ChartMeta, UserSession } from './types/workflow';

type Screen = 'login' | 'reception' | 'chart' | 'settings';
type StatusFilter = ReceptionStatus | 'all';
type DepartmentFilter = string | 'all';
type SortKey = 'receptionNumber' | 'reservationTime' | 'elapsed';

const sessionStorageKey = 'manta-session';
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

function App() {
  const [session, setSession] = useState<UserSession | null>(readStoredSession);
  const [screen, setScreen] = useState<Screen>(() =>
    readStoredSession() ? 'reception' : 'login',
  );
  const [isRestoringSession, setIsRestoringSession] = useState(() => Boolean(readStoredSession()));
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
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

  const resetClientSession = useCallback((message?: string) => {
    setSession(null);
    setScreen('login');
    setPatients([]);
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
      return;
    }

    const requestToken = refreshToken;
    void requestToken;

    let cancelled = false;

    const loadRemoteState = async () => {
      setPatientsLoading(true);
      setPatientsError(null);

      try {
        const nextPatients = await listPatients({
          searchQuery,
          statusFilter,
          departmentFilter,
          sortKey,
        });

        if (cancelled) {
          return;
        }

        setPatients(nextPatients);
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

  const handleOpenChart = (patientId: string) => {
    const patient = patients.find((item) => item.id === patientId);

    if (!patient) {
      return;
    }

    setSelectedPatient(patient);
    setScreen('chart');
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
      <div className='min-h-screen bg-[#F5F6FA] text-solid-gray-900'>
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
      <div className='min-h-screen bg-[#F5F6FA] text-solid-gray-900'>
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

  return (
    <div className='min-h-screen bg-[#F5F6FA] text-solid-gray-900'>
      <AppHeader
        currentUser={session}
        onNavigate={setScreen}
        onSearchChange={handleSearchChange}
        onSwitchUser={handleSwitchUser}
        screen={screen === 'chart' ? 'chart' : screen === 'settings' ? 'settings' : 'reception'}
        searchQuery={searchQuery}
      />

      {screen === 'settings' ? (
        <SettingsWorkspace
          currentUser={session}
          onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
        />
      ) : screen === 'reception' ? (
        <ReceptionBoard
          departmentFilter={departmentFilter}
          errorMessage={patientsError}
          isLoading={patientsLoading}
          lastRefreshedAt={lastRefreshedAt}
          onDepartmentFilterChange={handleDepartmentFilterChange}
          onOpenChart={handleOpenChart}
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
          currentUser={session}
          onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
          onDataChanged={() => setRefreshToken((current) => current + 1)}
          onMetaChange={setChartMeta}
          onPatientStatusChange={handlePatientStatusChange}
          onReturnReception={() => setScreen('reception')}
          patient={selectedPatient}
        />
      ) : (
        <main className='mx-auto max-w-[1600px] px-4 py-8 lg:px-6'>
          <section className='rounded-8 border border-solid-gray-200 bg-white p-6'>
            <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>カルテ対象の患者が未選択です。</p>
          </section>
        </main>
      )}

      <StatusFooter
        chartMeta={chartMeta}
        currentPatient={currentPatient ?? undefined}
        currentUser={session}
        screen={screen === 'chart' ? 'chart' : screen === 'settings' ? 'settings' : 'reception'}
      />
    </div>
  );
}

export default App;

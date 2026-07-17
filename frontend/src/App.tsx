import { useCallback, useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { BillingWorkspace } from './components/BillingWorkspace';
import { ChartWorkspace } from './components/ChartWorkspace';
import { CommunicationWorkspace } from './components/CommunicationWorkspace';
import { LoginScreen } from './components/LoginScreen';
import { OutpatientWorkspace } from './components/OutpatientWorkspace';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { WardWorkspace } from './components/WardWorkspace';
import type { SettingsSection } from './components/workspace/WorkspaceContextPane';
import type { PatientRecord, ReceptionStatus } from './data/chartMock';
import { demoUsers } from './data/workflowMock';
import { getCurrentSession, isUnauthorizedError, listCommunicationThreads, listInpatientAdmissions, listPatients, login, updatePatientStatus } from './lib/api';
import { type HomeSettings, readHomeSettings, writeHomeSettings } from './lib/homeSettings';
import { removeStorage, readStorage, writeStorage } from './lib/storage';
import type { ChartMeta, CommunicationThread, InpatientAdmission, UserSession } from './types/workflow';

type Screen = 'login' | 'reception' | 'chart' | 'settings' | 'ward' | 'billing' | 'messages';
type ChartReturnScreen = 'reception' | 'ward' | 'billing' | 'messages';
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
  const [communicationThreads, setCommunicationThreads] = useState<CommunicationThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>();
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('users');
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
  const [, setChartMeta] = useState<ChartMeta>(initialChartMeta);
  const [homeSettings, setHomeSettings] = useState<HomeSettings>(readHomeSettings);
  const [recentChartPatients, setRecentChartPatients] = useState<PatientRecord[]>(readRecentChartPatients);

  const resetClientSession = useCallback((message?: string) => {
    setSession(null);
    setScreen('login');
    setPatients([]);
    setInpatientAdmissions([]);
    setCommunicationThreads([]);
    setActiveThreadId(undefined);
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
        setScreen(nextSession.role === '管理者' ? 'billing' : 'reception');
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
      setCommunicationThreads([]);
      return;
    }

    const requestToken = refreshToken;
    void requestToken;

    let cancelled = false;

    const loadRemoteState = async () => {
      setPatientsLoading(true);
      setPatientsError(null);

      try {
        const [nextPatients, nextInpatientAdmissions, nextCommunicationThreads] = await Promise.all([
          listPatients({
            searchQuery,
            statusFilter,
            departmentFilter,
            sortKey,
          }),
          listInpatientAdmissions({ status: 'all', searchQuery }),
          listCommunicationThreads(),
        ]);

        if (cancelled) {
          return;
        }

        setPatients(nextPatients);
        setInpatientAdmissions(nextInpatientAdmissions.filter(
          (admission) => admission.status === 'active' || admission.status === 'discharge_permitted',
        ));
        setCommunicationThreads(nextCommunicationThreads);
        setActiveThreadId((current) => current ?? nextCommunicationThreads[0]?.id);
        setLastRefreshedAt(formatTimestamp());
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

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleCommunicationChanged = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  const handleAuthExpired = useCallback(() => {
    resetClientSession(sessionExpiredMessage);
  }, [resetClientSession]);

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
      setScreen(nextSession.role === '管理者' ? 'billing' : 'reception');
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

  const handleOpenWard = () => {
    setSelectedPatient(null);
    setScreen('ward');
  };

  const handleWorkspaceNavigate = (target: 'reception' | 'ward' | 'billing' | 'messages' | 'settings') => {
    if (target === 'ward') {
      handleOpenWard();
      return;
    }
    setScreen(target);
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

  // カルテ画面は ClinicalShell が 56px レール込みでビューポート全体を占有する
  // （AppShell の共通トップバーは出さず、独自の TopBar/PatientBar/AIStrip を使う。KARTE_UI_SPEC §3）。
  const isChartScreen = screen === 'chart' && Boolean(selectedPatient);

  if (isChartScreen && selectedPatient) {
    return (
      <div className="h-screen overflow-hidden bg-surface-page text-text-primary">
        <ChartWorkspace
          availableAdmissions={inpatientAdmissions}
          availablePatients={patients}
          currentUser={session}
          unreadMessageCount={communicationThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)}
          onAuthExpired={handleAuthExpired}
          onDataChanged={() => setRefreshToken((current) => current + 1)}
          onMetaChange={setChartMeta}
          onNavigate={handleWorkspaceNavigate}
          onSwitchUser={handleSwitchUser}
          onOpenPatient={(patient) => handleOpenPatient(patient, chartReturnScreen)}
          onPatientStatusChange={handlePatientStatusChange}
          onReturnReception={() => {
            if (chartReturnScreen === 'ward') {
              handleOpenWard();
              return;
            }
            setScreen(chartReturnScreen);
          }}
          patient={selectedPatient}
          currentAdmission={chartReturnScreen === 'ward' ? inpatientAdmissions.find(
            (admission) => admission.patientId === selectedPatient.id && admission.status === 'active',
          ) : undefined}
          recentPatients={recentChartPatients}
        />
      </div>
    );
  }

  const shellScreen: 'reception' | 'ward' | 'billing' | 'messages' | 'settings' =
    screen === 'settings' ? 'settings' : screen === 'ward' ? 'ward' : screen === 'billing' ? 'billing' : screen === 'messages' ? 'messages' : 'reception';

  return (
    <AppShell
      admissions={inpatientAdmissions}
      activeThreadId={activeThreadId}
      communicationThreads={communicationThreads}
      currentUser={session}
      onNavigate={handleWorkspaceNavigate}
      onOpenChart={(patientId) => handleOpenChart(patientId, shellScreen === 'ward' ? 'ward' : shellScreen === 'billing' ? 'billing' : shellScreen === 'messages' ? 'messages' : 'reception')}
      onOpenThread={(threadId) => {
        setActiveThreadId(threadId);
        setScreen('messages');
      }}
      onSearchChange={handleSearchChange}
      onSwitchUser={handleSwitchUser}
      settingsSection={settingsSection}
      onSettingsSectionChange={setSettingsSection}
      patients={patients}
      screen={shellScreen}
      searchQuery={searchQuery}
    >
      {screen === 'settings' ? (
          <SettingsWorkspace
            currentUser={session}
            homeSettings={homeSettings}
            onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
            onHomeSettingsChange={setHomeSettings}
            section={settingsSection}
          />
        ) : screen === 'messages' ? (
          <CommunicationWorkspace
            activeThreadId={activeThreadId}
            currentUser={session}
            onActiveThreadChange={setActiveThreadId}
            onAuthExpired={handleAuthExpired}
            onOpenChart={(patientId) => handleOpenChart(patientId, 'messages')}
            onThreadsChanged={handleCommunicationChanged}
            threads={communicationThreads}
          />
        ) : screen === 'ward' ? (
          <WardWorkspace
            admissions={inpatientAdmissions}
            currentUser={session}
            onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
            onOpenChart={(patientId) => handleOpenChart(patientId, 'ward')}
            onRefreshAdmissions={setInpatientAdmissions}
          />
        ) : screen === 'billing' ? (
          <BillingWorkspace
            currentUser={session}
            onAuthExpired={() => resetClientSession(sessionExpiredMessage)}
            onOpenChart={(patientId) => handleOpenChart(patientId, 'billing')}
            onSearchChange={handleSearchChange}
            patients={patients}
            searchQuery={searchQuery}
          />
        ) : screen === 'reception' ? (
          <OutpatientWorkspace
            currentUser={session}
            departmentFilter={departmentFilter}
            errorMessage={patientsError}
            isLoading={patientsLoading}
            lastRefreshedAt={lastRefreshedAt}
            onDepartmentFilterChange={handleDepartmentFilterChange}
            onOpenChart={(patientId) => handleOpenChart(patientId, 'reception')}
            onSortChange={handleSortChange}
            onStatusFilterChange={handleStatusFilterChange}
            patients={patients}
            sortKey={sortKey}
            statusFilter={statusFilter}
          />
        ) : (
          <main className='mx-auto max-w-[1600px] px-4 py-8 lg:px-6'>
            <section className='rounded-8 border border-solid-gray-200 bg-white p-6'>
              <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>カルテ対象の患者が未選択です。</p>
            </section>
          </main>
        )}
    </AppShell>
  );
}

export default App;

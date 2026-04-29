import { Button, Heading, HeadingTitle, Input } from '../vendor/dads';
import type { UserAccount } from '../types/workflow';

type LoginScreenProps = {
  accounts: UserAccount[];
  userId: string;
  password: string;
  errorMessage: string | null;
  remainingAttempts: number;
  isLocked: boolean;
  isSubmitting: boolean;
  onUserIdChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onFillDemo: (account: UserAccount) => void;
};

const surfaceClassName = 'rounded-8 border border-solid-gray-200 bg-white';

export const LoginScreen = ({
  accounts,
  userId,
  password,
  errorMessage,
  remainingAttempts,
  isLocked,
  isSubmitting,
  onUserIdChange,
  onPasswordChange,
  onSubmit,
  onFillDemo,
}: LoginScreenProps) => (
  <main className='mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10 lg:px-6'>
    <div className='flex items-center gap-3'>
      <div className='grid h-10 w-10 place-items-center rounded-8 bg-blue-900 text-[18px] font-bold leading-snug text-white'>
        M
      </div>
      <div>
        <p className='text-[20px] font-bold leading-snug text-solid-gray-900'>Manta</p>
        <p className='text-[14px] font-normal leading-none text-solid-gray-536'>外来電子カルテ</p>
      </div>
    </div>

    <section className={surfaceClassName}>
      <div className='px-6 pb-2 pt-6'>
        <Heading size='24'>
          <HeadingTitle level='h1'>ログイン</HeadingTitle>
        </Heading>
      </div>

      <form
        className='space-y-4 px-6 pb-6 pt-4'
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className='space-y-2'>
          <label className='text-[14px] font-bold leading-none text-solid-gray-700' htmlFor='login-user-id'>
            利用者 ID
          </label>
          <Input
            blockSize='md'
            id='login-user-id'
            onChange={(event) => onUserIdChange(event.target.value)}
            placeholder='dr.tanaka'
            value={userId}
          />
        </div>

        <div className='space-y-2'>
          <label className='text-[14px] font-bold leading-none text-solid-gray-700' htmlFor='login-password'>
            パスワード
          </label>
          <Input
            blockSize='md'
            id='login-password'
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder='••••••••'
            type='password'
            value={password}
          />
        </div>

        {errorMessage ? (
          <div className='rounded-8 border border-red-200 bg-red-50 px-4 py-3'>
            <p className='text-[16px] font-bold leading-none text-red-1000'>{errorMessage}</p>
            {!isLocked ? (
              <p className='mt-1 text-[14px] font-normal leading-none text-red-900'>残り試行回数: {remainingAttempts} 回</p>
            ) : null}
          </div>
        ) : null}

        <Button aria-disabled={isLocked || isSubmitting} size='md' type='submit' variant='solid-fill'>
          {isSubmitting ? '認証中...' : 'ログイン'}
        </Button>
      </form>
    </section>

    <details className='group text-[14px] font-normal leading-none text-solid-gray-536'>
      <summary className='cursor-pointer select-none text-[14px] font-bold leading-none text-solid-gray-700 hover:text-solid-gray-900'>
        デモ利用者を使う
      </summary>
      <div className='mt-3 space-y-2'>
        {accounts.map((account) => (
          <button
            className='flex w-full items-center justify-between gap-3 rounded-8 border border-solid-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-solid-gray-300'
            key={account.id}
            onClick={() => onFillDemo(account)}
            type='button'
          >
            <div>
              <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{account.displayName}</p>
              <p className='mt-1 text-mono-14N-150 text-solid-gray-536'>
                {account.id} / {account.password}
              </p>
            </div>
            <span className='text-[14px] font-normal leading-none text-solid-gray-700'>{account.role}</span>
          </button>
        ))}
      </div>
    </details>
  </main>
);

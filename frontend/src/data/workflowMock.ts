import type { UserAccount } from '../types/workflow';

// ログイン画面の「デモ利用者を使う」ワンクリック入力用。
// 実際のパスワード期限はバックエンド（seed）が起動日から相対で発行する。
export const demoUsers: UserAccount[] = [
  {
    id: 'dr.tanaka',
    password: 'manta-demo',
    displayName: '田中 太郎',
    department: '内科',
    role: '医師',
    passwordExpiresAt: '',
  },
  {
    id: 'admin.sato',
    password: 'manta-admin',
    displayName: '佐藤 美紀',
    department: '医事課',
    role: '管理者',
    passwordExpiresAt: '',
  },
];

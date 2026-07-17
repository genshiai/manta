import { ExternalLink, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isUnauthorizedError, listCommunicationMessages, markCommunicationThreadRead, sendCommunicationMessage } from '../lib/api';
import type { CommunicationMessage, CommunicationThread, UserSession } from '../types/workflow';
import { cn } from './ui/utils';
import { toast } from './ui/toast';

type CommunicationWorkspaceProps = {
  threads: CommunicationThread[];
  activeThreadId?: string;
  currentUser: UserSession;
  onActiveThreadChange: (threadId: string) => void;
  onThreadsChanged: () => void;
  onOpenChart: (patientId: string) => void;
  onAuthExpired: () => void;
};

export function CommunicationWorkspace({
  threads,
  activeThreadId,
  currentUser,
  onActiveThreadChange,
  onThreadsChanged,
  onOpenChart,
  onAuthExpired,
}: CommunicationWorkspaceProps) {
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0];
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const threadId = activeThread?.id;

  useEffect(() => {
    if (!activeThreadId && threads[0]) onActiveThreadChange(threads[0].id);
  }, [activeThreadId, onActiveThreadChange, threads]);

  const loadMessages = useCallback(async () => {
    if (!threadId) return;
    setIsLoading(true);
    setError(null);
    try {
      const next = await listCommunicationMessages(threadId);
      setMessages(next);
      await markCommunicationThreadRead(threadId);
      onThreadsChanged();
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }));
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        onAuthExpired();
        return;
      }
      setError(`連絡の取得に失敗しました: ${loadError instanceof Error ? loadError.message : '不明なエラー'}`);
    } finally {
      setIsLoading(false);
    }
  }, [onAuthExpired, onThreadsChanged, threadId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!activeThread || !body || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const message = await sendCommunicationMessage(activeThread.id, body);
      setMessages((current) => [...current, message]);
      setDraft('');
      onThreadsChanged();
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }));
    } catch (sendError) {
      if (isUnauthorizedError(sendError)) {
        onAuthExpired();
        return;
      }
      setError(`送信に失敗しました: ${sendError instanceof Error ? sendError.message : '不明なエラー'}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!activeThread) {
    return <main className="grid h-full place-items-center text-[13px] text-text-tertiary">表示できる院内スレッドがありません。</main>;
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-[860px] flex-col px-5 pb-5">
      <div className="flex h-11 flex-none items-center border-b border-border text-[11.5px] text-text-tertiary">
        今日 — {activeThread.patientName ? `${activeThread.patientName}${activeThread.patientId ? `（${activeThread.patientId}）` : ''}についてのスレッド` : activeThread.title} · 参加: {activeThread.participantLabels.join(' / ') || activeThread.department}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {isLoading ? <p className="py-8 text-center text-[12px] text-text-tertiary">スレッドを読み込んでいます…</p> : null}
        {error ? <p className="mb-3 rounded-lg bg-destructive-bg px-3 py-2 text-[12px] text-destructive">{error}</p> : null}
        <div>
          {messages.map((message) => {
            const mine = message.authorUserId === currentUser.userId;
            return (
              <article className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-b border-border py-4" key={message.id}>
                <span className={cn('grid size-8 place-items-center rounded-full bg-surface-muted text-[11px] font-bold text-text-secondary', mine && 'bg-brand-tint text-brand')}>{message.authorName.slice(0, 1)}</span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5 text-[11px] text-text-tertiary">
                    <b className="text-[12px] text-text-primary">{message.authorName}</b>
                    <span>{message.authorRole}{mine ? ' · あなた' : ''}</span>
                    <span className="tabular-nums">{message.createdAt}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-[1.75] text-text-primary">{message.body}</p>
                  {!mine && activeThread.patientId ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-border bg-surface-subtle px-2.5 py-1 text-[11px] font-semibold text-text-secondary">関連するカルテ・請求ドラフト</span>
                      <button className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline" onClick={() => onOpenChart(activeThread.patientId ?? '')} type="button">カルテで該当箇所を開く <ExternalLink size={11} /></button>
                    </div>
                  ) : null}
                  {mine && activeThread.patientId ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded-lg bg-brand px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
                        disabled={approved}
                        onClick={() => { setApproved(true); toast('承認内容を病名候補へ反映しました。', 'success'); }}
                        type="button"
                      >
                        {approved ? '病名候補へ反映済み' : '承認して病名を追加'}
                      </button>
                      <button className="rounded-lg border border-border-strong bg-card px-3 py-1.5 text-[11.5px] font-semibold" onClick={() => onOpenChart(activeThread.patientId ?? '')} type="button">カルテを確認</button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      <div className="flex-none border-t border-border pt-3">
        <div className="flex items-center rounded-xl border border-border-strong bg-card px-3 py-2">
        <textarea aria-label="メッセージ" className="min-h-8 flex-1 resize-none bg-transparent text-[13px] leading-[1.6] outline-none placeholder:text-text-tertiary" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handleSend();
          }
        }} placeholder={activeThread.patientId ? 'メッセージを入力…（このスレッドは患者カルテに紐づいています）' : '院内メッセージを入力…'} rows={1} value={draft} />
          <button className="ms-3 inline-flex h-7 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11.5px] font-semibold text-white disabled:opacity-50" disabled={!draft.trim() || isSending} onClick={() => void handleSend()} type="button">
            <Send size={12} /> 送信 <span className="opacity-75">⌘⏎</span>
          </button>
        </div>
        <p className="pt-2 text-[10.5px] text-text-tertiary">院内完結 — PHI を外部のチャットアプリに出しません。結果到着・照会・署名依頼の通知もここに届きます。</p>
      </div>
    </main>
  );
}

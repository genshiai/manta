import { AtSign, FileText, Mic, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LabResultEntry, VitalEntry } from '../../../types/workflow';
import type { SoapText } from '../sheet/streamModel';

type FieldKey = keyof SoapText;

type WriteToolsTrayProps = {
  missingDxCount: number;
  labResults: LabResultEntry[];
  vitals: VitalEntry[];
  previousAssessment?: string;
  onInsert: (section: FieldKey, text: string) => void;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 書くための道具トレイ（Write中のみ）。スクライブ器は器のみ（生成はスタブ・§13）。 */
export function WriteToolsTray({
  missingDxCount,
  labResults,
  vitals,
  previousAssessment,
  onInsert,
}: WriteToolsTrayProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (recording) {
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timer.current) {
      clearInterval(timer.current);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [recording]);

  const abnormalText = labResults
    .filter((r) => r.flag !== 'normal')
    .map((r) => `${r.item} ${r.result}`)
    .join('、');
  const vitalsText = vitals.map((v) => `${v.label} ${v.value}${v.unit}`).join(' / ');

  const stopAndDraft = () => {
    setRecording(false);
    setSeconds(0);
    onInsert('subjective', '【下書き】録音からの主訴（AI生成・要確認）。');
    onInsert('objective', '【下書き】録音からの所見（AI生成・要確認）。');
  };

  return (
    <aside className="flex h-full w-[332px] flex-none flex-col border-l border-border bg-card">
      <div className="border-b border-border px-3.5 pb-2.5 pt-3">
        <div className="flex items-center gap-2 text-[12.5px] font-bold">
          <span className="grid size-[21px] place-items-center rounded-md bg-brand-tint text-brand">
            <FileText size={13} strokeWidth={1.8} />
          </span>
          書くための道具
          <span className="ms-auto text-[10.5px] font-semibold text-text-tertiary">Write モード</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {/* スクライブ器 */}
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-border px-2.5 py-2.5">
          <div className="flex items-center gap-2 text-[11.5px] font-bold">
            {recording ? (
              <span className="size-2 animate-pulse rounded-full bg-destructive" />
            ) : (
              <Mic size={13} strokeWidth={1.8} className="text-text-tertiary" />
            )}
            {recording ? '診察を録音中' : 'スクライブ（音声→下書き）'}
            {recording ? (
              <span className="ms-auto text-text-tertiary tabular-nums">
                {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] leading-[1.55] text-text-secondary">
            停止すると会話から S / O の下書きを生成します（レビュー必須・自動確定しません）。
          </p>
          <div className="flex flex-wrap gap-1">
            {recording ? (
              <>
                <button
                  type="button"
                  onClick={stopAndDraft}
                  className="inline-flex h-6 items-center rounded-[7px] border border-border bg-card px-2.5 text-[11px] font-semibold text-text-primary"
                >
                  停止して下書き
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecording(false);
                    setSeconds(0);
                  }}
                  className="inline-flex h-6 items-center rounded-[7px] px-2.5 text-[11px] font-semibold text-text-secondary"
                >
                  破棄
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setRecording(true)}
                className="inline-flex h-6 items-center rounded-[7px] border border-border bg-card px-2.5 text-[11px] font-semibold text-text-primary"
              >
                録音を開始
              </button>
            )}
          </div>
        </div>

        {/* データを貼る */}
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-border px-2.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand">
            <AtSign size={13} strokeWidth={1.8} /> データを貼る
          </div>
          <div className="flex flex-wrap gap-1">
            {abnormalText ? (
              <button
                type="button"
                onClick={() => onInsert('objective', abnormalText)}
                className="inline-flex h-6 items-center rounded-[7px] border border-border bg-card px-2.5 text-[11px] font-semibold text-text-primary"
              >
                検査異常→O
              </button>
            ) : null}
            {vitalsText ? (
              <button
                type="button"
                onClick={() => onInsert('objective', vitalsText)}
                className="inline-flex h-6 items-center rounded-[7px] border border-border bg-card px-2.5 text-[11px] font-semibold text-text-primary"
              >
                バイタル→O
              </button>
            ) : null}
            {previousAssessment ? (
              <button
                type="button"
                onClick={() => onInsert('assessment', previousAssessment)}
                className="inline-flex h-6 items-center rounded-[7px] px-2.5 text-[11px] font-semibold text-text-secondary"
              >
                前回A複写
              </button>
            ) : null}
          </div>
        </div>

        {/* 書きながらチェック */}
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-border px-2.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-warning">
            <TriangleAlert size={13} strokeWidth={1.8} /> 書きながらチェック
          </div>
          <p className="text-[11px] leading-[1.55] text-text-secondary">
            {missingDxCount > 0 ? (
              <>
                病名 <b className="text-text-primary">{missingDxCount}件未対応</b>。書き終える前に解消を提案します。
              </>
            ) : (
              '病名の対応漏れはありません。'
            )}
          </p>
        </div>

        {/* AI下書き */}
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-border px-2.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand">
            <FileText size={13} strokeWidth={1.8} /> 下書き
            <span className="ms-1 rounded bg-muted px-1.5 text-[9.5px] font-bold text-text-tertiary">下書き</span>
          </div>
          <p className="text-[11px] leading-[1.55] text-text-secondary">
            HbA1c 上昇に触れる療養指導文（AI生成・要確認）。
          </p>
          <button
            type="button"
            onClick={() =>
              onInsert('plan', '【下書き】HbA1c上昇に対し食事内容を再確認し、運動療法を継続。次回に血糖・HbA1cを再検（AI生成・要確認）。')
            }
            className="inline-flex h-6 w-fit items-center rounded-[7px] border border-border bg-card px-2.5 text-[11px] font-semibold text-brand"
          >
            P に挿入
          </button>
        </div>
      </div>

      <div className="flex-none border-t border-border px-3 pb-3 pt-2.5">
        <p className="text-center text-[10px] text-text-tertiary">生成文には必ず「下書き」バッジが付く</p>
      </div>
    </aside>
  );
}

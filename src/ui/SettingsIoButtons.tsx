// 設定 (params) の JSON エクスポート / インポートボタン。
// 仕様: [現状.md §6 U10] 設定保存・読み込み。
// 規約:
//   - エクスポート: serializeParams で JSON 化 → 一時 <a download> でファイル保存
//   - インポート: 隠し file input を click → 選択 → JSON.parse → applySnapshot
//   - エラー時は notifications store に push（toast 表示）

import { useRef } from 'react';
import {
  applySnapshot,
  isValidSnapshot,
  serializeParams,
  useNotificationsStore,
  useParamsStore,
} from '@/store';

const FILENAME_PREFIX = 'exoclim-settings';

function formatTimestamp(date: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function SettingsIoButtons() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pushNotification = useNotificationsStore((s) => s.push);

  const handleExport = (): void => {
    const state = useParamsStore.getState();
    const snapshot = serializeParams(state);
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${FILENAME_PREFIX}-${formatTimestamp(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushNotification('info', '設定を JSON ファイルとしてエクスポートしました');
  };

  const handleImportClick = (): void => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // input value をクリア（同一ファイルを連続選択できるように）
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isValidSnapshot(parsed)) {
        pushNotification(
          'error',
          'ファイル形式が ExoClim 設定スナップショットではありません（version=1, app=exoclim 必須）',
        );
        return;
      }
      applySnapshot(useParamsStore, parsed);
      pushNotification('info', `設定を読み込みました（${file.name}）`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushNotification('error', `設定読み込みに失敗: ${msg}`);
    }
  };

  return (
    <>
      <button
        type="button"
        className="app__export-btn"
        onClick={handleExport}
        data-testid="app-settings-export-button"
        title="現在の全パラメータを JSON ファイルとしてダウンロード"
      >
        ⤓ 設定
      </button>
      <button
        type="button"
        className="app__export-btn"
        onClick={handleImportClick}
        data-testid="app-settings-import-button"
        title="JSON ファイルから設定を読み込む"
      >
        ⤒ 設定
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        data-testid="app-settings-import-input"
      />
    </>
  );
}

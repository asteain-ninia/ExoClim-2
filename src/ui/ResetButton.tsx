// 全パラメータを初期値（地球プリセット + デフォルト Step パラメータ + 仮想大陸初期地形）
// に戻すグローバル reset ボタン。
// 仕様: [現状.md §6 U13] スライダー単位の `↺` 復帰はあるが、グローバル reset 不在。
// 規約:
//   - params store の reset() を呼ぶだけ
//   - 誤クリック防止に「2 回クリック確認」方式（3 秒以内の再クリックで実行）
//   - ヘッダー右側に配置（App.tsx）

import { useState } from 'react';
import { useParamsStore } from '@/store/params';

const CONFIRM_TIMEOUT_MS = 3000;

export function ResetButton() {
  const reset = useParamsStore((s) => s.reset);
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    } else {
      reset();
      setConfirming(false);
    }
  };

  return (
    <button
      type="button"
      className={
        confirming
          ? 'app__reset-btn app__reset-btn--confirming'
          : 'app__reset-btn'
      }
      onClick={handleClick}
      data-testid="app-reset-button"
      title="全パラメータを地球プリセットに戻す（地形は初期表示の仮想大陸に戻る）"
    >
      {confirming ? '本当にリセット？' : '↺ 全リセット'}
    </button>
  );
}

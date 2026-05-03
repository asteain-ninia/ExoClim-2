// 「❓ ヘルプ」ボタン。クリックでオンボーディングを再表示する（[現状.md §6 U14]）。
// 規約:
//   - 内部で `<OnboardingModal>` を `forceOpen` モードで描画
//   - localStorage 既読フラグはここからは触らない（再オープン用途のため）

import { useState } from 'react';
import { OnboardingModal } from './OnboardingModal';

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="app__help-btn"
        onClick={() => setOpen(true)}
        data-testid="app-help-button"
        title="使い方ガイドを再表示"
        aria-label="使い方ガイドを再表示"
      >
        ❓ ヘルプ
      </button>
      <OnboardingModal forceOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

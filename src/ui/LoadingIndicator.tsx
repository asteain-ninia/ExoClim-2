// pipeline 計算中のスピナー表示。
// 仕様: [現状.md §6 U12] ローディング表示。
// 規約:
//   - ui store の isComputing のみを購読
//   - 即時表示するとチラつくため、200ms 以上計算が続いた時のみ表示する debounce
//   - ヘッダー右側 (ResetButton 隣) に配置

import { useEffect, useState } from 'react';
import { useUIStore } from '@/store/ui';

const SPINNER_DEBOUNCE_MS = 200;

export function LoadingIndicator() {
  const isComputing = useUIStore((s) => s.isComputing);
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!isComputing) {
      setShowSpinner(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSpinner(true), SPINNER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isComputing]);

  if (!showSpinner) return null;

  return (
    <div className="loading-indicator" data-testid="loading-indicator" role="status">
      <span className="loading-indicator__spinner" aria-hidden="true" />
      <span className="loading-indicator__label">計算中…</span>
    </div>
  );
}

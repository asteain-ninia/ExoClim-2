// 上級モードの ON/OFF を切替えるヘッダー右側のトグルボタン。
// 仕様: [現状.md §6 U19] 上級モード（[P4-43]）。
// 規約:
//   - 既定は OFF（初心者向けに UI を簡潔に保つ）
//   - ON にすると `Slider` の `advanced` フラグが付いた要素が表示される
//   - 状態は `useUIStore` の `advancedMode` / `setAdvancedMode` を使用
//   - 永続化対象外（リロードで OFF に戻る）

import { useUIStore } from '@/store/ui';

export function AdvancedModeToggle() {
  const advancedMode = useUIStore((s) => s.advancedMode);
  const setAdvancedMode = useUIStore((s) => s.setAdvancedMode);

  return (
    <button
      type="button"
      className={
        advancedMode
          ? 'app__advanced-toggle app__advanced-toggle--on'
          : 'app__advanced-toggle'
      }
      onClick={() => setAdvancedMode(!advancedMode)}
      data-testid="app-advanced-mode-toggle"
      aria-pressed={advancedMode}
      title={
        advancedMode
          ? '上級モード ON: 詳細スライダー（流線サンプル数、agent 速度など）が表示されます'
          : '上級モード OFF: 詳細スライダーは非表示です'
      }
    >
      {advancedMode ? '★ 上級モード' : '☆ 上級モード'}
    </button>
  );
}

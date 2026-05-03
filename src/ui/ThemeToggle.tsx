// テーマ（ダーク/ライト）切替トグル（[現状.md §6 U9]、P4-45）。
// 規約:
//   - `useUIStore` の `theme` / `setTheme` を購読
//   - クリックで dark ⇔ light 切替
//   - 永続化は `<App>` の useEffect で localStorage に書く（key: 'exoclim-theme'）
//   - ヘッダー右に他のヘッダーボタンと並べる

import { useUIStore } from '@/store/ui';

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="app__theme-btn"
      onClick={() => setTheme(next)}
      data-testid="app-theme-toggle"
      aria-label={`${next === 'dark' ? 'ダーク' : 'ライト'}テーマに切替`}
      title={`${next === 'dark' ? 'ダーク' : 'ライト'}テーマに切替`}
    >
      {theme === 'dark' ? '☀ ライト' : '🌙 ダーク'}
    </button>
  );
}

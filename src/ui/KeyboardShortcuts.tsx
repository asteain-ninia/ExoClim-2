// グローバルキーボードショートカット。
// 仕様: [現状.md §6 U7] キーボードショートカット。
// 規約:
//   - mount 時に window.keydown listener 登録、unmount で解除
//   - input / textarea / select にフォーカス時は無視（パラメータ調整中の誤発火防止）
//   - 0: 年平均、1〜4: 1月/4月/7月/10月（SeasonSelector の表示順と一致）
//   - 将来: 矢印キー (pan)、? (ヘルプ)、R (reset) など追加候補

import { useEffect } from 'react';
import { useUIStore, type SeasonPhaseView } from '@/store/ui';

const KEY_TO_SEASON: Readonly<Record<string, SeasonPhaseView>> = {
  '0': 'annual',
  '1': 0, // 1月
  '2': 3, // 4月
  '3': 6, // 7月
  '4': 9, // 10月
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const setCurrentSeason = useUIStore((s) => s.setCurrentSeason);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const next = KEY_TO_SEASON[e.key];
      if (next === undefined) return;
      e.preventDefault();
      setCurrentSeason(next);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCurrentSeason]);

  return null;
}

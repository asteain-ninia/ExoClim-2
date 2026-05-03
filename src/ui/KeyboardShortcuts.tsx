// グローバルキーボードショートカット。
// 仕様: [現状.md §6 U7] キーボードショートカット。
// 規約:
//   - mount 時に window.keydown listener 登録、unmount で解除
//   - input / textarea / select にフォーカス時は無視（パラメータ調整中の誤発火防止）
//   - 0: 年平均、1〜4: 1月/4月/7月/10月（SeasonSelector の表示順と一致）
//   - ←→: Canvas を経度方向に pan（[P4-62]、ui store の panBy を呼ぶ）
//   - Shift+←→: 高速 pan（10× step）

import { useEffect } from 'react';
import { useUIStore, type SeasonPhaseView } from '@/store/ui';

const KEY_TO_SEASON: Readonly<Record<string, SeasonPhaseView>> = {
  '0': 'annual',
  '1': 0, // 1月
  '2': 3, // 4月
  '3': 6, // 7月
  '4': 9, // 10月
};

/** 矢印キー 1 押しで Canvas を pan する内部解像度 px 単位（[P4-62]）。 */
const PAN_STEP_PX = 35; // ≈ 10° (1260px = 360°)
const PAN_SHIFT_MULTIPLIER = 5;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const setCurrentSeason = useUIStore((s) => s.setCurrentSeason);
  const panBy = useUIStore((s) => s.panBy);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      // 季節キー (0-4)
      const seasonNext = KEY_TO_SEASON[e.key];
      if (seasonNext !== undefined) {
        e.preventDefault();
        setCurrentSeason(seasonNext);
        return;
      }

      // 矢印キー pan ([P4-62])
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const sign = e.key === 'ArrowLeft' ? 1 : -1; // ← で東進方向に pan（map が西へ流れる）
        const step = PAN_STEP_PX * (e.shiftKey ? PAN_SHIFT_MULTIPLIER : 1);
        panBy(sign * step);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setCurrentSeason, panBy]);

  return null;
}

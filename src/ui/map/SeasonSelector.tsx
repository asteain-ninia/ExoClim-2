// 季節（年平均 / 月）切替ボタン。
// 仕様: [要件定義書.md §2.3.1] 季節の切り替え（少なくとも代表的な四季 + 年平均）。
// 規約: ui store の currentSeason のみを購読・更新する。

import { useUIStore, type SeasonPhaseView } from '@/store/ui';

interface SeasonOption {
  readonly label: string;
  readonly value: SeasonPhaseView;
}

const OPTIONS: readonly SeasonOption[] = [
  { label: '年平均', value: 'annual' },
  { label: '1月', value: 0 },
  { label: '4月', value: 3 },
  { label: '7月', value: 6 },
  { label: '10月', value: 9 },
];

export function SeasonSelector() {
  const currentSeason = useUIStore((s) => s.currentSeason);
  const setCurrentSeason = useUIStore((s) => s.setCurrentSeason);

  return (
    <div className="season-selector" role="radiogroup" aria-label="季節選択">
      {OPTIONS.map(({ label, value }) => {
        const isActive = currentSeason === value;
        return (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-testid={`season-${String(value)}`}
            className={isActive ? 'season-selector__btn season-selector__btn--active' : 'season-selector__btn'}
            onClick={() => setCurrentSeason(value)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

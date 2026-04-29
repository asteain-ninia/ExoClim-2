// 凡例コンポーネント。常時表示。
// 仕様: [要件定義書.md §2.3.2] 凡例・補助線（個別表示／非表示の切替）。
// 規約: ui store の legendVisibility のみを購読・更新する。

import { useUIStore } from '@/store/ui';

export function Legend() {
  const legendVisibility = useUIStore((s) => s.legendVisibility);
  const setLegendVisibility = useUIStore((s) => s.setLegendVisibility);

  return (
    <div className="legend" role="region" aria-label="凡例">
      <h3>凡例</h3>
      <ul>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.itczCenterLine}
              onChange={(e) => setLegendVisibility({ itczCenterLine: e.target.checked })}
              data-testid="legend-itcz-center"
            />
            <span className="legend-swatch legend-swatch--center" aria-hidden="true" />
            ITCZ 中心線
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.itczInfluenceBand}
              onChange={(e) => setLegendVisibility({ itczInfluenceBand: e.target.checked })}
              data-testid="legend-itcz-band"
            />
            <span className="legend-swatch legend-swatch--band" aria-hidden="true" />
            ITCZ 影響帯（既定 ±15°）
          </label>
        </li>
      </ul>
      <p className="legend-note">
        ※ 月別バンドは月選択ボタンで切替。地図はマウスドラッグで左右に無限スクロール可能。
      </p>
    </div>
  );
}

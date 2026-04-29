// 凡例コンポーネント。常時表示。
// 仕様: [要件定義書.md §2.3.2] 凡例・補助線（個別表示／非表示の切替）。
// 規約:
//   - ui store の legendVisibility のみを購読・更新する。
//   - パラメータ調整 UI と視覚一貫性を保つため、fieldset / legend のパターン
//     （`.param-group` クラス）で枠と表題を組む。fieldset role は ARIA `group` で、
//     legend が group の accessible name として機能する。

import { useUIStore } from '@/store/ui';

export function Legend() {
  const legendVisibility = useUIStore((s) => s.legendVisibility);
  const setLegendVisibility = useUIStore((s) => s.setLegendVisibility);

  return (
    <fieldset className="param-group legend-panel" data-testid="legend-panel">
      <legend>凡例</legend>
      <ul className="legend-panel__list">
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
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.windVectors}
              onChange={(e) => setLegendVisibility({ windVectors: e.target.checked })}
              data-testid="legend-wind-vectors"
            />
            <span className="legend-swatch legend-swatch--wind" aria-hidden="true" />
            卓越風（Step 2、矢印）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.oceanCurrents}
              onChange={(e) => setLegendVisibility({ oceanCurrents: e.target.checked })}
              data-testid="legend-ocean-currents"
            />
            <span className="legend-swatch legend-swatch--ocean-warm" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--ocean-cold" aria-hidden="true" />
            海流（Step 3、暖流橙 / 寒流青）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.seaIce}
              onChange={(e) => setLegendVisibility({ seaIce: e.target.checked })}
              data-testid="legend-sea-ice"
            />
            <span className="legend-swatch legend-swatch--sea-ice" aria-hidden="true" />
            海氷（Step 3、|lat|＞しきい値）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.finalWindVectors}
              onChange={(e) => setLegendVisibility({ finalWindVectors: e.target.checked })}
              data-testid="legend-final-wind"
            />
            <span className="legend-swatch legend-swatch--final-wind" aria-hidden="true" />
            最終地表風（Step 4、合成済み矢印）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.pressureAnomaly}
              onChange={(e) => setLegendVisibility({ pressureAnomaly: e.target.checked })}
              data-testid="legend-pressure-anomaly"
            />
            <span className="legend-swatch legend-swatch--pressure-high" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--pressure-low" aria-hidden="true" />
            圧力 anomaly（Step 4、高赤 / 低青）
          </label>
        </li>
      </ul>
      <p className="legend-panel__note">
        ※ 月別バンドは月選択ボタンで切替。地図はマウスドラッグで左右に無限スクロール可能。
      </p>
    </fieldset>
  );
}

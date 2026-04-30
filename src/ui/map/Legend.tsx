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
      <legend>表示トグル</legend>
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
              checked={legendVisibility.oceanStreamlines}
              onChange={(e) =>
                setLegendVisibility({ oceanStreamlines: e.target.checked })
              }
              data-testid="legend-ocean-streamlines"
            />
            <span className="legend-swatch legend-swatch--stream-warm" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--stream-cold" aria-hidden="true" />
            海流ストリームライン（Step 3、流線）
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
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.pressureCenters}
              onChange={(e) => setLegendVisibility({ pressureCenters: e.target.checked })}
              data-testid="legend-pressure-centers"
            />
            <span className="legend-swatch legend-swatch--pressure-center" aria-hidden="true" />
            気圧中心（Step 4、H / L マーカー）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.temperatureHeatmap}
              onChange={(e) => setLegendVisibility({ temperatureHeatmap: e.target.checked })}
              data-testid="legend-temperature"
            />
            <span className="legend-swatch legend-swatch--temperature-cold" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--temperature-hot" aria-hidden="true" />
            気温（Step 5、青寒〜赤暑）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.isotherms}
              onChange={(e) => setLegendVisibility({ isotherms: e.target.checked })}
              data-testid="legend-isotherms"
            />
            <span className="legend-swatch legend-swatch--isotherm" aria-hidden="true" />
            等温線（Step 5、刻み °C）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.precipitationLabels}
              onChange={(e) =>
                setLegendVisibility({ precipitationLabels: e.target.checked })
              }
              data-testid="legend-precipitation"
            />
            <span className="legend-swatch legend-swatch--precip-dry" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--precip-wet" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--precip-verywet" aria-hidden="true" />
            降水（Step 6、乾/湿/多湿）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.climateZones}
              onChange={(e) => setLegendVisibility({ climateZones: e.target.checked })}
              data-testid="legend-climate-zones"
            />
            <span className="legend-swatch legend-swatch--climate-a" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--climate-b" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--climate-c" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--climate-d" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--climate-e" aria-hidden="true" />
            気候帯（Step 7、Köppen-Geiger）
          </label>
        </li>
      </ul>
      <p className="legend-panel__note">
        ※ 月別バンドは月選択ボタンで切替。地図はマウスドラッグで左右に無限スクロール可能。
        マウスオーバーで「セル情報」パネルに詳細表示。
      </p>
    </fieldset>
  );
}

// 凡例コンポーネント。常時表示。
// 仕様: [要件定義書.md §2.3.2] 凡例・補助線（個別表示／非表示の切替）。
// 規約:
//   - ui store の legendVisibility のみを購読・更新する。
//   - パラメータ調整 UI と視覚一貫性を保つため、fieldset / legend のパターン
//     （`.param-group` クラス）で枠と表題を組む。fieldset role は ARIA `group` で、
//     legend が group の accessible name として機能する。
//   - 13 トグルを Step 別 7 グループに分割表示（[現状.md §6 U18] P4-29 対応）。

import { useUIStore } from '@/store/ui';

export function Legend() {
  const legendVisibility = useUIStore((s) => s.legendVisibility);
  const setLegendVisibility = useUIStore((s) => s.setLegendVisibility);

  return (
    <fieldset className="param-group legend-panel" data-testid="legend-panel">
      <legend>表示トグル</legend>

      <h4 className="legend-panel__group-title">Step 1 ITCZ</h4>
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
      </ul>

      <h4 className="legend-panel__group-title">Step 2 風帯</h4>
      <ul className="legend-panel__list">
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.windVectors}
              onChange={(e) => setLegendVisibility({ windVectors: e.target.checked })}
              data-testid="legend-wind-vectors"
            />
            <span className="legend-swatch legend-swatch--wind" aria-hidden="true" />
            卓越風（矢印）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.coastalUpwelling}
              onChange={(e) => setLegendVisibility({ coastalUpwelling: e.target.checked })}
              data-testid="legend-coastal-upwelling"
            />
            <span className="legend-swatch legend-swatch--upwelling" aria-hidden="true" />
            沿岸湧昇（寒流強化要因）
          </label>
        </li>
      </ul>

      <h4 className="legend-panel__group-title">Step 3 海流</h4>
      <ul className="legend-panel__list">
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
            海流（暖流橙 / 寒流青）
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
            ストリームライン（流線）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.collisionPoints}
              onChange={(e) => setLegendVisibility({ collisionPoints: e.target.checked })}
              data-testid="legend-collision-points"
            />
            <span className="legend-swatch legend-swatch--collision-eq" aria-hidden="true" />
            <span className="legend-swatch legend-swatch--collision-polar" aria-hidden="true" />
            衝突点（赤道流黄 / 極流紫）
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
            海氷（|lat|＞しきい値 + 冬季東岸延長）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.ensoCandidateMask}
              onChange={(e) => setLegendVisibility({ ensoCandidateMask: e.target.checked })}
              data-testid="legend-enso-candidate"
            />
            <span className="legend-swatch legend-swatch--enso" aria-hidden="true" />
            ENSO 候補海域（§4.10、診断）
          </label>
        </li>
      </ul>

      <h4 className="legend-panel__group-title">Step 4 気流</h4>
      <ul className="legend-panel__list">
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.finalWindVectors}
              onChange={(e) => setLegendVisibility({ finalWindVectors: e.target.checked })}
              data-testid="legend-final-wind"
            />
            <span className="legend-swatch legend-swatch--final-wind" aria-hidden="true" />
            最終地表風（合成済み矢印）
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
            圧力 anomaly（高赤 / 低青）
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
            気圧中心（H / L マーカー）
          </label>
        </li>
      </ul>

      <h4 className="legend-panel__group-title">Step 5 気温</h4>
      <ul className="legend-panel__list">
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
            気温（青寒〜赤暑）
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
            等温線（刻み °C）
          </label>
        </li>
      </ul>

      <h4 className="legend-panel__group-title">Step 6 降水</h4>
      <ul className="legend-panel__list">
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
            降水（乾/湿/多湿）
          </label>
        </li>
      </ul>

      <h4 className="legend-panel__group-title">Step 7 気候帯</h4>
      <ul className="legend-panel__list">
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
            気候帯（Köppen-Geiger）
          </label>
        </li>
        <li>
          <label>
            <input
              type="checkbox"
              checked={legendVisibility.climateClash}
              onChange={(e) =>
                setLegendVisibility({ climateClash: e.target.checked })
              }
              data-testid="legend-climate-clash"
            />
            <span className="legend-swatch legend-swatch--climate-clash" aria-hidden="true" />
            気候急変セル（clash 検知、診断用）
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

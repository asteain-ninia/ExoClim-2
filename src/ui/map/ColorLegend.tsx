// 色凡例パネル（[現状.md §6 U3]、P4-66）。
// Map 上に表示される overlay の色コードを集約表示する。表示トグルとは独立で、
// 「この色は何を表すか」を読み解くための reference 表。
//
// 表示内容:
//   - Köppen 気候帯 配色（19 色）
//   - 海流の暖寒分類（warm = 赤 / cold = 青 / neutral = 透明）
//   - 降水ラベル 4 階調（dry / normal / wet / very_wet）
//   - 海氷 / 沿岸湧昇 / ENSO 候補 / 風ベクトル / 圧力中心マーカー

import { useUIStore } from '@/store/ui';

interface SwatchEntry {
  readonly color: string; // CSS color
  readonly label: string;
  readonly border?: string;
  readonly textColor?: string;
}

const KOPPEN_LEGEND: ReadonlyArray<SwatchEntry> = [
  { color: 'rgb(0, 0, 254)', label: 'Af 熱帯雨林' },
  { color: 'rgb(0, 119, 255)', label: 'Am 熱帯モンスーン' },
  { color: 'rgb(70, 169, 250)', label: 'Aw / As サバナ' },
  { color: 'rgb(255, 0, 0)', label: 'BWh 熱帯砂漠' },
  { color: 'rgb(255, 150, 150)', label: 'BWk 冷帯砂漠' },
  { color: 'rgb(245, 165, 0)', label: 'BSh 熱帯ステップ' },
  { color: 'rgb(255, 220, 100)', label: 'BSk 冷帯ステップ' },
  { color: 'rgb(255, 255, 0)', label: 'Csa 地中海性(暑)' },
  { color: 'rgb(198, 199, 0)', label: 'Csb 地中海性(温)' },
  { color: 'rgb(150, 255, 150)', label: 'Cwa 温暖冬季少雨' },
  { color: 'rgb(100, 200, 100)', label: 'Cwb 温暖冬季少雨(温)' },
  { color: 'rgb(200, 255, 80)', label: 'Cfa 湿潤亜熱帯' },
  { color: 'rgb(100, 255, 80)', label: 'Cfb 西岸海洋性' },
  { color: 'rgb(170, 175, 255)', label: 'Dwa 亜寒帯冬季少雨' },
  { color: 'rgb(90, 120, 220)', label: 'Dwb 〃(冷)' },
  { color: 'rgb(75, 80, 180)', label: 'Dwc 〃(亜寒)' },
  { color: 'rgb(0, 255, 255)', label: 'Dfa 湿潤大陸' },
  { color: 'rgb(56, 200, 200)', label: 'Dfb 〃(冷)' },
  { color: 'rgb(0, 125, 125)', label: 'Dfc 亜寒帯' },
  { color: 'rgb(178, 178, 178)', label: 'ET ツンドラ', textColor: '#000' },
  { color: 'rgb(102, 102, 102)', label: 'EF 万年氷' },
];

const PRECIP_LEGEND: ReadonlyArray<SwatchEntry> = [
  { color: 'rgba(180, 140, 100, 0.6)', label: 'dry（≤ 30 mm/月）' },
  { color: 'rgba(170, 200, 150, 0.6)', label: 'normal（≈ 60 mm/月）' },
  { color: 'rgba(80, 140, 200, 0.6)', label: 'wet（≈ 120 mm/月）' },
  { color: 'rgba(0, 80, 200, 0.7)', label: 'very_wet（≥ 240 mm/月）' },
];

const OCEAN_LEGEND: ReadonlyArray<SwatchEntry> = [
  { color: 'rgba(220, 130, 60, 0.6)', label: '暖流（warm coastal）' },
  { color: 'rgba(60, 130, 220, 0.6)', label: '寒流（cold coastal）' },
  { color: 'rgba(255, 255, 255, 0.85)', label: '海氷（極帯白覆い）', border: '#888' },
  {
    color: 'rgba(120, 220, 240, 0.5)',
    label: '沿岸湧昇マスク（cyan 半透明）',
    border: '#5a9',
  },
  { color: '#ffd040', label: '衝突点（赤道流、黄丸）' },
  { color: '#c060ff', label: '衝突点（極流、紫丸）' },
];

const TERRAIN_LEGEND: ReadonlyArray<SwatchEntry> = [
  { color: '#0e2233', label: '深海（≥ 4 km 水深）' },
  { color: '#3868a4', label: '浅海' },
  { color: '#508050', label: '陸地（低地 0-500 m）' },
  { color: '#a06030', label: '陸地（中標高 500-2000 m）' },
  { color: '#dcc080', label: '陸地（高地 ≥ 2000 m）' },
];

function SwatchList({ entries }: { readonly entries: ReadonlyArray<SwatchEntry> }) {
  return (
    <ul className="color-legend__list">
      {entries.map((e) => (
        <li key={e.label} className="color-legend__item">
          <span
            className="color-legend__swatch"
            style={{
              backgroundColor: e.color,
              ...(e.border ? { borderColor: e.border } : {}),
            }}
          />
          <span className="color-legend__label">{e.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ColorLegend() {
  const advancedMode = useUIStore((s) => s.advancedMode);
  return (
    <fieldset className="param-group" data-testid="color-legend">
      <legend>色凡例</legend>
      <p className="param-note">マップ上の各色が何を表しているかの参照表。</p>
      <details className="color-legend__group">
        <summary>地形（基本表示）</summary>
        <SwatchList entries={TERRAIN_LEGEND} />
      </details>
      <details className="color-legend__group">
        <summary>降水ラベル（Step 6）</summary>
        <SwatchList entries={PRECIP_LEGEND} />
      </details>
      <details className="color-legend__group">
        <summary>海流・海氷・衝突点（Step 3）</summary>
        <SwatchList entries={OCEAN_LEGEND} />
      </details>
      <details className="color-legend__group" open>
        <summary>気候帯 Köppen-Geiger（Step 7、最終出力）</summary>
        <SwatchList entries={KOPPEN_LEGEND} />
      </details>
      {advancedMode && (
        <p className="param-note">
          上級モード時の補足: 暖流/寒流の per-cell 補正は気温に
          ±15℃/-10℃ 程度の影響を与えます（Step 5）。
        </p>
      )}
    </fieldset>
  );
}

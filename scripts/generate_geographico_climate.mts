// 仮想大陸ケッペン気候帯「お手本画像」(v2 = geographico ブログ準拠)
//
// 出典:
//   "Geographico! 仮想大陸の完成図" シリーズ (entry 371〜377)
//   http://geographico.blog.fc2.com/blog-category-18.html
//
// v1 (scripts/generate_climate_reference.mts) は seed=0 procedural 地形 +
// 自前推論ルールだったが、可読性が低く第三者推定との比較が難しいとの FB を
// 受けて、(1) 既存 `idealized_continent` プリセット（緯度別 Earth-stat
// 陸地割合 + 経度中央寄せの単一連続陸塊 = "ダイヤ/凧" 形）を採用し、
// (2) 上記ブログの 5 ステップ手順（熱帯雨林 → 乾燥帯 → 地中海性 → 温帯湿潤 →
// 寒帯/亜寒帯）をなぞる形にルールを書き直した v2。
//
// 形状（geographico 完成図 = entry 377）:
//   - NH 90°-50°: 幅広（地球の Greenland/Arctic + Eurasia 北部に対応）
//   - NH 50°-赤道: なだらかに細る
//   - 0°〜30°S: 急速に細まる
//   - 30°S〜60°S: 細い「首」（南大西洋・南インド洋に相当する空白）
//   - 60°S〜90°S: 再度広がる（南極大陸）
//
// 気候帯ルール（出典 entry 番号付き）:
//   §A 熱帯 (entry 373):
//       - lat=0°-10° 大陸幅内: Af（赤道直下、東岸寄りに広い）
//       - lat=0°-10° 西岸寄り: Am（弱い乾季、貿易風 onshore で多湿だが季節性）
//       - lat=10°-15°: Aw（サバナ）or Cw（東岸湿潤帯, 高緯度側）
//   §B 乾燥 (entry 374):
//       - lat=15°-30° 大陸中央部: BW（亜熱帯高 + 海から遠い）
//       - lat=15°-30° 西岸: BW（cold current）
//       - BW を取り囲むように BS（ステップ）
//       - NH の方が SH より乾燥強（NH 大陸幅が広いため）
//       - lat=15°-25° BW/BS と Af の間: Aw（サバナ）
//       - lat=25°-35° BW/BS と温帯の間（東岸寄り）: Cw（温暖冬季少雨）
//   §C 地中海性 (entry 375):
//       - lat=30°-45° 大陸西岸: Cs（夏に乾燥、冬に湿潤）
//   §D 温帯湿潤 (entry 376):
//       - lat=30°-45° 大陸東岸 + 内陸偏西風到達: Cfa（湿潤亜熱帯）
//       - lat=40°-55° 大陸西岸（暖流 + 偏西風）: Cfb（西岸海洋性、内陸 5° 以内）
//   §E 亜寒帯/寒帯 (entry 377):
//       - lat=50°-70° 大陸両サイド (海洋影響): Df（亜寒帯湿潤）
//       - lat=50°-70° 大陸中央部: Dw（亜寒帯冬季少雨, 強冬季高気圧）
//       - lat=70°-80° 大陸内: ET（ツンドラ）
//       - lat=80°-90° 大陸内 / 内陸: EF（万年氷）
//       - SH に D 群は出さない（30-60°S に大陸ない = 地球と同じ条件）
//
// 出力:
//   docs/reference/geographico_terrain.png         （地形のみ）
//   docs/reference/geographico_climate.png         （地形 + 気候帯 overlay + 凡例）
//   docs/reference/geographico_climate_only.png    （純色気候帯 + 凡例）
//
// 実行: npx tsx scripts/generate_geographico_climate.mts

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerrainGrid } from '../src/domain/terrain';
import type { Grid } from '../src/domain/grid';

// ----- 設定 ------------------------------------------------------------

const RESOLUTION_DEG = 1;
const CANVAS_WIDTH_PX = 1260;
const CANVAS_HEIGHT_PX = 630;

// Köppen 配色（src/ui/map/MapCanvas.tsx と一致）
const KOPPEN: Record<string, [number, number, number]> = {
  Af: [0, 0, 254],
  Am: [0, 119, 255],
  Aw: [70, 169, 250],
  BWh: [255, 0, 0],
  BWk: [255, 150, 150],
  BSh: [245, 165, 0],
  BSk: [255, 220, 100],
  Csa: [255, 255, 0],
  Csb: [198, 199, 0],
  Cwa: [150, 255, 150],
  Cwb: [100, 200, 100],
  Cfa: [200, 255, 80],
  Cfb: [100, 255, 80],
  Cfc: [50, 200, 0],
  Dfa: [0, 255, 255],
  Dfb: [56, 200, 200],
  Dfc: [0, 125, 125],
  Dfd: [0, 70, 95],
  Dwa: [170, 175, 255],
  Dwb: [90, 120, 220],
  Dwc: [75, 80, 180],
  Dwd: [50, 0, 135],
  ET: [178, 178, 178],
  EF: [102, 102, 102],
};

// ----- 地形（idealized_continent プリセット = geographico 形状） --------

console.log('Generating idealized continent terrain (centered single continent) ...');
const grid: Grid = buildTerrainGrid(
  { kind: 'preset', presetId: 'idealized_continent' },
  RESOLUTION_DEG,
);
const rows = grid.latitudeCount;
const cols = grid.longitudeCount;
console.log(`Grid: ${rows} × ${cols}`);

const isLand = (r: number, c: number): boolean => grid.cells[r]![c]!.isLand;
const lat = (r: number): number => grid.cells[r]![0]!.latitudeDeg;

// ----- 海岸距離マップ（経度方向） --------------------------------------

interface CoastInfo {
  readonly westCoastDistDeg: number; // 西方向（lon 減）にある最近海まで
  readonly eastCoastDistDeg: number; // 東方向（lon 増）
  readonly nearestCoastDistDeg: number;
}

function computeCoastInfo(): CoastInfo[][] {
  const info: CoastInfo[][] = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const row: CoastInfo[] = new Array(cols);
    const westDist = new Array<number>(cols).fill(Infinity);
    const eastDist = new Array<number>(cols).fill(Infinity);
    {
      let lastSeaC = -1;
      for (let pass = 0; pass < 2; pass++) {
        for (let c = 0; c < cols; c++) {
          if (!isLand(r, c)) lastSeaC = c;
          if (lastSeaC >= 0) {
            const distC = (c - lastSeaC + cols) % cols;
            const distDeg = distC * (360 / cols);
            if (distDeg < westDist[c]!) westDist[c] = distDeg;
          }
        }
      }
    }
    {
      let nextSeaC = -1;
      for (let pass = 0; pass < 2; pass++) {
        for (let c = cols - 1; c >= 0; c--) {
          if (!isLand(r, c)) nextSeaC = c;
          if (nextSeaC >= 0) {
            const distC = (nextSeaC - c + cols) % cols;
            const distDeg = distC * (360 / cols);
            if (distDeg < eastDist[c]!) eastDist[c] = distDeg;
          }
        }
      }
    }
    for (let c = 0; c < cols; c++) {
      row[c] = {
        westCoastDistDeg: westDist[c]!,
        eastCoastDistDeg: eastDist[c]!,
        nearestCoastDistDeg: Math.min(westDist[c]!, eastDist[c]!),
      };
    }
    info[r] = row;
  }
  return info;
}

console.log('Computing coastal distance fields ...');
const coastInfo = computeCoastInfo();

// ----- 大陸幅マップ（緯度ごとの経度幅） ---------------------------------

const continentWidthDeg = new Array<number>(rows).fill(0);
for (let r = 0; r < rows; r++) {
  let count = 0;
  for (let c = 0; c < cols; c++) if (isLand(r, c)) count++;
  continentWidthDeg[r] = count * (360 / cols);
}

// ----- 気候帯割当（geographico ブログ手順を忠実に） ---------------------

/**
 * 地理メモ:
 *   - westFracInBand = 0 (西端) 〜 1 (東端) で、その緯度行内のどこにいるか
 *   - 西岸近接判定は westCoastDistDeg を、東岸近接は eastCoastDistDeg を使う
 *   - 中央部判定は |westFrac - 0.5| < 0.18 を「中央」とする
 */
function assignKoppen(r: number, c: number): string | null {
  if (!isLand(r, c)) return null;
  const latDeg = lat(r);
  const absLat = Math.abs(latDeg);
  const ci = coastInfo[r]![c]!;
  const widthDeg = continentWidthDeg[r]!;

  // 大陸幅が小さい行（< 5°）は「点状大陸」として全部海岸扱い → 緯度のみで判定
  const westFrac = widthDeg > 0 ? ci.westCoastDistDeg / widthDeg : 0;
  // const eastFrac = widthDeg > 0 ? ci.eastCoastDistDeg / widthDeg : 0;
  const isWestSide = westFrac < 0.35; // 西半分
  const isEastSide = westFrac > 0.65; // 東半分
  const isCenter = westFrac >= 0.35 && westFrac <= 0.65;

  // 海岸近接（経度的距離）
  const veryWestCoast = ci.westCoastDistDeg <= 4;
  const veryEastCoast = ci.eastCoastDistDeg <= 4;

  // ===== §E 寒帯（lat 75°+） =====
  if (absLat >= 80) return 'EF';
  if (absLat >= 75) {
    // 75-80°: ET 主体、内陸 or 80°近くは EF
    if (ci.nearestCoastDistDeg > 6) return 'EF';
    return 'ET';
  }
  // 70-75°: ET / 内陸 EF にせず Dfd まで含む（NH のみ。SH は下の SH ブロックで処理）
  if (absLat >= 70 && latDeg > 0) {
    if (ci.nearestCoastDistDeg > 4) return 'Dfd';
    return 'ET';
  }
  if (absLat >= 70 && latDeg < 0) {
    return 'ET';
  }

  // ===== §E 亜寒帯（NH 50-70°、SH には適用しない） =====
  if (latDeg >= 50 && latDeg < 70) {
    // 海岸寄り (4° 以内): Df 系（湿潤）
    // 内陸（中央部）: Dw 系（冬季少雨）
    if (veryWestCoast || veryEastCoast) {
      // 緯度で a/b/c/d を分ける: 50-55=Dfb, 55-60=Dfc, 60-65=Dfc, 65-70=Dfd
      if (latDeg >= 65) return 'Dfd';
      if (latDeg >= 55) return 'Dfc';
      return 'Dfb';
    }
    // 中央部
    if (isCenter) {
      if (latDeg >= 60) return 'Dwc';
      if (latDeg >= 55) return 'Dwb';
      return 'Dwb';
    }
    // 中間（5-10°）
    if (latDeg >= 60) return 'Dfc';
    if (latDeg >= 55) return 'Dfc';
    return 'Dfb';
  }

  // ===== SH 50-70° は D 群を出さない（geographico の方針）→ ET / EF =====
  if (latDeg <= -50 && latDeg > -70) {
    // 大陸が殆ど存在しないが、もし出る場合は ET 扱い
    if (ci.nearestCoastDistDeg > 6) return 'ET';
    return 'ET';
  }

  // ===== §C/D 温帯〜亜寒帯境界（35-50°） =====
  if (absLat >= 35 && absLat < 50) {
    // 西岸 (4° 以内, 40-50°): Cfb 西岸海洋性
    if (veryWestCoast && absLat >= 40) return 'Cfb';
    // 西岸 (4° 以内, 35-40°): Csb 地中海性 cool
    if (veryWestCoast) return absLat >= 38 ? 'Csb' : 'Csa';
    // 東岸 (4° 以内): Cfa 湿潤亜熱帯（NH 45°以上は Dfa にエスカレート）
    if (veryEastCoast) {
      if (latDeg >= 45) return 'Dfa';
      return 'Cfa';
    }
    // 中央部内陸: NH なら Dwa/Dwb、SH なら大陸自体ほぼないが Cfb で埋める
    if (isCenter) {
      if (latDeg > 0 && absLat >= 45) return 'Dwb';
      if (latDeg > 0) return 'Dwa';
      return 'Cfb';
    }
    // 中間距離（西寄り）: 西岸海洋性の延長
    if (isWestSide) return absLat >= 40 ? 'Cfb' : 'Csb';
    // 中間距離（東寄り）: NH なら Dfa（湿潤大陸性）/ Cfa（35-45°）、SH なら Cfa
    if (isEastSide) {
      if (latDeg > 0 && absLat >= 45) return 'Dfa';
      return 'Cfa';
    }
    // フォールスルーは Cfb（穏やかな温帯）
    return 'Cfb';
  }

  // ===== §B/C 亜熱帯（25-35°） =====
  if (absLat >= 25 && absLat < 35) {
    // 西岸近接: Csa / Csb 地中海性（30-35°）or BWh（25-30°）
    if (veryWestCoast) {
      if (absLat >= 32) return 'Csa';
      return 'BWh';
    }
    // 東岸近接: Cfa 湿潤亜熱帯
    if (veryEastCoast) return 'Cfa';
    // 中央部・内陸: BW（NH 主体）, BS
    if (isCenter) return 'BWh';
    // 中間: BS
    if (isEastSide) return 'Cwa'; // 温暖冬季少雨（東岸寄りの大陸内 BS-Cfa 境界）
    return 'BSh';
  }

  // ===== §B 乾燥帯（15-25°） =====
  if (absLat >= 15 && absLat < 25) {
    // 西岸近接: BWh（cold current + subtropical high）
    if (veryWestCoast) return 'BWh';
    // 東岸近接: Aw or Cwa
    if (veryEastCoast) {
      if (absLat < 20) return 'Aw';
      return 'Cwa';
    }
    // 中央部: BWh（NH > SH）
    if (isCenter) return 'BWh';
    // 中間: BSh（ステップ）
    return 'BSh';
  }

  // ===== §A 熱帯（0-15°） =====
  if (absLat < 15) {
    // 高緯度寄り（10-15°）: Aw or Cwa
    if (absLat >= 10) {
      if (veryEastCoast) return 'Cwa';
      return 'Aw';
    }
    // 中緯度寄り（5-10°）: 東岸 Am, 西岸 Aw, 中央 Aw
    if (absLat >= 5) {
      if (veryEastCoast) return 'Am';
      if (veryWestCoast) return 'Aw';
      return 'Aw';
    }
    // 赤道直下（0-5°）: Af 主体、ただし
    //   - 東岸寄り: Af（trade wind onshore + warm current）
    //   - 西岸寄り: Am（弱い乾季）
    //   - 大陸中央内陸: Af
    if (veryWestCoast) return 'Am';
    return 'Af';
  }

  return 'BSk';
}

console.log('Assigning Köppen zones (geographico-style rules) ...');
const zones: (string | null)[][] = new Array(rows);
const counts: Record<string, number> = {};
for (let r = 0; r < rows; r++) {
  const row: (string | null)[] = new Array(cols);
  for (let c = 0; c < cols; c++) {
    const z = assignKoppen(r, c);
    row[c] = z;
    if (z) counts[z] = (counts[z] || 0) + 1;
  }
  zones[r] = row;
}
console.log('Zone histogram:');
for (const [z, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${z.padEnd(4)}: ${n}`);
}

// ----- レンダリング ---------------------------------------------------

function elevationToShade(elevM: number, isLand: boolean): [number, number, number] {
  if (!isLand) {
    const d = Math.min(1, -elevM / 6000);
    const r = Math.round(20 + (1 - d) * 60);
    const g = Math.round(70 + (1 - d) * 80);
    const b = Math.round(140 + (1 - d) * 80);
    return [r, g, b];
  }
  // idealized_continent は陸地 elevation = 0 m なので一様な薄い陸色
  return [180, 175, 150];
}

function alphaBlend(
  base: [number, number, number],
  over: [number, number, number],
  alpha: number,
): [number, number, number] {
  const a = alpha / 255;
  return [
    Math.round(base[0] * (1 - a) + over[0] * a),
    Math.round(base[1] * (1 - a) + over[1] * a),
    Math.round(base[2] * (1 - a) + over[2] * a),
  ];
}

type RenderMode = 'terrain' | 'climate-overlay' | 'climate-only';

function renderPng(mode: RenderMode, outPath: string, includeLegend = false): void {
  const legendH = includeLegend ? 110 : 0;
  const totalH = CANVAS_HEIGHT_PX + legendH;
  const png = new PNG({ width: CANVAS_WIDTH_PX, height: totalH });

  for (let y = 0; y < CANVAS_HEIGHT_PX; y++) {
    const latDeg = 90 - (y / CANVAS_HEIGHT_PX) * 180;
    // grid r=0 が南極（latDeg=-89.5）、r=rows-1 が北極（latDeg=+89.5）
    // よって y=0（top, latDeg=+90）→ gridR=rows-1
    const gridR = Math.min(rows - 1, Math.max(0, Math.floor(((latDeg + 90) / 180) * rows)));
    for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
      const lonDeg = -180 + (x / CANVAS_WIDTH_PX) * 360;
      const c = Math.min(cols - 1, Math.max(0, Math.floor(((180 + lonDeg) / 360) * cols)));
      const elevM = grid.cells[gridR]![c]!.elevationMeters;
      const land = isLand(gridR, c);

      let rgb: [number, number, number];
      if (mode === 'terrain') {
        rgb = elevationToShade(elevM, land);
      } else if (mode === 'climate-overlay') {
        rgb = elevationToShade(elevM, land);
        const z = zones[gridR]![c];
        if (z && KOPPEN[z]) rgb = alphaBlend(rgb, KOPPEN[z]!, 220);
      } else {
        if (!land) rgb = [180, 200, 220];
        else {
          const z = zones[gridR]![c];
          rgb = z && KOPPEN[z] ? KOPPEN[z]! : [120, 120, 120];
        }
      }

      const idx = (CANVAS_WIDTH_PX * y + x) * 4;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }

  const guideLats = [0, 23.44, -23.44, 66.56, -66.56];
  for (const gLat of guideLats) {
    const y = Math.round(((90 - gLat) / 180) * CANVAS_HEIGHT_PX);
    if (y < 0 || y >= CANVAS_HEIGHT_PX) continue;
    for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
      const idx = (CANVAS_WIDTH_PX * y + x) * 4;
      png.data[idx] = Math.round(png.data[idx]! * 0.5 + 100);
      png.data[idx + 1] = Math.round(png.data[idx + 1]! * 0.5 + 100);
      png.data[idx + 2] = Math.round(png.data[idx + 2]! * 0.5 + 100);
    }
  }

  if (includeLegend) drawLegend(png, CANVAS_HEIGHT_PX, legendH);

  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`Wrote: ${outPath}`);
}

interface LegendEntry {
  readonly code: string;
  readonly label: string;
}

const LEGEND_ROWS: LegendEntry[][] = [
  [
    { code: 'Af', label: 'Af RAINFOREST' },
    { code: 'Am', label: 'Am MONSOON' },
    { code: 'Aw', label: 'Aw SAVANNA' },
    { code: 'BWh', label: 'BWh HOT DESERT' },
    { code: 'BSh', label: 'BSh HOT STEPPE' },
    { code: 'BWk', label: 'BWk COLD DESERT' },
    { code: 'BSk', label: 'BSk COLD STEPPE' },
    { code: 'Csa', label: 'Csa MED HOT' },
    { code: 'Csb', label: 'Csb MED COOL' },
  ],
  [
    { code: 'Cfa', label: 'Cfa SUBTROPICAL' },
    { code: 'Cfb', label: 'Cfb OCEANIC' },
    { code: 'Cwa', label: 'Cwa WINTER-DRY' },
    { code: 'Dfa', label: 'Dfa CONTINENTAL' },
    { code: 'Dfb', label: 'Dfb COOL CONT' },
    { code: 'Dfc', label: 'Dfc SUBARCTIC' },
    { code: 'Dwb', label: 'Dwb WIN-DRY CONT' },
    { code: 'Dwc', label: 'Dwc WIN-DRY SUB' },
    { code: 'ET', label: 'ET TUNDRA' },
    { code: 'EF', label: 'EF ICE CAP' },
  ],
];

function drawLegend(png: PNG, yStart: number, height: number): void {
  for (let y = yStart; y < yStart + height; y++) {
    for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
      const idx = (CANVAS_WIDTH_PX * y + x) * 4;
      png.data[idx] = 24;
      png.data[idx + 1] = 32;
      png.data[idx + 2] = 44;
      png.data[idx + 3] = 255;
    }
  }
  const swatchW = 80;
  const swatchH = 20;
  const padX = 10;
  const padY = 8;
  for (let row = 0; row < LEGEND_ROWS.length; row++) {
    const entries = LEGEND_ROWS[row]!;
    const yBase = yStart + padY + row * (swatchH + 25);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const xBase = padX + i * (swatchW + 30);
      const color = KOPPEN[e.code];
      if (!color) continue;
      for (let dy = 0; dy < swatchH; dy++) {
        for (let dx = 0; dx < swatchW; dx++) {
          const px = xBase + dx;
          const py = yBase + dy;
          if (px >= CANVAS_WIDTH_PX || py >= yStart + height) continue;
          const idx = (CANVAS_WIDTH_PX * py + px) * 4;
          png.data[idx] = color[0];
          png.data[idx + 1] = color[1];
          png.data[idx + 2] = color[2];
          png.data[idx + 3] = 255;
        }
      }
      drawText(png, xBase, yBase + swatchH + 2, e.code, [220, 230, 240]);
    }
  }
  drawText(
    png,
    padX,
    yStart + height - 12,
    'GEOGRAPHICO-STYLE KOPPEN REFERENCE (P4-44 CYCLE V2)',
    [140, 160, 180],
  );
}

const FONT_5x7: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10001', '10101', '11011', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
};

function drawText(
  png: PNG,
  x0: number,
  y0: number,
  text: string,
  color: [number, number, number],
): void {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT_5x7[ch];
    if (!glyph) {
      cx += 6;
      continue;
    }
    for (let gy = 0; gy < 7; gy++) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== '1') continue;
        const px = cx + gx;
        const py = y0 + gy;
        if (px < 0 || px >= CANVAS_WIDTH_PX || py < 0 || py >= png.height) continue;
        const idx = (png.width * py + px) * 4;
        png.data[idx] = color[0];
        png.data[idx + 1] = color[1];
        png.data[idx + 2] = color[2];
        png.data[idx + 3] = 255;
      }
    }
    cx += 6;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, '..', 'docs', 'reference');
mkdirSync(outDir, { recursive: true });

renderPng('terrain', join(outDir, 'geographico_terrain.png'));
renderPng('climate-overlay', join(outDir, 'geographico_climate.png'), true);
renderPng('climate-only', join(outDir, 'geographico_climate_only.png'), true);

console.log('\nDone.');

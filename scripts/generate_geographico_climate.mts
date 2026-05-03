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

// ----- 気候帯割当（geographico ブログ + 実地球分布の修正、P4-51 改訂版） -

/**
 * 設計方針 (ユーザ FB 2026-05-04 反映、P4-51):
 *
 * **westFrac (0=西端 〜 1=東端) を主軸**にして、「色塗りが横方向に同一帯」になる
 * 失敗を回避する。各緯度帯で westFrac による gradient を持たせ、本物の
 * 地球（北米/ユーラシア + アフリカ）の分布を再現する。
 *
 * 主要原則:
 *  - 大陸西岸 25-35°: 暖流・東岸 = 湿潤、寒流・西岸 = 砂漠
 *  - **BW は西岸〜中央 (westFrac < 0.65)** に広く貫入する（Sahara analog 30°N の
 *    西アフリカ〜中東 / 北米南西部）
 *  - **BS は BW の周囲 ring**（north / south / east 三方向）→ 第 2 pass で実現
 *  - 5-15°帯: 東岸寄り Aw / 中央 Aw / 西岸 Aw（"Am でない"）。Af の東側伸展を
 *    確保するため、赤道帯は westFrac > 0.30 でも Af
 *  - **Cfb wedge**: 内陸に行くほど北端が南下する（lat threshold が westFrac 関数）
 *  - **Dw は中央でなく東寄り**（東アジア analog）。Df が東岸寄りに復活
 */
function assignKoppen(r: number, c: number): string | null {
  if (!isLand(r, c)) return null;
  const latDeg = lat(r);
  const absLat = Math.abs(latDeg);
  const ci = coastInfo[r]![c]!;
  const widthDeg = continentWidthDeg[r]!;

  // 大陸幅が小さい行は「点状大陸」として全部海岸扱い
  const westFrac = widthDeg > 0 ? ci.westCoastDistDeg / widthDeg : 0;
  const veryWestCoast = ci.westCoastDistDeg <= 3;
  const veryEastCoast = ci.eastCoastDistDeg <= 3;

  // ===== §E 寒帯（lat 75°+） =====
  if (absLat >= 80) return 'EF';
  if (absLat >= 75) {
    if (ci.nearestCoastDistDeg > 6) return 'EF';
    return 'ET';
  }
  if (absLat >= 70 && latDeg > 0) {
    if (ci.nearestCoastDistDeg > 4) return 'Dfd';
    return 'ET';
  }
  if (absLat >= 70 && latDeg < 0) return 'ET';

  // ===== NH 50-70° 亜寒帯（Df 海岸寄り、Dw 東中央寄り） =====
  if (latDeg >= 50 && latDeg < 70) {
    // 西岸 Cfb wedge（後述の 35-50° 帯と接続させるため、ここでも極一部のみ）
    if (veryWestCoast && latDeg < 55) return 'Cfb';
    // 第 3 文字（緯度ベース）
    const letter = latDeg >= 65 ? 'd' : latDeg >= 55 ? 'c' : 'b';
    // 海岸寄り（westFrac < 0.15 or eastFrac < 0.15）: Df 湿潤
    if (westFrac < 0.15 || westFrac > 0.85) return `Df${letter}` as string;
    // **Dw は東寄り (westFrac 0.55-0.85) に集中** = Mongolia/NE Siberia analog
    if (westFrac >= 0.55 && westFrac <= 0.85) {
      return `Dw${letter}` as string;
    }
    // それ以外（西〜中央 westFrac 0.15-0.55）: Df 主体
    return `Df${letter}` as string;
  }

  // SH 50-70° は大陸ほぼ無し → ET
  if (latDeg <= -50 && latDeg > -70) return 'ET';

  // ===== §C/D 温帯〜亜寒帯境界（35-50°） =====
  if (absLat >= 35 && absLat < 50) {
    // **Cfb wedge**: 西岸では北 60°まで Cfb、内陸に行くほど北端が南下
    //   wedge 北端 lat = 60 - 60*westFrac → westFrac=0 で 60°、=0.15 で 51°、=0.30 で 42°、=0.40 で 36°
    //   westFrac >= 0.40 で wedge 終了（35°N 以下になる）
    //   南端は 38°（Csb 境界より上）
    const cfbNorthLimit = 60 - 60 * westFrac;
    if (latDeg > 0 && westFrac < 0.40 && absLat <= cfbNorthLimit && absLat >= 38) {
      return 'Cfb';
    }
    // 西岸近接 30-38°: Csb / Csa（地中海性）
    if (veryWestCoast || westFrac < 0.05) {
      if (absLat >= 38) return 'Csb';
      return 'Csa';
    }
    // 西岸寄り 0.05-0.15: 地中海延長 or BSk
    if (westFrac < 0.15) {
      if (absLat >= 42) return 'Cfb';
      return 'Csb';
    }
    // 東岸近接 (eastCoast 3°以内 or westFrac > 0.95): Cfa or Dfa
    if (veryEastCoast || westFrac > 0.93) {
      if (latDeg > 0 && absLat >= 45) return 'Dfa';
      return 'Cfa';
    }
    // 東寄り (westFrac 0.78-0.93): Cfa（東岸湿潤の延長）
    if (westFrac > 0.78) {
      if (latDeg > 0 && absLat >= 45) return 'Dfa';
      return 'Cfa';
    }
    // 中央寄り東 (westFrac 0.55-0.78): NH なら Dwa/Dwb（東中央 = 冬季少雨大陸）
    if (westFrac > 0.55) {
      if (latDeg > 0) {
        return absLat >= 45 ? 'Dwb' : 'Dwa';
      }
      return 'BSk';
    }
    // 中央〜西中央 (westFrac 0.15-0.55): NH なら BSk（dry interior）
    if (latDeg > 0) {
      // 35-42°: BSk が西方の BW へ繋がる
      if (absLat < 42) return 'BSk';
      // 42-50°: Dfb（湿潤大陸性、シベリア西〜東欧 analog）
      return 'Dfb';
    }
    return 'Cfb'; // SH fallback
  }

  // ===== §B 亜熱帯（25-35°）BW を西岸〜中央 (westFrac < 0.65) で広く =====
  if (absLat >= 25 && absLat < 35) {
    // 西岸近接（30-35°）: Csa（地中海）。25-30° 西岸は BWh のまま
    if (veryWestCoast) {
      if (absLat >= 32) return 'Csa';
      return 'BWh';
    }
    // 東岸近接: Cfa 湿潤亜熱帯
    if (veryEastCoast) return 'Cfa';
    // **BW 貫入**: westFrac < 0.65 で BW（西岸の Sahara が中央まで広がる）
    if (westFrac < 0.65) return 'BWh';
    // 東寄り（westFrac 0.65-0.90）: Cwa（温暖冬季少雨、East Asia interior analog）
    if (westFrac < 0.90) return 'Cwa';
    // 東岸最寄り（westFrac > 0.90）: Cfa（モンスーン+暖流で湿潤）
    return 'Cfa';
  }

  // ===== §B 乾燥帯（15-25°）BW 中央＋西岸、東岸 Aw/Cwa =====
  if (absLat >= 15 && absLat < 25) {
    if (veryWestCoast) return 'BWh';
    // 東岸近接: Aw / Cwa
    if (veryEastCoast) {
      if (absLat < 20) return 'Aw';
      return 'Cwa';
    }
    // **BW 西岸〜中央 westFrac < 0.55**
    if (westFrac < 0.55) return 'BWh';
    // 中央〜東寄り (0.55-0.85): Aw（サバナ、Sahel analog）
    if (westFrac < 0.85) return 'Aw';
    // 東寄り (0.85-): Cwa（東岸モンスーン縁）
    return absLat >= 20 ? 'Cwa' : 'Aw';
  }

  // ===== §A 熱帯（5-15°）Aw 中心、西岸 Aw、東岸 Aw / Cwa =====
  if (absLat >= 10 && absLat < 15) {
    // どこも基本 Aw（"Am でない" の FB 反映）。東岸 14-15° のみ Cwa 候補
    if (veryEastCoast && absLat >= 13) return 'Cwa';
    return 'Aw';
  }
  if (absLat >= 5 && absLat < 10) {
    // 西岸 Aw、中央 Aw、東岸 Am〜Aw（東岸寄りで monsoon）
    if (veryEastCoast) return 'Am';
    if (westFrac > 0.75) return 'Am';
    return 'Aw';
  }

  // ===== §A 赤道帯（0-5°）Af 東側伸展 =====
  if (absLat < 5) {
    // 西岸寄り (westFrac < 0.20): Am（西岸の弱い乾季、West Africa analog）
    if (westFrac < 0.20) return 'Am';
    // それ以外（westFrac >= 0.20）: Af（東に広く伸展）
    return 'Af';
  }

  return 'BSk';
}

/**
 * 第 2 pass（[P4-51]、ユーザ FB「BW の周りが BS で囲われていない」）:
 *   BW セルに隣接する非 B 群セル（A 群 / C 群）を BS に置換する ring を作る。
 *   Aw / Cwa / Cfa などとの境界を BSh で柔らかくつなぐ。
 *   wrap-around 経度 + 緯度 ±1 行を 1 重 ring としてスキャン。
 */
function ringBwWithBs(zones: (string | null)[][]): (string | null)[][] {
  const out: (string | null)[][] = zones.map((row) => [...row]);
  // Cs (地中海性) と Cfb (西岸海洋性) は BW から離れた西岸寄りに分布するので
  // 保護する（境界変換の対象外）。Aw / Cfa / Cwa などは BS で柔らかく繋ぐ。
  const protectedTargets = new Set(['Csa', 'Csb', 'Cfb']);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const z = zones[i]![j];
      if (!z || !z.startsWith('BW')) continue; // BW のみが ring の起点（BS 自身は ring 起点に含めない）
      for (const [di, dj] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const ni = i + di;
        if (ni < 0 || ni >= rows) continue;
        const nj = ((j + dj) % cols + cols) % cols;
        const nz = zones[ni]![nj];
        if (!nz) continue;
        if (nz.startsWith('B')) continue; // B-B 境界はそのまま
        if (nz.startsWith('E')) continue; // 寒帯境界はそのまま
        if (protectedTargets.has(nz)) continue; // Cs / Cfb は保護
        // 残り (A 群 / Cwa / Cfa / D 群) との境界 → BS に変換
        const targetIsHot = nz.startsWith('A') || nz === 'Cwa' || nz === 'Cfa';
        out[ni]![nj] = targetIsHot ? 'BSh' : 'BSk';
      }
    }
  }
  return out;
}

console.log('Assigning Köppen zones (geographico-style rules, P4-51 修正版) ...');
const initialZones: (string | null)[][] = new Array(rows);
for (let r = 0; r < rows; r++) {
  const row: (string | null)[] = new Array(cols);
  for (let c = 0; c < cols; c++) row[c] = assignKoppen(r, c);
  initialZones[r] = row;
}
console.log('Applying BS ring around BW (2nd pass) ...');
const zones = ringBwWithBs(initialZones);
const counts: Record<string, number> = {};
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const z = zones[r]![c];
    if (z) counts[z] = (counts[z] || 0) + 1;
  }
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

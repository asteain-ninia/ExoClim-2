// 気候帯「お手本画像」の生成スクリプト（[現状.md §1.x ユーザ依頼 2026-05-03]）。
//
// 目的:
//   現状の Step 7 出力（src/sim/07_climate_zone.ts）は対称性が崩れず、低緯度に C が多い等の
//   不自然な分布を示している。本スクリプトは src/sim 系の計算ロジックは一切使わず、
//   実装者の「物理的推論」をハードコードしたルールで Köppen-Geiger ゾーンを割り当て、
//   現状と同等の解像度（180×360 grid → 1260×630 px）で参照画像を出力する。
//
// 推論の根拠:
//   - Pasta `Worldbuilder's Log #40 Continental Climates`（[docs/])
//   - 古典的な大気循環ベルト（Hadley/Ferrel/Polar セル + ITCZ）
//   - 西岸 vs 東岸の海流効果（西岸 = cold current → 砂漠化、東岸 = warm current → 湿潤）
//   - 標高帯の「気候を一段冷やす」ルール
//
// 出力:
//   - docs/reference/terrain_only.png    （地形のみ。陸海・標高シェーディング）
//   - docs/reference/climate_reference.png（地形 + Köppen 配色オーバレイ）
//
// 実行: npx tsx scripts/generate_climate_reference.mts

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerrainGrid } from '../src/domain/terrain';
import type { Grid } from '../src/domain/grid';

// ----- 設定 ------------------------------------------------------------

const RESOLUTION_DEG = 1; // 180×360
const CANVAS_WIDTH_PX = 1260;
const CANVAS_HEIGHT_PX = 630;
const CLIMATE_ALPHA = 200; // 0-255

// Köppen 配色（src/ui/map/MapCanvas.tsx の KOPPEN_ZONE_COLORS と一致）
const KOPPEN: Record<string, [number, number, number]> = {
  Af: [0, 0, 254],
  Am: [0, 119, 255],
  Aw: [70, 169, 250],
  As: [70, 169, 250],
  BWh: [255, 0, 0],
  BWk: [255, 150, 150],
  BSh: [245, 165, 0],
  BSk: [255, 220, 100],
  Csa: [255, 255, 0],
  Csb: [198, 199, 0],
  Csc: [150, 150, 0],
  Cwa: [150, 255, 150],
  Cwb: [100, 200, 100],
  Cfa: [200, 255, 80],
  Cfb: [100, 255, 80],
  Cfc: [50, 200, 0],
  Dsa: [255, 0, 255],
  Dsb: [200, 0, 200],
  Dwa: [170, 175, 255],
  Dwb: [90, 120, 220],
  Dwc: [75, 80, 180],
  Dwd: [50, 0, 135],
  Dfa: [0, 255, 255],
  Dfb: [56, 200, 200],
  Dfc: [0, 125, 125],
  Dfd: [0, 70, 95],
  ET: [178, 178, 178],
  EF: [102, 102, 102],
};

// ----- 地形生成 --------------------------------------------------------

console.log('Generating Earth-statistic procedural terrain (seed=0) ...');
const grid: Grid = buildTerrainGrid({ kind: 'preset', presetId: 'earth' }, RESOLUTION_DEG);
const rows = grid.latitudeCount;
const cols = grid.longitudeCount;
console.log(`Grid: ${rows} × ${cols}`);

// セル属性アクセサ
const isLand = (r: number, c: number): boolean => grid.cells[r]![c]!.isLand;
const elev = (r: number, c: number): number => grid.cells[r]![c]!.elevationMeters;
const lat = (r: number): number => grid.cells[r]![0]!.latitudeDeg;
const lon = (c: number): number => grid.cells[0]![c]!.longitudeDeg;

// ----- 海岸距離マップ（経度方向に W/E/任意） ---------------------------

// 各陸セルについて、同緯度行を経度方向に走査して、最近の海セルまでの距離（°）と方向を求める。
// 経度はラップする（地球は球面）。

interface CoastInfo {
  readonly nearestCoastDistDeg: number; // 全方位（lat 行のみ。簡易）
  readonly westCoastDistDeg: number; // 西側（lon 減方向）にある最近の海まで
  readonly eastCoastDistDeg: number; // 東側（lon 増方向）にある最近の海まで
  readonly distFromAnyOceanDeg: number; // 全方向（緯度方向も含む球面近似）
}

function computeCoastInfo(): CoastInfo[][] {
  const info: CoastInfo[][] = new Array(rows);
  // 簡略: 経度方向の最近海。正確な球面距離は別途。
  for (let r = 0; r < rows; r++) {
    const row: CoastInfo[] = new Array(cols);
    // 1) 経度ラップで両方向に走査して最近海セルまでの距離を求める
    const westDist = new Array<number>(cols).fill(Infinity);
    const eastDist = new Array<number>(cols).fill(Infinity);
    // 西方向（lon が減る方向）に走査
    {
      let lastSeaC = -1;
      // 2 周走査（ラップ）
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
    // 東方向（lon が増える方向）
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
        nearestCoastDistDeg: Math.min(westDist[c]!, eastDist[c]!),
        westCoastDistDeg: westDist[c]!,
        eastCoastDistDeg: eastDist[c]!,
        distFromAnyOceanDeg: Math.min(westDist[c]!, eastDist[c]!),
      };
    }
    info[r] = row;
  }
  // 2) 緯度方向の最近海も加味して distFromAnyOceanDeg を更新（球面 BFS の代わりに簡易: 緯度 ±N 走査）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isLand(r, c)) continue;
      let best = info[r]![c]!.distFromAnyOceanDeg;
      const maxScan = 60; // 最大 ±60 行
      for (let dr = 1; dr <= maxScan; dr++) {
        const dDeg = dr * (180 / rows);
        if (dDeg >= best) break;
        const rN = r - dr;
        const rS = r + dr;
        let foundAny = false;
        if (rN >= 0 && !isLand(rN, c)) {
          if (dDeg < best) best = dDeg;
          foundAny = true;
        }
        if (rS < rows && !isLand(rS, c)) {
          if (dDeg < best) best = dDeg;
          foundAny = true;
        }
        if (foundAny) {
          // continue scanning a few more rows in case longitudinal neighbour is closer; minor refinement skipped
        }
      }
      info[r]![c] = {
        ...info[r]![c]!,
        distFromAnyOceanDeg: best,
      };
    }
  }
  return info;
}

console.log('Computing coastal distance fields ...');
const coastInfo = computeCoastInfo();

// ----- Köppen ゾーン割り当て（ハードコード推論） ---------------------------

/**
 * 気候帯を割り当てる。海セルは null を返す。
 *
 * 推論ルール（緯度帯ごとに、東西海岸 / 内陸 / 標高で分岐）:
 *
 * E 群（極帯, |lat| ≥ 70°）:
 *   - 標高 > 2500m or |lat| > 80°: EF（万年氷）
 *   - それ以外: ET（ツンドラ）
 *
 * D 群（亜寒帯, 50° ≤ |lat| < 70°）— NH 大陸性のみ仮定:
 *   - 内陸（distFromAnyOcean > 15°）: 60° 以北 = Dfc / 65° 以北 = Dfd
 *   - 海岸寄り: Dfb（湿潤大陸性）
 *   - 西岸（cold ocean current が弱い NW 風帯）かつ 50-55°: Cfb 帯への移行ゾーンとして Dfb
 *
 * C 群（温帯, 30° ≤ |lat| < 50°）:
 *   - 西岸 40-55°（強い偏西風 + 暖流）: Cfb（西岸海洋性）
 *   - 西岸 30-40°（夏に亜熱帯高に覆われる）: Csa/Csb（地中海性）
 *   - 東岸 25-40°（モンスーン + 暖流）: Cfa（湿潤亜熱帯）
 *   - 内陸 35-50°: BSk/BWk へ（B 群）
 *   - 標高 > 2500m: Cwb / ET 帯への移行
 *
 * B 群（乾燥, 主に 15-35°）:
 *   - 西岸 15-30°（cold current + 亜熱帯高）: BWh（熱砂漠）
 *   - 内陸 20-35°: BWh（南半球高緯度）or BSh
 *   - 内陸 35-50°: BWk（cold desert, 大陸内部の風下高地）or BSk
 *   - 半乾燥はステップ
 *
 * A 群（熱帯, |lat| < 15°）:
 *   - |lat| < 5° 海岸寄り: Af（熱帯雨林、ITCZ 通年）
 *   - |lat| 5-10° 海岸寄り: Am（モンスーン、夏に強雨）
 *   - |lat| 10-15° または西岸寄り高緯度限界: Aw（サバンナ、乾季あり）
 *   - 内陸（distFromAnyOcean > 8°）: Aw（より乾燥）
 *
 * 標高補正:
 *   - elev > 4000m: ET
 *   - elev > 2500m: 一段冷やす（A→Cwb, B→Csb, C→Cfc, D→ET）
 */
function assignKoppen(r: number, c: number): string | null {
  if (!isLand(r, c)) return null;
  const latDeg = lat(r);
  const lonDeg = lon(c);
  const absLat = Math.abs(latDeg);
  const elevM = elev(r, c);
  const ci = coastInfo[r]![c]!;
  const distOcean = ci.distFromAnyOceanDeg;
  const westCoast = ci.westCoastDistDeg <= 5; // 西側 5° 以内に海
  const eastCoast = ci.eastCoastDistDeg <= 5;
  const veryWestCoast = ci.westCoastDistDeg <= 3;
  const veryEastCoast = ci.eastCoastDistDeg <= 3;
  // 東岸湿潤帯は trade wind / monsoon advection で内陸 7° まで及ぶ（Pasta #40 / 中国〜東インド analog）
  const eastWetReach = ci.eastCoastDistDeg <= 7;
  // 西岸の地中海性帯は内陸 5° 程度
  const westDryReach = ci.westCoastDistDeg <= 5;

  // ===== 標高超高地の上書き =====
  if (elevM > 4500) return 'EF';
  if (elevM > 3500 && absLat > 30) return 'ET';
  if (elevM > 4000) return 'ET';

  // ===== E 群（極帯） =====
  if (absLat >= 70) {
    if (absLat > 80 || elevM > 2000) return 'EF';
    if (latDeg < -75) return 'EF'; // 南極大陸内部は氷冠
    return 'ET';
  }

  // ===== D 群（亜寒帯, 50-70°） — NH 風 / SH には殆ど陸地なし =====
  if (absLat >= 50 && absLat < 70) {
    // 標高補正: 高地は ET
    if (elevM > 2500) return 'ET';
    // 西岸 50-58°（暖流 + 偏西風）: Cfb 海洋性
    if (veryWestCoast && absLat < 58 && latDeg > 0) return 'Cfb';
    // 内陸 60-70°: Dfd（極端な大陸性）
    if (absLat >= 60 && distOcean > 12) return 'Dfd';
    // 内陸 55-60°: Dfc
    if (absLat >= 55 && distOcean > 10) return 'Dfc';
    // 海岸 55-70°: Dfc（海洋緩和あり）
    if (absLat >= 58) return 'Dfc';
    // 50-55° 内陸: Dfb humid continental
    if (distOcean > 8) return 'Dfb';
    // 50-55° 海岸: Dfa or Cfb（西岸） / Dfa（東岸）
    if (eastCoast) return 'Dfa';
    return 'Dfb';
  }

  // ===== C/B 群分岐（30-50°） =====
  if (absLat >= 30 && absLat < 50) {
    // 高地: 一段冷やす
    if (elevM > 3000) return 'ET';
    if (elevM > 2000) {
      if (eastCoast) return 'Cwb';
      return 'BSk';
    }

    // ----- 西岸帯 -----
    if (veryWestCoast) {
      if (absLat >= 40) return 'Cfb'; // 海洋性
      if (absLat >= 33) return 'Csb'; // 地中海性 cool summer
      return 'Csa'; // 地中海性
    }

    // ----- 東岸帯（湿潤帯は内陸 7° まで） -----
    if (eastWetReach) {
      if (absLat >= 42) return 'Dfa'; // 湿潤大陸性
      if (absLat >= 30) return 'Cfa'; // 湿潤亜熱帯
    }

    // ----- 内陸 -----
    if (distOcean > 10) {
      // 大陸内部 35-50°: 冷砂漠/ステップ
      if (absLat >= 42) return 'BSk';
      return 'BWk';
    }

    // 中間距離（5-10°）
    if (absLat >= 42) {
      if (eastCoast) return 'Dfa';
      if (westDryReach) return 'Cfb';
      return 'Dfb';
    }
    // 30-42°
    if (eastCoast) return 'Cfa';
    if (westDryReach) return 'Csb';
    return 'BSk';
  }

  // ===== B/A 群分岐（15-30° 亜熱帯） =====
  if (absLat >= 15 && absLat < 30) {
    if (elevM > 3000) return 'ET';
    if (elevM > 2000) {
      if (veryEastCoast) return 'Cwb';
      return 'BWk';
    }

    // 西岸（cold current + subtropical high）: 強い砂漠
    if (veryWestCoast) return 'BWh';
    if (westCoast && absLat >= 20 && absLat < 28) return 'BWh';

    // 東岸（trade wind onshore + warm current）: 湿潤
    if (eastWetReach) {
      if (absLat < 23) return 'Aw'; // tropical savanna 残存
      return 'Cfa';
    }

    // 内陸: 砂漠 → ステップへ
    if (distOcean > 8) return 'BWh';
    if (absLat < 25) return 'BSh';
    return 'BWh';
  }

  // ===== A 群（赤道〜15°） =====
  if (absLat < 15) {
    if (elevM > 3000) return 'ET';
    if (elevM > 2500) {
      if (absLat < 8) return 'Cwb'; // 高地温帯
      return 'BSh';
    }
    if (elevM > 1500) {
      if (absLat < 5) return 'Cwa';
    }

    // 内陸 > 8°: 乾季が長くなり Aw
    if (distOcean > 8) {
      if (absLat < 5) return 'Aw';
      return 'Aw';
    }

    // |lat| < 5°: ITCZ 通年 → 雨林
    if (absLat < 5) {
      // 東岸寄り（trade wind onshore + warm current）: Af 強い
      if (eastCoast || distOcean < 4) return 'Af';
      // 西岸寄り（offshore wind）: Am or Aw
      if (westCoast) return 'Am';
      return 'Af';
    }
    // 5° ≤ |lat| < 10°: モンスーン or サバンナ
    if (absLat < 10) {
      if (eastCoast) return 'Am';
      if (westCoast) return 'Aw';
      return 'Aw';
    }
    // 10° ≤ |lat| < 15°: サバンナ
    if (eastCoast && distOcean < 4) return 'Aw';
    return 'Aw';
  }

  // フォールバック
  return 'BSk';
}

console.log('Assigning Köppen zones (hand-coded reasoning) ...');
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

function elevationToShade(elevM: number): [number, number, number] {
  // 海:  -6000m 紺〜 -10m 薄青
  if (elevM <= 0) {
    const d = Math.min(1, -elevM / 6000);
    const r = Math.round(20 + (1 - d) * 60);
    const g = Math.round(70 + (1 - d) * 80);
    const b = Math.round(140 + (1 - d) * 80);
    return [r, g, b];
  }
  // 陸: 0m 緑 → 1500m 茶 → 4000m 白
  if (elevM < 500) {
    const t = elevM / 500;
    const r = Math.round(110 + t * 80);
    const g = Math.round(160 - t * 30);
    const b = Math.round(90 - t * 30);
    return [r, g, b];
  }
  if (elevM < 2000) {
    const t = (elevM - 500) / 1500;
    const r = Math.round(190 + t * 40);
    const g = Math.round(130 - t * 30);
    const b = Math.round(60 + t * 30);
    return [r, g, b];
  }
  // > 2000m
  const t = Math.min(1, (elevM - 2000) / 3000);
  const r = Math.round(230 + t * 25);
  const g = Math.round(100 + t * 155);
  const b = Math.round(90 + t * 165);
  return [r, g, b];
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

  // メイン地図
  for (let y = 0; y < CANVAS_HEIGHT_PX; y++) {
    const latDeg = 90 - (y / CANVAS_HEIGHT_PX) * 180;
    const r = Math.min(rows - 1, Math.max(0, Math.floor(((90 + latDeg) / 180) * rows)));
    const gridR = rows - 1 - r;
    for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
      const lonDeg = -180 + (x / CANVAS_WIDTH_PX) * 360;
      const c = Math.min(cols - 1, Math.max(0, Math.floor(((180 + lonDeg) / 360) * cols)));

      const elevM = elev(gridR, c);
      const land = isLand(gridR, c);
      let rgb: [number, number, number];

      if (mode === 'terrain') {
        rgb = elevationToShade(elevM);
      } else if (mode === 'climate-overlay') {
        rgb = elevationToShade(elevM);
        const z = zones[gridR]![c];
        if (z) {
          const koppen = KOPPEN[z];
          if (koppen) rgb = alphaBlend(rgb, koppen, CLIMATE_ALPHA);
        }
      } else {
        // climate-only: ocean = 中性ブルー、陸 = Köppen 100% （地形シェードなし）
        if (!land) {
          rgb = [180, 200, 220]; // 海は薄いグレーブルー
        } else {
          const z = zones[gridR]![c];
          if (z && KOPPEN[z]) rgb = KOPPEN[z]!;
          else rgb = [120, 120, 120]; // 未マッピング = 中グレー
        }
      }

      const idx = (CANVAS_WIDTH_PX * y + x) * 4;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }

  // 緯度線（赤道、回帰線、極圏）を 1px グレーで重ねる
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

  // 凡例（mode が climate を含む場合のみ）
  if (includeLegend) {
    drawLegend(png, CANVAS_HEIGHT_PX, legendH);
  }

  const buf = PNG.sync.write(png);
  writeFileSync(outPath, buf);
  console.log(`Wrote: ${outPath} (${buf.length} bytes)`);
}

interface LegendEntry {
  readonly code: string;
  readonly label: string;
}

const LEGEND_ROWS: LegendEntry[][] = [
  [
    { code: 'Af', label: 'Af 熱帯雨林' },
    { code: 'Am', label: 'Am 熱帯モンスーン' },
    { code: 'Aw', label: 'Aw サバンナ' },
    { code: 'BWh', label: 'BWh 熱砂漠' },
    { code: 'BSh', label: 'BSh 熱ステップ' },
    { code: 'BWk', label: 'BWk 冷砂漠' },
    { code: 'BSk', label: 'BSk 冷ステップ' },
    { code: 'Csa', label: 'Csa 地中海(暑)' },
    { code: 'Csb', label: 'Csb 地中海(温)' },
  ],
  [
    { code: 'Cfa', label: 'Cfa 湿潤亜熱帯' },
    { code: 'Cfb', label: 'Cfb 西岸海洋' },
    { code: 'Cwa', label: 'Cwa 温暖冬乾' },
    { code: 'Cwb', label: 'Cwb 高地温帯' },
    { code: 'Dfa', label: 'Dfa 湿潤大陸' },
    { code: 'Dfb', label: 'Dfb 湿潤大陸冷' },
    { code: 'Dfc', label: 'Dfc 亜寒帯' },
    { code: 'Dfd', label: 'Dfd 極寒大陸' },
    { code: 'ET', label: 'ET ツンドラ' },
    { code: 'EF', label: 'EF 万年氷' },
  ],
];

function drawLegend(png: PNG, yStart: number, height: number): void {
  // 背景: 暗グレー
  for (let y = yStart; y < yStart + height; y++) {
    for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
      const idx = (CANVAS_WIDTH_PX * y + x) * 4;
      png.data[idx] = 24;
      png.data[idx + 1] = 32;
      png.data[idx + 2] = 44;
      png.data[idx + 3] = 255;
    }
  }
  // スウォッチ + ラベル相当（5x7 ドット文字は描画せず、色スウォッチのみ並べる。
  // 文字は別途 markdown legend で説明する）
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
      // スウォッチ
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
      // 簡易テキスト: code を 5x7 bitmap で描画
      drawText(png, xBase, yBase + swatchH + 2, e.code, [220, 230, 240]);
    }
  }
  // フッタ凡例文字列
  drawText(png, padX, yStart + height - 12, 'Hand-drawn Koppen-Geiger reference (P4-44 cycle)', [
    140, 160, 180,
  ]);
}

// ----- 簡易 ASCII bitmap font (5x7) -----
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

// ----- 出力 -----------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, '..', 'docs', 'reference');
mkdirSync(outDir, { recursive: true });

renderPng('terrain', join(outDir, 'terrain_only.png'));
renderPng('climate-overlay', join(outDir, 'climate_reference.png'), true);
renderPng('climate-only', join(outDir, 'climate_only.png'), true);

console.log('\nDone.');

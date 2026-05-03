// 実アプリ Step 1-7 を idealized_continent プリセットで走らせて、
// 最終 Step 7 zone codes の PNG スナップショットを出力する診断スクリプト。
// (P4-54)
//
// お手本 (docs/reference/geographico_climate_only.png) と直接見比べるため、
// 同じ canvas 寸法 (1260×740 = 1260×630 + 凡例 110) で出力する。
//
// 実行: npx tsx scripts/snapshot_app_climate.mts
// 出力: docs/reference/app_actual_climate.png

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTerrainGrid } from '../src/domain/terrain';
import { EARTH_PLANET_PARAMS } from '../src/domain';
import { computeITCZ, DEFAULT_ITCZ_STEP_PARAMS } from '../src/sim/01_itcz';
import { computeWindBelt, DEFAULT_WIND_BELT_STEP_PARAMS } from '../src/sim/02_wind_belt';
import { computeOceanCurrent } from '../src/sim/03_ocean_current';
import { computeAirflow, DEFAULT_AIRFLOW_STEP_PARAMS } from '../src/sim/04_airflow';
import { computeTemperature, DEFAULT_TEMPERATURE_STEP_PARAMS } from '../src/sim/05_temperature';
import {
  computePrecipitation,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
} from '../src/sim/06_precipitation';
import {
  computeClimateZone,
  DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
} from '../src/sim/07_climate_zone';

const CANVAS_WIDTH_PX = 1260;
const CANVAS_HEIGHT_PX = 630;
const LEGEND_H = 110;

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
  Cwc: [50, 150, 50],
  Cfa: [200, 255, 80],
  Cfb: [100, 255, 80],
  Cfc: [50, 200, 0],
  Dsa: [255, 0, 255],
  Dsb: [200, 0, 200],
  Dsc: [150, 50, 150],
  Dsd: [150, 100, 150],
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

console.log('Running pipeline on idealized_continent ...');
// [P4-72] resolution 1 を渡さない (default 0.5 を使う)。
// preset は idealized_continent (Earth 統計準拠の非対称 kite、お手本一致)。
// idealized_continent_2 (NH/SH 対称版) も P4-78 で実装済みだが、お手本
// (geographico) 自体が非対称なのでデフォルトは非対称を採用。
const grid = buildTerrainGrid({ kind: 'preset', presetId: 'idealized_continent' });
const itcz = computeITCZ(EARTH_PLANET_PARAMS, grid, DEFAULT_ITCZ_STEP_PARAMS);
const windBelt = computeWindBelt(
  EARTH_PLANET_PARAMS,
  grid,
  itcz,
  DEFAULT_WIND_BELT_STEP_PARAMS,
);
const ocean = computeOceanCurrent(EARTH_PLANET_PARAMS, grid, itcz, windBelt);
const airflow = computeAirflow(
  EARTH_PLANET_PARAMS,
  grid,
  itcz,
  windBelt,
  ocean,
  DEFAULT_AIRFLOW_STEP_PARAMS,
);
const temp = computeTemperature(
  EARTH_PLANET_PARAMS,
  grid,
  itcz,
  windBelt,
  ocean,
  airflow,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
);
const precip = computePrecipitation(
  EARTH_PLANET_PARAMS,
  grid,
  itcz,
  windBelt,
  ocean,
  airflow,
  temp,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
);
const climate = computeClimateZone(
  EARTH_PLANET_PARAMS,
  grid,
  precip,
  temp,
  DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
);

const rows = grid.latitudeCount;
const cols = grid.longitudeCount;
const counts: Record<string, number> = {};
for (const row of climate.zoneCodes) {
  for (const z of row) {
    if (z) counts[z] = (counts[z] || 0) + 1;
  }
}
console.log('Zone histogram:');
for (const [z, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${z.padEnd(4)}: ${n}`);
}

// レンダリング: アプリ風に「地形シェード + Köppen overlay (alpha=200)」
const png = new PNG({ width: CANVAS_WIDTH_PX, height: CANVAS_HEIGHT_PX + LEGEND_H });
const CLIMATE_ALPHA = 200;
function elevShade(elevM: number, isLand: boolean): [number, number, number] {
  if (!isLand) {
    const d = Math.min(1, -elevM / 6000);
    return [
      Math.round(20 + (1 - d) * 60),
      Math.round(70 + (1 - d) * 80),
      Math.round(140 + (1 - d) * 80),
    ];
  }
  return [180, 175, 150];
}
function blend(
  a: [number, number, number],
  b: [number, number, number],
  alpha: number,
): [number, number, number] {
  const t = alpha / 255;
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}
for (let y = 0; y < CANVAS_HEIGHT_PX; y++) {
  const latDeg = 90 - (y / CANVAS_HEIGHT_PX) * 180;
  const gridR = Math.min(rows - 1, Math.max(0, Math.floor(((latDeg + 90) / 180) * rows)));
  for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
    const lonDeg = -180 + (x / CANVAS_WIDTH_PX) * 360;
    const c = Math.min(cols - 1, Math.max(0, Math.floor(((180 + lonDeg) / 360) * cols)));
    const cell = grid.cells[gridR]![c]!;
    let rgb: [number, number, number] = elevShade(cell.elevationMeters, cell.isLand);
    if (cell.isLand) {
      const z = climate.zoneCodes[gridR]?.[c];
      if (z && KOPPEN[z]) rgb = blend(rgb, KOPPEN[z]!, CLIMATE_ALPHA);
    }
    const idx = (CANVAS_WIDTH_PX * y + x) * 4;
    png.data[idx] = rgb[0];
    png.data[idx + 1] = rgb[1];
    png.data[idx + 2] = rgb[2];
    png.data[idx + 3] = 255;
  }
}

// 緯度ガイド線
for (const gLat of [0, 23.44, -23.44, 66.56, -66.56]) {
  const y = Math.round(((90 - gLat) / 180) * CANVAS_HEIGHT_PX);
  for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
    const idx = (CANVAS_WIDTH_PX * y + x) * 4;
    png.data[idx] = Math.round(png.data[idx]! * 0.5 + 100);
    png.data[idx + 1] = Math.round(png.data[idx + 1]! * 0.5 + 100);
    png.data[idx + 2] = Math.round(png.data[idx + 2]! * 0.5 + 100);
  }
}

// 凡例領域: 暗グレー背景
for (let y = CANVAS_HEIGHT_PX; y < CANVAS_HEIGHT_PX + LEGEND_H; y++) {
  for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
    const idx = (CANVAS_WIDTH_PX * y + x) * 4;
    png.data[idx] = 24;
    png.data[idx + 1] = 32;
    png.data[idx + 2] = 44;
    png.data[idx + 3] = 255;
  }
}

// 凡例: スウォッチ + コード（テキストは簡易ビットマップ省略、色のみ並べる）
const legendCodes = [
  'Af', 'Am', 'Aw', 'BWh', 'BSh', 'BWk', 'BSk', 'Csa', 'Csb',
  'Cfa', 'Cfb', 'Cwa', 'Dfa', 'Dfb', 'Dfc', 'Dwb', 'Dwc', 'ET', 'EF',
];
const swatchW = 60;
const swatchH = 30;
const padX = 10;
const padY = 25;
const cols2 = Math.ceil(legendCodes.length / 2);
for (let i = 0; i < legendCodes.length; i++) {
  const row = Math.floor(i / cols2);
  const col = i % cols2;
  const xBase = padX + col * (swatchW + 6);
  const yBase = CANVAS_HEIGHT_PX + padY + row * (swatchH + 8);
  const code = legendCodes[i]!;
  const color = KOPPEN[code]!;
  for (let dy = 0; dy < swatchH; dy++) {
    for (let dx = 0; dx < swatchW; dx++) {
      const px = xBase + dx;
      const py = yBase + dy;
      if (px >= CANVAS_WIDTH_PX || py >= CANVAS_HEIGHT_PX + LEGEND_H) continue;
      const idx = (CANVAS_WIDTH_PX * py + px) * 4;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = 255;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, '..', 'docs', 'reference');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'app_actual_climate.png');
writeFileSync(outPath, PNG.sync.write(png));
console.log(`\nWrote: ${outPath}`);

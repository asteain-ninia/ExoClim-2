// Step 5 気温の東西非対称性 定量診断スクリプト（[現状.md ユーザ指摘 2026-05-03]、P4-48）。
//
// 目的: アプリの「同緯度東西で気候が同じ」現象が Step 5 の温度自体に起因するのか、
//   Step 6/7 のラベリングに起因するのかを切り分ける。
//
// 出力: 仮想大陸（idealized_continent）プリセットで全 Step 1-5 を計算し、
//   北緯 30° 行を 5° おきにサンプリングして「最寒月平均気温 (winterMin)」を
//   ダンプする。
//
// 期待結果:
//   - 物理的には: 東岸（暖流）の land は西岸（寒流）の land より winterMin が高いはず
//   - 現状予想: Step 3 の coastal correction は ocean cell のみに適用 →
//     land cell の correction は 0 → 同緯度の land は base 温度のみで決まる →
//     winterMin が東西で完全一致する（症状再現）
//
// 実行: npx tsx scripts/diag_temperature_asymmetry.mts

import { buildTerrainGrid } from '../src/domain/terrain';
import { EARTH_PLANET_PARAMS } from '../src/domain';
import { computeITCZ, DEFAULT_ITCZ_STEP_PARAMS } from '../src/sim/01_itcz';
import { computeWindBelt, DEFAULT_WIND_BELT_STEP_PARAMS } from '../src/sim/02_wind_belt';
import { computeOceanCurrent } from '../src/sim/03_ocean_current';
import { computeAirflow, DEFAULT_AIRFLOW_STEP_PARAMS } from '../src/sim/04_airflow';
import { computeTemperature, DEFAULT_TEMPERATURE_STEP_PARAMS } from '../src/sim/05_temperature';

console.log('Generating idealized continent terrain ...');
const grid = buildTerrainGrid({ kind: 'preset', presetId: 'idealized_continent' }, 1);
const cols = grid.longitudeCount;

console.log('Running Step 1-5 pipeline ...');
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

// 緯度 30°N 行をサンプリング: 大陸幅内の 10 経度（西端〜東端均等）と
// その coastal correction (Step 3 出力)、land cell の温度（Step 5 出力）を見る
const targetLatDeg = 30;
const r = Math.round((targetLatDeg + 90) / 1 - 0.5);
console.log(`\n=== Latitude ${targetLatDeg}°N (grid row ${r}) ===\n`);

// 大陸幅を測定
const landCols: number[] = [];
for (let c = 0; c < cols; c++) {
  if (grid.cells[r]![c]!.isLand) landCols.push(c);
}
if (landCols.length === 0) {
  console.log('No land at this latitude. Aborting.');
  process.exit(0);
}
console.log(
  `Continent at lat ${targetLatDeg}°: ${landCols.length} land cells, ` +
    `lon range = [${grid.cells[r]![landCols[0]!]!.longitudeDeg.toFixed(1)}, ` +
    `${grid.cells[r]![landCols[landCols.length - 1]!]!.longitudeDeg.toFixed(1)}]°`,
);

// 各 land cell の winterMin（最寒月）を計算
function winterMinFor(i: number, j: number): number {
  let minT = Infinity;
  for (let m = 0; m < 12; m++) {
    const t = temp.monthlyTemperatureCelsius[m]?.[i]?.[j] ?? 0;
    if (t < minT) minT = t;
  }
  return minT;
}

console.log('\n--- Per-cell dump (10 evenly spaced positions across continent) ---');
console.log(
  ['idx', 'lonDeg', 'land', 'oceanCorr@cell', 'oceanCorr@nearestSea', 'winterMin', 'classification'].join('\t'),
);

const samplePositions: number[] = [];
const N = 10;
for (let k = 0; k < N; k++) {
  const idx = Math.floor((k / (N - 1)) * (landCols.length - 1));
  samplePositions.push(landCols[idx]!);
}

for (const c of samplePositions) {
  const cell = grid.cells[r]![c]!;
  const winterMin = winterMinFor(r, c);
  // Step 3 coastal correction at this cell (always 0 for land)
  let totalCorr = 0;
  for (let m = 0; m < 12; m++) {
    totalCorr += ocean.monthlyCoastalTemperatureCorrectionCelsius[m]?.[r]?.[c] ?? 0;
  }
  const meanCorr = totalCorr / 12;
  // Nearest sea cell correction (search ±20 cols)
  let nearestSeaCorr = 0;
  let nearestDist = Infinity;
  for (let dc = -20; dc <= 20; dc++) {
    const nc = ((c + dc) % cols + cols) % cols;
    if (!grid.cells[r]![nc]!.isLand && Math.abs(dc) < nearestDist) {
      nearestDist = Math.abs(dc);
      let sum = 0;
      for (let m = 0; m < 12; m++)
        sum += ocean.monthlyCoastalTemperatureCorrectionCelsius[m]?.[r]?.[nc] ?? 0;
      nearestSeaCorr = sum / 12;
    }
  }
  // Classification at nearest sea cell
  const classCount = { warm: 0, cold: 0, neutral: 0 };
  for (let dc = -3; dc <= 3; dc++) {
    const nc = ((c + dc) % cols + cols) % cols;
    if (grid.cells[r]![nc]!.isLand) continue;
    for (let m = 0; m < 12; m++) {
      const corr = ocean.monthlyCoastalTemperatureCorrectionCelsius[m]?.[r]?.[nc] ?? 0;
      if (corr > 0.5) classCount.warm++;
      else if (corr < -0.5) classCount.cold++;
      else classCount.neutral++;
    }
  }
  const dominantCls =
    classCount.warm > classCount.cold && classCount.warm > classCount.neutral
      ? 'warm'
      : classCount.cold > classCount.neutral
        ? 'cold'
        : 'neutral';

  console.log(
    [
      String(c).padStart(3),
      cell.longitudeDeg.toFixed(1).padStart(7),
      cell.isLand ? 'L' : 'O',
      meanCorr.toFixed(2).padStart(6),
      nearestSeaCorr.toFixed(2).padStart(6),
      winterMin.toFixed(2).padStart(7),
      dominantCls.padStart(8),
    ].join('\t'),
  );
}

// 西端 vs 東端の差を集計
const westmostC = landCols[0]!;
const eastmostC = landCols[landCols.length - 1]!;
const westWinter = winterMinFor(r, westmostC);
const eastWinter = winterMinFor(r, eastmostC);
console.log(
  `\nWest coast (lon=${grid.cells[r]![westmostC]!.longitudeDeg.toFixed(1)}°) winterMin = ${westWinter.toFixed(2)}°C`,
);
console.log(
  `East coast (lon=${grid.cells[r]![eastmostC]!.longitudeDeg.toFixed(1)}°) winterMin = ${eastWinter.toFixed(2)}°C`,
);
console.log(`Δ(east - west) = ${(eastWinter - westWinter).toFixed(2)}°C`);
console.log(
  '\n期待（物理的）: 東岸暖流 → 東岸が西岸より暖かい → Δ > 0',
);
console.log(
  '現状予想: Step 3 coastal correction は ocean cell only → land で同緯度同温 → Δ ≈ 0',
);

// 同様に lat=10°N（赤道帯）でも見る
console.log('\n=== Latitude 10°N: equatorial test ===');
const r10 = Math.round((10 + 90) / 1 - 0.5);
const landCols10: number[] = [];
for (let c = 0; c < cols; c++) {
  if (grid.cells[r10]![c]!.isLand) landCols10.push(c);
}
if (landCols10.length > 0) {
  const w10 = winterMinFor(r10, landCols10[0]!);
  const e10 = winterMinFor(r10, landCols10[landCols10.length - 1]!);
  console.log(`West coast winterMin = ${w10.toFixed(2)}°C`);
  console.log(`East coast winterMin = ${e10.toFixed(2)}°C`);
  console.log(`Δ = ${(e10 - w10).toFixed(2)}°C`);
}

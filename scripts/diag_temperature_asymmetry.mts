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
import { computePrecipitation, DEFAULT_PRECIPITATION_STEP_PARAMS } from '../src/sim/06_precipitation';
import { computeClimateZone, DEFAULT_CLIMATE_ZONE_STEP_PARAMS } from '../src/sim/07_climate_zone';

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

// 各 land cell の winterMin（最寒月）を計算
function winterMinFor(i: number, j: number): number {
  let minT = Infinity;
  for (let m = 0; m < 12; m++) {
    const t = temp.monthlyTemperatureCelsius[m]?.[i]?.[j] ?? 0;
    if (t < minT) minT = t;
  }
  return minT;
}

function dumpRow(targetLatDeg: number, label: string): void {
  const r = Math.round((targetLatDeg + 90) / 1 - 0.5);
  const landColsLocal: number[] = [];
  for (let c = 0; c < cols; c++) if (grid.cells[r]![c]!.isLand) landColsLocal.push(c);
  if (landColsLocal.length === 0) {
    console.log(`\n=== ${label} (lat ${targetLatDeg}°): no land. ===`);
    return;
  }
  console.log(`\n=== ${label} (lat ${targetLatDeg}°, grid row ${r}) ===`);
  console.log(['lon', 'winterMin', 'annualMean', 'annualPrecip', 'zone'].join('\t'));
  const samples: number[] = [];
  const N = 12;
  for (let k = 0; k < N; k++) {
    samples.push(landColsLocal[Math.floor((k / (N - 1)) * (landColsLocal.length - 1))]!);
  }
  for (const c of samples) {
    const cell = grid.cells[r]![c]!;
    const wMin = winterMinFor(r, c);
    let aSum = 0;
    for (let m = 0; m < 12; m++) aSum += temp.monthlyTemperatureCelsius[m]?.[r]?.[c] ?? 0;
    const aMean = aSum / 12;
    let pSum = 0;
    for (let m = 0; m < 12; m++) {
      const lab = precip.monthlyPrecipitationLabels[m]?.[r]?.[c];
      const mm = lab === 'dry' ? 10 : lab === 'normal' ? 60 : lab === 'wet' ? 120 : lab === 'very_wet' ? 240 : 0;
      pSum += mm;
    }
    const zone = climate.zoneCodes[r]?.[c] ?? '-';
    console.log(
      [
        cell.longitudeDeg.toFixed(1).padStart(6),
        wMin.toFixed(1).padStart(7),
        aMean.toFixed(1).padStart(7),
        pSum.toFixed(0).padStart(6),
        String(zone).padStart(4),
      ].join('\t'),
    );
  }
}

dumpRow(60, '60°N (Df / Dw 帯)');
dumpRow(45, '45°N (温帯)');
dumpRow(30, '30°N (亜熱帯 BWh / Cs / Cfa)');
dumpRow(20, '20°N (乾燥帯 BWh)');
dumpRow(10, '10°N (Aw / Am)');
dumpRow(0, '0° (Af 赤道)');
dumpRow(-30, '30°S (亜熱帯 SH)');

// 全大陸 zone code の集計（東西非対称性の有無を定量評価）
function summarizeZoneAsymmetry(latDeg: number): void {
  const r = Math.round((latDeg + 90) / 1 - 0.5);
  const landColsLocal: number[] = [];
  for (let c = 0; c < cols; c++) if (grid.cells[r]![c]!.isLand) landColsLocal.push(c);
  if (landColsLocal.length < 4) return;
  const half = Math.floor(landColsLocal.length / 2);
  const westCells = landColsLocal.slice(0, half);
  const eastCells = landColsLocal.slice(landColsLocal.length - half);
  const westZones = new Set<string>();
  const eastZones = new Set<string>();
  for (const c of westCells) {
    const z = climate.zoneCodes[r]?.[c];
    if (z) westZones.add(z);
  }
  for (const c of eastCells) {
    const z = climate.zoneCodes[r]?.[c];
    if (z) eastZones.add(z);
  }
  const westOnly = [...westZones].filter((z) => !eastZones.has(z));
  const eastOnly = [...eastZones].filter((z) => !westZones.has(z));
  const both = [...westZones].filter((z) => eastZones.has(z));
  console.log(
    `\nlat ${String(latDeg).padStart(4)}°: west zones = {${[...westZones].join(',')}}, ` +
      `east zones = {${[...eastZones].join(',')}}`,
  );
  console.log(
    `  west-only: [${westOnly.join(',')}] | east-only: [${eastOnly.join(',')}] | both: [${both.join(',')}]`,
  );
}

console.log('\n=== 東西非対称性集計（zone codes） ===');
for (const lat of [60, 50, 40, 30, 20, 10, 0, -10, -20, -30]) {
  summarizeZoneAsymmetry(lat);
}

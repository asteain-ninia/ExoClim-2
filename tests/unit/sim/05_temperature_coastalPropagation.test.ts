import { describe, expect, it } from 'vitest';
import {
  KM_PER_DEG_LAT,
  buildTerrainGrid,
  cellsToKm,
  type Cell,
  type Grid,
  type GridResolutionDeg,
  type OceanCurrentResult,
} from '@/domain';
import { computeITCZ } from '@/sim/01_itcz';
import { computeWindBelt } from '@/sim/02_wind_belt';
import { computeOceanCurrent } from '@/sim/03_ocean_current';
import { computeAirflow } from '@/sim/04_airflow';
import {
  __internals,
  computeTemperature,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
} from '@/sim/05_temperature';
import { createParamsStore } from '@/store/params';

/**
 * 参照オラクル: scatter 化前の gather 実装（陸セルごとに窓を di 昇順 → dj 昇順で走査し、
 * 絶対値が厳密に大きいときだけ更新）。本番実装はこれと bit 単位で一致しなければならない。
 */
function referencePropagateCoastalCorrectionInland(
  grid: Grid,
  oceanCorrection: ReadonlyArray<ReadonlyArray<number>>,
  reachKm: number,
): number[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const resolutionDeg = grid.resolutionDeg;
  const out: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const sourceRow = oceanCorrection[i];
    out[i] = sourceRow ? Array.from(sourceRow) : new Array<number>(cols).fill(0);
  }
  if (reachKm <= 0) return out;
  const reachLatCells = Math.ceil(reachKm / (resolutionDeg * KM_PER_DEG_LAT));
  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    if (!cellRow) continue;
    const latDeg = cellRow[0]?.latitudeDeg ?? 0;
    const cosLat = Math.max(0.05, Math.cos(latDeg * Math.PI / 180));
    const reachLonCells = Math.ceil(reachKm / (resolutionDeg * KM_PER_DEG_LAT * cosLat));
    const reachLatCellsClamped = Math.min(reachLatCells, 60);
    const reachLonCellsClamped = Math.min(reachLonCells, 60);
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (!cell || !cell.isLand) continue;
      let bestAbs = 0;
      let bestSigned = 0;
      for (let di = -reachLatCellsClamped; di <= reachLatCellsClamped; di++) {
        const ni = i + di;
        if (ni < 0 || ni >= rows) continue;
        const nRow = grid.cells[ni];
        if (!nRow) continue;
        const corrRow = oceanCorrection[ni];
        if (!corrRow) continue;
        for (let dj = -reachLonCellsClamped; dj <= reachLonCellsClamped; dj++) {
          const nj = ((j + dj) % cols + cols) % cols;
          const nCell = nRow[nj];
          if (!nCell || nCell.isLand) continue;
          const sourceCorr = corrRow[nj] ?? 0;
          if (sourceCorr === 0) continue;
          const km = cellsToKm(di, dj, resolutionDeg, latDeg);
          if (km > reachKm) continue;
          const decay = Math.max(0, 1 - km / reachKm);
          const weighted = sourceCorr * decay;
          const absVal = Math.abs(weighted);
          if (absVal > bestAbs) {
            bestAbs = absVal;
            bestSigned = weighted;
          }
        }
      }
      out[i]![j] = bestSigned;
    }
  }
  return out;
}

/** Object.is で不一致のセル数を数える（-0 と 0 も区別する。開発ガイド §6.1.1）。 */
function countMismatches(
  a: ReadonlyArray<ReadonlyArray<number>>,
  b: ReadonlyArray<ReadonlyArray<number>>,
): number {
  expect(a.length).toBe(b.length);
  let mismatches = 0;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i]!;
    const rb = b[i]!;
    expect(ra.length).toBe(rb.length);
    for (let j = 0; j < ra.length; j++) {
      if (!Object.is(ra[j], rb[j])) mismatches++;
    }
  }
  return mismatches;
}

/** 決定的な疑似乱数（mulberry32）。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 経度セル数を意図的に少なくした合成グリッド。極付近では窓幅（最大 121 セル）が
 * 経度セル数を超え、同じ海セルが異なる dj で複数回走査されるケースを含む。
 */
function syntheticGrid(cols: number, landProbability: number, seed: number): Grid {
  const resolutionDeg: GridResolutionDeg = 2;
  const rows = 90;
  const rand = mulberry32(seed);
  const cells: Cell[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const latitudeDeg = -89 + i * resolutionDeg;
    const row: Cell[] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      const isLand = rand() < landProbability;
      row[j] = {
        latitudeDeg,
        longitudeDeg: -180 + (j + 0.5) * (360 / cols),
        isLand,
        elevationMeters: isLand ? 500 : 0,
        continentId: isLand ? 'synthetic' : null,
      } as Cell;
    }
    cells[i] = row;
  }
  return { resolutionDeg, latitudeCount: rows, longitudeCount: cols, cells };
}

function syntheticCorrection(
  grid: Grid,
  seed: number,
  quantized: boolean,
  nonzeroProbability: number,
): number[][] {
  const rand = mulberry32(seed);
  return grid.cells.map((row) =>
    row.map(() => {
      if (rand() >= nonzeroProbability) return 0;
      // 量子化すると絶対値の同値（tie）が大量に生じ、走査順による優先順位を検証できる。
      return quantized ? Math.round(rand() * 6) - 3 : (rand() - 0.5) * 20;
    }),
  );
}

function defaultPipelineInputs(resolutionDeg: GridResolutionDeg) {
  const params = createParamsStore().getState();
  const grid = buildTerrainGrid(params.planet.terrain, resolutionDeg);
  const itcz = computeITCZ(params.planet, grid, params.itczParams);
  const windBelt = computeWindBelt(params.planet, grid, itcz, params.windBeltParams);
  const ocean = computeOceanCurrent(params.planet, grid, itcz, windBelt, params.oceanCurrentParams);
  return { params, grid, itcz, windBelt, ocean };
}

describe('sim/05_temperature: propagateCoastalCorrectionInland の scatter 実装が gather 参照実装と bit 一致', () => {
  it.each([1, 2] as const)(
    '既定地形 %s° + Step 3 実出力 + 既定 reach で Object.is 不一致 0',
    (resolutionDeg) => {
      const { grid, ocean } = defaultPipelineInputs(resolutionDeg);
      const correction = ocean.monthlyCoastalTemperatureCorrectionCelsius[0];
      const reachKm = DEFAULT_TEMPERATURE_STEP_PARAMS.coastalCorrectionInlandReachKm;
      const expected = referencePropagateCoastalCorrectionInland(grid, correction, reachKm);
      const actual = __internals.propagateCoastalCorrectionInland(grid, correction, reachKm);
      expect(countMismatches(actual, expected)).toBe(0);
      // 伝播が実際に陸セルへ値を載せていること（自明な一致でないこと）を確認
      let landNonZero = 0;
      for (let i = 0; i < grid.latitudeCount; i++) {
        for (let j = 0; j < grid.longitudeCount; j++) {
          if (grid.cells[i]![j]!.isLand && actual[i]![j] !== 0) landNonZero++;
        }
      }
      expect(landNonZero).toBeGreaterThan(0);
    },
    60_000,
  );

  it.each([
    { cols: 40, quantized: true, seed: 1 },
    { cols: 40, quantized: false, seed: 2 },
    { cols: 180, quantized: true, seed: 3 },
    { cols: 180, quantized: false, seed: 4 },
  ])(
    '合成グリッド（経度 $cols セル、量子化=$quantized）で複数 reach すべて不一致 0',
    ({ cols, quantized, seed }) => {
      const grid = syntheticGrid(cols, 0.55, seed);
      const correction = syntheticCorrection(grid, seed * 7919, quantized, 0.3);
      for (const reachKm of [0, 150, 1113, 2000, 5000]) {
        const expected = referencePropagateCoastalCorrectionInland(grid, correction, reachKm);
        const actual = __internals.propagateCoastalCorrectionInland(grid, correction, reachKm);
        expect(countMismatches(actual, expected)).toBe(0);
      }
    },
  );
});

describe('sim/05_temperature: 海岸補正伝播のメモ化', () => {
  it('月別 correction が同一参照でも別参照（同値）でも computeTemperature の出力は一致する', () => {
    const { params, grid, itcz, windBelt, ocean } = defaultPipelineInputs(2);
    const airflow = computeAirflow(params.planet, grid, itcz, windBelt, ocean, params.airflowParams);
    const shared = ocean.monthlyCoastalTemperatureCorrectionCelsius;
    expect(shared.every((m) => m === shared[0])).toBe(true);
    const distinct = {
      ...ocean,
      monthlyCoastalTemperatureCorrectionCelsius: shared.map((m) =>
        m.map((row) => Array.from(row)),
      ),
    } as unknown as OceanCurrentResult;
    const a = computeTemperature(
      params.planet, grid, itcz, windBelt, ocean, airflow, params.temperatureParams,
    );
    const b = computeTemperature(
      params.planet, grid, itcz, windBelt, distinct, airflow, params.temperatureParams,
    );
    for (let m = 0; m < 12; m++) {
      expect(
        countMismatches(a.monthlyTemperatureCelsius[m]!, b.monthlyTemperatureCelsius[m]!),
      ).toBe(0);
    }
  });
});

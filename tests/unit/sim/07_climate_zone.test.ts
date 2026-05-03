import { describe, expect, it } from 'vitest';
import {
  EARTH_PLANET_PARAMS,
  createGrid,
  type AirflowResult,
  type Cell,
  type Grid,
  type GridResolutionDeg,
  type ITCZResult,
  type OceanCurrentResult,
  type PlanetParams,
  type PrecipitationResult,
  type TemperatureResult,
  type WindBeltResult,
} from '@/domain';
import { computeITCZ, DEFAULT_ITCZ_STEP_PARAMS } from '@/sim/01_itcz';
import { computeWindBelt, DEFAULT_WIND_BELT_STEP_PARAMS } from '@/sim/02_wind_belt';
import {
  computeOceanCurrent,
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
} from '@/sim/03_ocean_current';
import { computeAirflow, DEFAULT_AIRFLOW_STEP_PARAMS } from '@/sim/04_airflow';
import {
  computeTemperature,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
} from '@/sim/05_temperature';
import {
  computePrecipitation,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
} from '@/sim/06_precipitation';
import {
  __internals,
  computeClimateZone,
  DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
} from '@/sim/07_climate_zone';

const baseGrid = (resolutionDeg: GridResolutionDeg = 2): Grid => createGrid(resolutionDeg);

const baseITCZ = (planet: PlanetParams = EARTH_PLANET_PARAMS, grid: Grid = baseGrid()): ITCZResult =>
  computeITCZ(planet, grid, DEFAULT_ITCZ_STEP_PARAMS);

const baseWindBelt = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
): WindBeltResult =>
  computeWindBelt(planet, grid, baseITCZ(planet, grid), DEFAULT_WIND_BELT_STEP_PARAMS);

const baseOcean = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
): OceanCurrentResult =>
  computeOceanCurrent(
    planet,
    grid,
    baseITCZ(planet, grid),
    baseWindBelt(planet, grid),
    DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  );

const baseAirflow = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
): AirflowResult =>
  computeAirflow(
    planet,
    grid,
    baseITCZ(planet, grid),
    baseWindBelt(planet, grid),
    baseOcean(planet, grid),
    DEFAULT_AIRFLOW_STEP_PARAMS,
  );

const baseTemperature = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
): TemperatureResult =>
  computeTemperature(
    planet,
    grid,
    baseITCZ(planet, grid),
    baseWindBelt(planet, grid),
    baseOcean(planet, grid),
    baseAirflow(planet, grid),
    DEFAULT_TEMPERATURE_STEP_PARAMS,
  );

const basePrecipitation = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
): PrecipitationResult =>
  computePrecipitation(
    planet,
    grid,
    baseITCZ(planet, grid),
    baseWindBelt(planet, grid),
    baseOcean(planet, grid),
    baseAirflow(planet, grid),
    baseTemperature(planet, grid),
    DEFAULT_PRECIPITATION_STEP_PARAMS,
  );

function mapGridCells(grid: Grid, customizer: (cell: Cell) => Cell): Grid {
  return {
    resolutionDeg: grid.resolutionDeg,
    latitudeCount: grid.latitudeCount,
    longitudeCount: grid.longitudeCount,
    cells: grid.cells.map((row) => row.map((cell) => customizer(cell))),
  };
}

const fullCompute = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
  paramsOverrides: Partial<typeof DEFAULT_CLIMATE_ZONE_STEP_PARAMS> = {},
) =>
  computeClimateZone(
    planet,
    grid,
    basePrecipitation(planet, grid),
    baseTemperature(planet, grid),
    { ...DEFAULT_CLIMATE_ZONE_STEP_PARAMS, ...paramsOverrides },
  );

describe('sim/07_climate_zone: 出力構造', () => {
  it('zoneCodes と rationale が GridMap で返り、海洋セルは null', () => {
    const grid = baseGrid();
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    expect(result.zoneCodes.length).toBe(grid.latitudeCount);
    expect(result.rationale.length).toBe(grid.latitudeCount);
    // 全海洋なら全 null
    for (const row of result.zoneCodes) {
      for (const code of row) {
        expect(code).toBeNull();
      }
    }
  });

  it('陸地セルがあると zoneCode が non-null になる', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60 && Math.abs(cell.latitudeDeg) <= 30
        ? { ...cell, isLand: true, continentId: 'land' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    let landCount = 0;
    let codedCount = 0;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const cellRow = grid.cells[i];
      const codeRow = result.zoneCodes[i];
      if (!cellRow || !codeRow) continue;
      for (let j = 0; j < grid.longitudeCount; j++) {
        const cell = cellRow[j];
        if (!cell || !cell.isLand) continue;
        landCount++;
        if (codeRow[j] !== null) codedCount++;
      }
    }
    expect(landCount).toBeGreaterThan(0);
    expect(codedCount).toBe(landCount);
  });

  it('system が DEFAULT で koppen_geiger', () => {
    const result = fullCompute();
    expect(result.system).toBe('koppen_geiger');
  });
});

describe('sim/07_climate_zone: 物理的特徴（地球プリセット）', () => {
  it('赤道横断大陸では極帯（E）は出現せず、A/B/C/D のいずれかになる', () => {
    // E 群（夏 < 10°C）は赤道帯では出ないことを保証。実際の A/B/C/D 比は
    // Step 5/6 のラベル変換係数に依存するため、ここでは E が出ないことだけを検証。
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60 && Math.abs(cell.latitudeDeg) <= 10
        ? { ...cell, isLand: true, continentId: 'eq-cont' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    let foundE = false;
    let foundLand = false;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const cellRow = grid.cells[i];
      const codeRow = result.zoneCodes[i];
      if (!cellRow || !codeRow) continue;
      for (let j = 0; j < grid.longitudeCount; j++) {
        const cell = cellRow[j];
        if (!cell || !cell.isLand) continue;
        const code = codeRow[j];
        if (!code) continue;
        foundLand = true;
        if (code === 'ET' || code === 'EF') foundE = true;
      }
    }
    expect(foundLand).toBe(true);
    expect(foundE).toBe(false);
  });

  it('極帯（高緯度陸地）では E 群（ET/EF）が出現', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      Math.abs(cell.latitudeDeg) >= 75
        ? { ...cell, isLand: true, continentId: 'polar' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    let foundE = false;
    for (const row of result.zoneCodes) {
      for (const code of row) {
        if (code === 'ET' || code === 'EF') {
          foundE = true;
          break;
        }
      }
      if (foundE) break;
    }
    expect(foundE).toBe(true);
  });

  it('rationale はすべての陸地セルで non-null、温度・降水が有限値', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 30 && Math.abs(cell.latitudeDeg) <= 30
        ? { ...cell, isLand: true, continentId: 'land' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    for (let i = 0; i < grid.latitudeCount; i++) {
      const cellRow = grid.cells[i];
      const ratRow = result.rationale[i];
      if (!cellRow || !ratRow) continue;
      for (let j = 0; j < grid.longitudeCount; j++) {
        const cell = cellRow[j];
        const r = ratRow[j];
        if (!cell || !cell.isLand) {
          expect(r).toBeNull();
          continue;
        }
        expect(r).not.toBeNull();
        if (r) {
          expect(Number.isFinite(r.winterMinTemperatureCelsius)).toBe(true);
          expect(Number.isFinite(r.summerMaxTemperatureCelsius)).toBe(true);
          expect(Number.isFinite(r.annualPrecipitationMm)).toBe(true);
          expect(r.annualPrecipitationMm).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('sim/07_climate_zone: 内部判定（境界ケース）', () => {
  it('classifyPolar: summerMax >= 0 → ET、< 0 → EF', () => {
    const aggET = makeAgg({ summerMax: 5, winterMin: -20 });
    const aggEF = makeAgg({ summerMax: -5, winterMin: -30 });
    expect(__internals.classifyPolar(aggET)).toBe('ET');
    expect(__internals.classifyPolar(aggEF)).toBe('EF');
  });

  it('classifyArid: 半分以下のしきい値 → BW、それ以上 → BS、Hot/Cold は h/k', () => {
    // hot 6 で 100%, threshold = 20×20 + 280 = 680
    const aggHotDesert = makeAgg({
      summerMax: 35,
      winterMin: 5,
      monthlyT: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
      monthlyP: [0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50],
      annualMean: 25,
    });
    const code = __internals.classifyArid(aggHotDesert, 680, 'monthly');
    // 年降水量 300 < 680 / 2 → desert (BW), 全月 > 0°C → Hot (h)
    expect(code).toBe('BWh');

    // Steppe テスト: 年降水量 = 400, threshold = 680, 400 > 340 → BS
    const aggHotSteppe = makeAgg({
      summerMax: 35,
      winterMin: 5,
      monthlyT: [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25],
      monthlyP: [0, 0, 0, 0, 0, 0, 70, 70, 70, 70, 70, 50],
      annualMean: 25,
    });
    const code2 = __internals.classifyArid(aggHotSteppe, 680, 'monthly');
    expect(code2.startsWith('BS')).toBe(true);
  });

  it('classifyTropical: 最少月 ≥ 60mm → Af', () => {
    const agg = makeAgg({
      summerMax: 30,
      winterMin: 22,
      monthlyT: [27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27],
      monthlyP: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
      annualMean: 27,
    });
    expect(__internals.classifyTropical(agg)).toBe('Af');
  });

  it('thirdLetterFromTemp: 夏 ≥ 22°C → a、< -38°C → d、4 ヶ月以上 ≥ 10°C → b', () => {
    const aggA = makeAgg({
      summerMax: 25,
      winterMin: -10,
      monthlyT: [-5, -3, 5, 12, 18, 23, 25, 23, 17, 10, 3, -3],
    });
    expect(__internals.thirdLetterFromTemp(aggA)).toBe('a');

    const aggD = makeAgg({
      summerMax: 15,
      winterMin: -45,
      monthlyT: [-40, -38, -25, -10, 5, 12, 15, 12, 5, -5, -20, -35],
    });
    expect(__internals.thirdLetterFromTemp(aggD)).toBe('d');

    const aggB = makeAgg({
      summerMax: 20,
      winterMin: -5,
      monthlyT: [-3, -1, 5, 10, 15, 18, 20, 18, 14, 8, 2, -2],
    });
    // 夏 < 22、4 ヶ月以上 ≥ 10 → b
    expect(__internals.thirdLetterFromTemp(aggB)).toBe('b');
  });

  it('isAridHot: monthly 基準で全月 > 0°C → Hot', () => {
    const hotMonthly = makeAgg({
      monthlyT: [10, 12, 15, 20, 25, 28, 30, 28, 22, 15, 12, 10],
      annualMean: 19,
    });
    const coldMonthly = makeAgg({
      monthlyT: [-5, -2, 3, 10, 18, 24, 27, 25, 18, 10, 2, -3],
      annualMean: 11,
    });
    expect(__internals.isAridHot(hotMonthly, 'monthly')).toBe(true);
    expect(__internals.isAridHot(coldMonthly, 'monthly')).toBe(false);
  });

  it('isAridHot: annual 基準で年平均 ≥ 18°C → Hot', () => {
    const hot = makeAgg({ annualMean: 19, monthlyT: [10, 12, 15, 20, 25, 28, 30, 28, 22, 15, 12, 10] });
    const cold = makeAgg({ annualMean: 15, monthlyT: [10, 12, 15, 20, 25, 28, 30, 28, 22, 15, 12, 10] });
    expect(__internals.isAridHot(hot, 'annual')).toBe(true);
    expect(__internals.isAridHot(cold, 'annual')).toBe(false);
  });
});

describe('sim/07_climate_zone: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = baseGrid();
    const precip = basePrecipitation(EARTH_PLANET_PARAMS, grid);
    const temp = baseTemperature(EARTH_PLANET_PARAMS, grid);
    const a = computeClimateZone(EARTH_PLANET_PARAMS, grid, precip, temp);
    const b = computeClimateZone(EARTH_PLANET_PARAMS, grid, precip, temp);
    expect(a).toEqual(b);
  });
});

describe('sim/07_climate_zone: パラメータ依存', () => {
  it('precipitationMmByLabel.dry を増やすと B 群が減る（または同じ）', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 90 && Math.abs(cell.latitudeDeg) <= 40
        ? { ...cell, isLand: true, continentId: 'land' }
        : cell,
    );
    const lowDry = fullCompute(EARTH_PLANET_PARAMS, grid, {
      precipitationMmByLabel: {
        dry: 5,
        normal: 60,
        wet: 120,
        very_wet: 240,
      },
    });
    const highDry = fullCompute(EARTH_PLANET_PARAMS, grid, {
      precipitationMmByLabel: {
        dry: 50,
        normal: 60,
        wet: 120,
        very_wet: 240,
      },
    });
    let lowB = 0;
    let highB = 0;
    for (const row of lowDry.zoneCodes) {
      for (const c of row) {
        if (c && c.startsWith('B')) lowB++;
      }
    }
    for (const row of highDry.zoneCodes) {
      for (const c of row) {
        if (c && c.startsWith('B')) highB++;
      }
    }
    expect(highB).toBeLessThanOrEqual(lowB);
  });

  it('§4.1.7 B → D 振り戻し: 寒冷地の B 候補（年平均 ≤ 7°C, winterMin < 0, 年降水量 < arid）が D に振り戻される', () => {
    const coldDryAgg = makeAgg({
      monthlyT: [-15, -10, -5, 0, 5, 10, 12, 10, 5, 0, -5, -10],
      monthlyP: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 年 120mm（dry）
    });
    // annualMean = -1.0, winterMin = -15, summerMax = 12 → D 候補かつ B 候補
    const enabled = __internals.classifyCell(coldDryAgg, DEFAULT_CLIMATE_ZONE_STEP_PARAMS);
    expect(enabled.code.startsWith('D')).toBe(true);
    // 無効化すると B（BWk または Bsk）になる
    const disabled = __internals.classifyCell(coldDryAgg, {
      ...DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
      aridReclassToDEnabled: false,
    });
    expect(disabled.code.startsWith('B')).toBe(true);
  });

  it('§4.1.7: 暖かい B 候補（年平均 > しきい値）は振り戻されず B のまま', () => {
    const hotDryAgg = makeAgg({
      monthlyT: [5, 8, 12, 18, 24, 30, 32, 30, 24, 18, 12, 8],
      monthlyP: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 年 120mm（dry）
    });
    // annualMean ≈ 17.6, winterMin = 5, summerMax = 32 → C 候補（D 候補ではない）
    const result = __internals.classifyCell(hotDryAgg, DEFAULT_CLIMATE_ZONE_STEP_PARAMS);
    expect(result.code.startsWith('B')).toBe(true);
  });

  it('§4.1.7: しきい値を 0 に下げると、年平均 5°C の冷涼 B 候補は B のまま（しきい値以下に該当しない）', () => {
    const coolAgg = makeAgg({
      monthlyT: [-5, -3, 0, 5, 10, 15, 17, 15, 10, 5, 0, -3],
      monthlyP: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // 年 120mm（dry）
    });
    // annualMean ≈ 5.6, winterMin = -5, summerMax = 17 → D 候補
    const result = __internals.classifyCell(coolAgg, {
      ...DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
      aridReclassToDMaxAnnualTempCelsius: 0,
    });
    // 5.6 > 0 のため振り戻されず B のまま
    expect(result.code.startsWith('B')).toBe(true);
  });

  it('aridHotColdCriterion を annual に切替えても 4 階調コードが返る', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      Math.abs(cell.latitudeDeg) <= 40 && cell.longitudeDeg >= 0 && cell.longitudeDeg <= 30
        ? { ...cell, isLand: true, continentId: 'land' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid, { aridHotColdCriterion: 'annual' });
    const validPrefixes = ['A', 'B', 'C', 'D', 'E'];
    for (const row of result.zoneCodes) {
      for (const c of row) {
        if (!c) continue;
        expect(validPrefixes.some((p) => c.startsWith(p))).toBe(true);
      }
    }
  });
});

/** テスト用 MonthlyAggregation ファクトリ。 */
function makeAgg(
  overrides: Partial<{
    monthlyT: number[];
    monthlyP: number[];
    winterMin: number;
    summerMax: number;
    annualMean: number;
    annualPrecip: number;
    wettestMonth: number;
    driestMonth: number;
  }> = {},
): ReturnType<typeof __internals.aggregateCellMonthly> {
  const monthlyT = overrides.monthlyT ?? [10, 11, 12, 13, 14, 15, 15, 14, 13, 12, 11, 10];
  const monthlyP = overrides.monthlyP ?? [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
  const annualPrecip =
    overrides.annualPrecip ?? monthlyP.reduce((a, b) => a + b, 0);
  const wettest = overrides.wettestMonth ?? Math.max(...monthlyP);
  const driest = overrides.driestMonth ?? Math.min(...monthlyP);
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  indices.sort((a, b) => (monthlyT[b] ?? 0) - (monthlyT[a] ?? 0));
  const hotHalf = indices.slice(0, 6).sort((a, b) => a - b);
  const coldHalf = indices.slice(6, 12).sort((a, b) => a - b);
  return {
    monthlyTempCelsius: monthlyT,
    monthlyPrecipMm: monthlyP,
    winterMinCelsius: overrides.winterMin ?? Math.min(...monthlyT),
    summerMaxCelsius: overrides.summerMax ?? Math.max(...monthlyT),
    annualMeanCelsius:
      overrides.annualMean ?? monthlyT.reduce((a, b) => a + b, 0) / 12,
    annualPrecipMm: annualPrecip,
    wettestMonthMm: wettest,
    driestMonthMm: driest,
    hotHalfMonthIndices: hotHalf,
    coldHalfMonthIndices: coldHalf,
  };
}

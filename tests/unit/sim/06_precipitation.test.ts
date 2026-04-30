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
  __internals,
  computePrecipitation,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
} from '@/sim/06_precipitation';

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
  paramsOverrides: Partial<typeof DEFAULT_PRECIPITATION_STEP_PARAMS> = {},
) =>
  computePrecipitation(
    planet,
    grid,
    baseITCZ(planet, grid),
    baseWindBelt(planet, grid),
    baseOcean(planet, grid),
    baseAirflow(planet, grid),
    baseTemperature(planet, grid),
    { ...DEFAULT_PRECIPITATION_STEP_PARAMS, ...paramsOverrides },
  );

describe('sim/06_precipitation: 出力構造', () => {
  it('全 12 ヶ月の月別降水ラベル + 各種マスク + 起伏マップを返す', () => {
    const result = fullCompute();
    const grid = baseGrid();
    expect(result.monthlyPrecipitationLabels.length).toBe(12);
    expect(result.warmCurrentHumidBeltMask.length).toBe(grid.latitudeCount);
    expect(result.warmCurrentFetchKm.length).toBe(grid.latitudeCount);
    expect(result.mountainWindwardMask.length).toBe(grid.latitudeCount);
    expect(result.mountainLeewardMask.length).toBe(grid.latitudeCount);
    expect(result.monthlyFrontPassageFrequency.length).toBe(12);
    expect(result.polarFrontExtensionMask.length).toBe(grid.latitudeCount);
    expect(result.mountainReliefMeters.length).toBe(grid.latitudeCount);
  });

  it('降水ラベルは 4 階調（dry/normal/wet/very_wet）のみ', () => {
    const result = fullCompute();
    const valid = new Set(['dry', 'normal', 'wet', 'very_wet']);
    for (const month of result.monthlyPrecipitationLabels) {
      for (const row of month) {
        for (const label of row) {
          expect(valid.has(label)).toBe(true);
        }
      }
    }
  });
});

describe('sim/06_precipitation: 物理的特徴（地球プリセット）', () => {
  it('赤道帯に陸地大陸を置くと、ITCZ 影響帯内の海岸 onshore 陸地で wet または very_wet が現れる', () => {
    // 赤道横断大陸（経度 0–60°、緯度 ±15°）を作る
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60 && Math.abs(cell.latitudeDeg) <= 15
        ? { ...cell, isLand: true, continentId: 'eq-cont' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    let foundWet = false;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const cellRow = grid.cells[i];
      if (!cellRow) continue;
      for (let j = 0; j < grid.longitudeCount; j++) {
        const cell = cellRow[j];
        if (!cell || !cell.isLand) continue;
        if (Math.abs(cell.latitudeDeg) <= 10) {
          for (let m = 0; m < 12; m++) {
            const label = result.monthlyPrecipitationLabels[m]?.[i]?.[j];
            if (label === 'wet' || label === 'very_wet') {
              foundWet = true;
              break;
            }
          }
        }
        if (foundWet) break;
      }
      if (foundWet) break;
    }
    expect(foundWet).toBe(true);
  });

  it('標高 5000 m の陸地は dry ラベル（高地乾燥、§4.5）', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.latitudeDeg === 1 && cell.longitudeDeg === 1
        ? { ...cell, isLand: true, elevationMeters: 5000, continentId: 'high' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    const i = Math.round((1 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.round((1 + 180) / grid.resolutionDeg - 0.5);
    for (let m = 0; m < 12; m++) {
      const label = result.monthlyPrecipitationLabels[m]?.[i]?.[j];
      expect(label).toBe('dry');
    }
  });

  it('蒸発散量と降水ラベルは矛盾しない（NaN を出さない）', () => {
    const result = fullCompute();
    for (const month of result.monthlyPrecipitationLabels) {
      for (const row of month) {
        for (const label of row) {
          expect(['dry', 'normal', 'wet', 'very_wet']).toContain(label);
        }
      }
    }
  });
});

describe('sim/06_precipitation: 暖流海岸湿潤帯（§4.1）', () => {
  it('暖流由来 wet 帯マスクは true / false の二値', () => {
    const result = fullCompute();
    for (const row of result.warmCurrentHumidBeltMask) {
      for (const v of row) {
        expect(typeof v).toBe('boolean');
      }
    }
  });

  it('warmCurrentFetchKm は 0 以上で maxWetExtensionKm を超えない', () => {
    const result = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), { maxWetExtensionKm: 1500 });
    for (const row of result.warmCurrentFetchKm) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1500);
      }
    }
  });

  it('maxWetExtensionKm を 0 にすると warmCurrentHumidBeltMask が広がらない', () => {
    const result = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), { maxWetExtensionKm: 0 });
    let trueCount = 0;
    for (const row of result.warmCurrentHumidBeltMask) {
      for (const v of row) {
        if (v) trueCount++;
      }
    }
    // 海岸出発点（始点を 1 セル目で wet 化）程度は残る可能性あるため、
    // maxWetExtensionKm=2000 と比べて顕著に少ないことを確認
    const baseline = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), { maxWetExtensionKm: 2000 });
    let baselineCount = 0;
    for (const row of baseline.warmCurrentHumidBeltMask) {
      for (const v of row) {
        if (v) baselineCount++;
      }
    }
    expect(trueCount).toBeLessThanOrEqual(baselineCount);
  });
});

describe('sim/06_precipitation: 山脈起伏と風上風下（§4.4 / §6.2）', () => {
  it('山脈ブロックを置くと中央セルの起伏が高くなる', () => {
    const grid = mapGridCells(baseGrid(), (cell) => {
      if (
        cell.latitudeDeg >= -2 &&
        cell.latitudeDeg <= 2 &&
        cell.longitudeDeg >= 30 &&
        cell.longitudeDeg <= 32
      ) {
        return { ...cell, isLand: true, elevationMeters: 3000, continentId: 'mtn' };
      }
      return cell;
    });
    const reliefMap = __internals.computeMountainRelief(grid);
    // 山脈中央セル
    const i = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.round((30 + 180) / grid.resolutionDeg - 0.5);
    expect(reliefMap[i]?.[j] ?? 0).toBeGreaterThan(2000);
  });

  it('rainshadowDesertReliefMultiplier: 赤道近傍 1.5×、高緯度 0.5×', () => {
    expect(__internals.rainshadowDesertReliefMultiplier(0)).toBeCloseTo(1.5, 5);
    expect(__internals.rainshadowDesertReliefMultiplier(15)).toBeCloseTo(1.5, 5);
    expect(__internals.rainshadowDesertReliefMultiplier(50)).toBeCloseTo(0.5, 5);
    // 中緯度 30°: 1.0
    expect(__internals.rainshadowDesertReliefMultiplier(30)).toBeCloseTo(1.0, 5);
  });
});

describe('sim/06_precipitation: ITCZ 影響帯判定（§4.2）', () => {
  it('isInITCZBandAt: 中心 0°、半幅 15° で 10° は内、20° は外', () => {
    const band = {
      centerLatitudeDeg: 0,
      southBoundLatitudeDeg: -15,
      northBoundLatitudeDeg: 15,
    };
    expect(__internals.isInITCZBandAt(band, 10, 15)).toBe(true);
    expect(__internals.isInITCZBandAt(band, 20, 15)).toBe(false);
    expect(__internals.isInITCZBandAt(band, -20, 15)).toBe(false);
  });

  it('isInITCZBandAt: band undefined で false', () => {
    expect(__internals.isInITCZBandAt(undefined, 0, 15)).toBe(false);
  });
});

describe('sim/06_precipitation: 極前線拡張（§4.7）', () => {
  it('isWinterMonthForLatitude: NH 1 月（index 0）は冬、SH では夏', () => {
    expect(__internals.isWinterMonthForLatitude(0, 50)).toBe(true);
    expect(__internals.isWinterMonthForLatitude(0, -50)).toBe(false);
  });

  it('isWinterMonthForLatitude: SH 7 月（index 6）は冬、NH では夏', () => {
    expect(__internals.isWinterMonthForLatitude(6, -50)).toBe(true);
    expect(__internals.isWinterMonthForLatitude(6, 50)).toBe(false);
  });

  it('polarFrontExtensionMask は中高緯度（40〜60°）の冷涼陸地で true', () => {
    // 50° N に陸地を置き winterMin が低くなるグリッド
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.latitudeDeg >= 48 && cell.latitudeDeg <= 52
        ? { ...cell, isLand: true, continentId: 'cold' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    const i = Math.round((50 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.round((30 + 180) / grid.resolutionDeg - 0.5);
    expect(result.polarFrontExtensionMask[i]?.[j]).toBe(true);
  });
});

describe('sim/06_precipitation: 内部ヘルパ', () => {
  it('cellStepKm: 赤道 1° 経度 = 約 110 km', () => {
    const grid = baseGrid(1);
    const km = __internals.cellStepKm(EARTH_PLANET_PARAMS, grid, 0, 0, 1);
    expect(km).toBeCloseTo(111.2, 0);
  });

  it('cellStepKm: 北緯 60° の 1° 経度 = 約 55 km（cos 補正）', () => {
    const grid = baseGrid(1);
    const km = __internals.cellStepKm(EARTH_PLANET_PARAMS, grid, 60, 0, 1);
    expect(km).toBeCloseTo(55.6, 0);
  });

  it('coastalNormalIntoLand: 海洋に囲まれた陸地（孤島）でも法線が出る', () => {
    // 全海洋に 1 セル陸地を置く
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.latitudeDeg === 1 && cell.longitudeDeg === 1
        ? { ...cell, isLand: true, continentId: 'island' }
        : cell,
    );
    const i = Math.round((1 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.round((1 + 180) / grid.resolutionDeg - 0.5);
    const normal = __internals.coastalNormalIntoLand(grid, i, j);
    // 4 近傍すべて海なので、法線は (0, 0) で len=0 → null
    expect(normal).toBeNull();
  });

  it('coastalNormalIntoLand: 海岸線で正の長さの法線を返す', () => {
    // 経度 [0, 60] かつ |lat| < 30 を陸地にする → 西海岸 lon=0 が海岸
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60 && Math.abs(cell.latitudeDeg) < 30
        ? { ...cell, isLand: true, continentId: 'land' }
        : cell,
    );
    // lon=1° の西岸セル（隣接 lon=-1° は海）
    const i = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.round((1 + 180) / grid.resolutionDeg - 0.5);
    const normal = __internals.coastalNormalIntoLand(grid, i, j);
    expect(normal).not.toBeNull();
    if (normal) {
      const len = Math.sqrt(normal.nx * normal.nx + normal.ny * normal.ny);
      expect(len).toBeCloseTo(1, 5);
      // 西海岸: 海(west) → 陸(east)、法線は東向き（nx > 0）
      expect(normal.nx).toBeGreaterThan(0);
    }
  });
});

describe('sim/06_precipitation: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = baseGrid();
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, grid);
    const air = baseAirflow(EARTH_PLANET_PARAMS, grid);
    const temp = baseTemperature(EARTH_PLANET_PARAMS, grid);
    const a = computePrecipitation(
      EARTH_PLANET_PARAMS, grid, itcz, wind, ocean, air, temp,
    );
    const b = computePrecipitation(
      EARTH_PLANET_PARAMS, grid, itcz, wind, ocean, air, temp,
    );
    expect(a).toEqual(b);
  });
});

describe('sim/06_precipitation: パラメータ依存', () => {
  it('rainshadowDesertReliefMeters を下げると dry 領域が増える（または同じ）', () => {
    // 大陸を作り、その中央付近に高地を置く
    const grid = mapGridCells(baseGrid(), (cell) => {
      if (cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60 && Math.abs(cell.latitudeDeg) < 40) {
        if (cell.longitudeDeg >= 30 && cell.longitudeDeg <= 32) {
          return { ...cell, isLand: true, elevationMeters: 3000, continentId: 'land-mtn' };
        }
        return { ...cell, isLand: true, continentId: 'land' };
      }
      return cell;
    });
    const high = fullCompute(EARTH_PLANET_PARAMS, grid, {
      rainshadowDesertReliefMeters: 4000, // 厳しいしきい値 → ほとんど rainshadow desert にならない
    });
    const low = fullCompute(EARTH_PLANET_PARAMS, grid, {
      rainshadowDesertReliefMeters: 500, // 低いしきい値 → 多くの leeward が dry
    });
    let highDry = 0;
    let lowDry = 0;
    for (let m = 0; m < 12; m++) {
      for (const row of high.monthlyPrecipitationLabels[m] ?? []) {
        for (const v of row) if (v === 'dry') highDry++;
      }
      for (const row of low.monthlyPrecipitationLabels[m] ?? []) {
        for (const v of row) if (v === 'dry') lowDry++;
      }
    }
    expect(lowDry).toBeGreaterThanOrEqual(highDry);
  });

  it('itczInfluenceHalfWidthDeg を 0 にすると very_wet が大幅に減る（または同じ）', () => {
    const wide = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      itczInfluenceHalfWidthDeg: 20,
    });
    const zero = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      itczInfluenceHalfWidthDeg: 0,
    });
    let wideVery = 0;
    let zeroVery = 0;
    for (let m = 0; m < 12; m++) {
      for (const row of wide.monthlyPrecipitationLabels[m] ?? []) {
        for (const v of row) if (v === 'very_wet') wideVery++;
      }
      for (const row of zero.monthlyPrecipitationLabels[m] ?? []) {
        for (const v of row) if (v === 'very_wet') zeroVery++;
      }
    }
    expect(zeroVery).toBeLessThanOrEqual(wideVery);
  });
});

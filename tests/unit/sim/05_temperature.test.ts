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
  __internals,
  computeTemperature,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
} from '@/sim/05_temperature';

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
  paramsOverrides: Partial<typeof DEFAULT_TEMPERATURE_STEP_PARAMS> = {},
) =>
  computeTemperature(
    planet,
    grid,
    baseITCZ(planet, grid),
    baseWindBelt(planet, grid),
    baseOcean(planet, grid),
    baseAirflow(planet, grid),
    { ...DEFAULT_TEMPERATURE_STEP_PARAMS, ...paramsOverrides },
  );

describe('sim/05_temperature: 出力構造', () => {
  it('全 12 ヶ月の月別温度・年平均・夏冬極値・雪氷マスク・蒸発散量・季節振幅・極反転フラグを返す', () => {
    const result = fullCompute();
    expect(result.monthlyTemperatureCelsius.length).toBe(12);
    expect(result.monthlyEvapotranspirationMmPerMonth.length).toBe(12);
    expect(result.annualMeanTemperatureCelsius.length).toBe(baseGrid().latitudeCount);
    expect(result.summerMaxTemperatureCelsius.length).toBe(baseGrid().latitudeCount);
    expect(result.winterMinTemperatureCelsius.length).toBe(baseGrid().latitudeCount);
    expect(result.snowIceMask.length).toBe(baseGrid().latitudeCount);
    expect(result.seasonalAmplitudeCelsius.length).toBe(baseGrid().latitudeCount);
    expect(typeof result.polarInversion).toBe('boolean');
  });

  it('地球プリセットでは polarInversion = false（axialTilt 23.44° < 54°）', () => {
    const result = fullCompute();
    expect(result.polarInversion).toBe(false);
  });

  it('axialTilt > 54° で polarInversion = true', () => {
    const tilted: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 70 },
    };
    const result = fullCompute(tilted);
    expect(result.polarInversion).toBe(true);
  });
});

describe('sim/05_temperature: 物理的特徴（地球プリセット）', () => {
  it('赤道の年平均気温 > 極の年平均気温（緯度勾配）', () => {
    const result = fullCompute();
    const grid = baseGrid();
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const polarI = Math.round((85 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const eqMean = result.annualMeanTemperatureCelsius[eqI]?.[j] ?? 0;
    const polarMean = result.annualMeanTemperatureCelsius[polarI]?.[j] ?? 0;
    expect(eqMean).toBeGreaterThan(polarMean);
  });

  it('極の冬最低気温 < 0 °C（雪氷帯が出現する条件）', () => {
    const result = fullCompute();
    const grid = baseGrid();
    const polarI = Math.round((85 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const polarWinter = result.winterMinTemperatureCelsius[polarI]?.[j] ?? 0;
    expect(polarWinter).toBeLessThan(0);
  });

  it('赤道の夏最高気温 > 10 °C（赤道帯は常時温暖）', () => {
    const result = fullCompute();
    const grid = baseGrid();
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const eqSummer = result.summerMaxTemperatureCelsius[eqI]?.[j] ?? 0;
    expect(eqSummer).toBeGreaterThan(10);
  });

  it('NH 7 月（夏）の高緯度温度 > 1 月（冬）の同位置（季節サイクル）', () => {
    const result = fullCompute();
    const grid = baseGrid();
    const i = Math.round((60 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const july = result.monthlyTemperatureCelsius[6]?.[i]?.[j] ?? 0;
    const january = result.monthlyTemperatureCelsius[0]?.[i]?.[j] ?? 0;
    expect(july).toBeGreaterThan(january);
  });

  it('全月の温度が NaN にならない', () => {
    const result = fullCompute();
    for (const month of result.monthlyTemperatureCelsius) {
      for (const row of month) {
        for (const t of row) {
          expect(Number.isFinite(t)).toBe(true);
        }
      }
    }
  });
});

describe('sim/05_temperature: 標高補正と高地高原キャップ', () => {
  it('標高 5000 m の陸地は同緯度の海洋より低温（lapse rate × 5 km）', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.latitudeDeg === 1 && cell.longitudeDeg === 1
        ? { ...cell, isLand: true, elevationMeters: 5000, continentId: 'high' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    const i = Math.round((1 + 90) / grid.resolutionDeg - 0.5);
    const jHighland = Math.round((1 + 180) / grid.resolutionDeg - 0.5);
    const jOcean = Math.round((-90 + 180) / grid.resolutionDeg - 0.5);
    const tHighland = result.annualMeanTemperatureCelsius[i]?.[jHighland] ?? 0;
    const tOcean = result.annualMeanTemperatureCelsius[i]?.[jOcean] ?? 0;
    expect(tHighland).toBeLessThan(tOcean);
  });

  it('標高 > 4 km 陸地は気温 ≤ 10 °C にクランプ（高地高原キャップ）', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.latitudeDeg === 1 && cell.longitudeDeg === 1
        ? { ...cell, isLand: true, elevationMeters: 4500, continentId: 'plateau' }
        : cell,
    );
    const result = fullCompute(EARTH_PLANET_PARAMS, grid);
    const i = Math.round((1 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.round((1 + 180) / grid.resolutionDeg - 0.5);
    for (let m = 0; m < 12; m++) {
      const t = result.monthlyTemperatureCelsius[m]?.[i]?.[j];
      if (t !== undefined) {
        expect(t).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
  });
});

describe('sim/05_temperature: 海岸補正と continentality', () => {
  it('continentalityStrength=0 では内陸の振幅が増幅されない（海岸セルと比較）', () => {
    // NH 経度 0-90° に大陸を作る
    const landGrid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 90 && cell.latitudeDeg > 0
        ? { ...cell, isLand: true, continentId: 'land' }
        : cell,
    );
    const noContinentality = fullCompute(EARTH_PLANET_PARAMS, landGrid, {
      continentalityStrength: 0,
      windAdvectionStrength: 0,
      snowIceFeedbackIterations: 0,
    });
    const withContinentality = fullCompute(EARTH_PLANET_PARAMS, landGrid, {
      continentalityStrength: 1,
      windAdvectionStrength: 0,
      snowIceFeedbackIterations: 0,
    });
    const i = Math.round((30 + 90) / landGrid.resolutionDeg - 0.5);
    // 大陸内陸（lon = 45°）— 西岸からも東岸からも 5 セル離れている
    const jInterior = Math.round((45 + 180) / landGrid.resolutionDeg - 0.5);
    const ampNo = noContinentality.seasonalAmplitudeCelsius[i]?.[jInterior] ?? 0;
    const ampYes = withContinentality.seasonalAmplitudeCelsius[i]?.[jInterior] ?? 0;
    expect(ampYes).toBeGreaterThan(ampNo);
  });
});

describe('sim/05_temperature: 雪氷フィードバック', () => {
  it('snowIceMask は極帯で true、赤道で false', () => {
    const result = fullCompute();
    const grid = baseGrid();
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const polarI = Math.round((85 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    expect(result.snowIceMask[eqI]?.[j]).toBe(false);
    expect(result.snowIceMask[polarI]?.[j]).toBe(true);
  });

  it('反復回数を増やすと雪氷被覆面積が広がるか同じ（単調増加）', () => {
    const noFeedback = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      snowIceFeedbackIterations: 0,
    });
    const fullFeedback = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      snowIceFeedbackIterations: 3,
    });
    let countNo = 0;
    let countFull = 0;
    for (const row of noFeedback.snowIceMask) {
      for (const v of row) if (v) countNo++;
    }
    for (const row of fullFeedback.snowIceMask) {
      for (const v of row) if (v) countFull++;
    }
    expect(countFull).toBeGreaterThanOrEqual(countNo);
  });
});

describe('sim/05_temperature: 蒸発散量', () => {
  it('蒸発散量はすべて非負', () => {
    const result = fullCompute();
    for (const month of result.monthlyEvapotranspirationMmPerMonth) {
      for (const row of month) {
        for (const v of row) {
          expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('赤道の蒸発散量 > 極の蒸発散量（暖かい場所ほど多い）', () => {
    const result = fullCompute();
    const grid = baseGrid();
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const polarI = Math.round((85 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const eqET = result.monthlyEvapotranspirationMmPerMonth[6]?.[eqI]?.[j] ?? 0;
    const polarET = result.monthlyEvapotranspirationMmPerMonth[6]?.[polarI]?.[j] ?? 0;
    expect(eqET).toBeGreaterThan(polarET);
  });
});

describe('sim/05_temperature: 縮退・極端値耐性', () => {
  it('axialTilt = 0 でも NaN を出さない（負ゼロ起因の破綻を回避、§6.1.1）', () => {
    const flat: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 0 },
    };
    const result = fullCompute(flat);
    for (const month of result.monthlyTemperatureCelsius) {
      for (const row of month) {
        for (const t of row) {
          expect(Number.isFinite(t)).toBe(true);
        }
      }
    }
  });

  it('semiMajorAxisAU = 0.5（高日射）で全球温度が地球より高い', () => {
    const hot: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      orbital: { ...EARTH_PLANET_PARAMS.orbital, semiMajorAxisAU: 0.5 },
    };
    const grid = baseGrid();
    const earth = fullCompute();
    const hotter = fullCompute(hot, grid);
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    expect(hotter.annualMeanTemperatureCelsius[eqI]?.[j] ?? 0).toBeGreaterThan(
      earth.annualMeanTemperatureCelsius[eqI]?.[j] ?? 0,
    );
  });
});

describe('sim/05_temperature: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = baseGrid();
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, grid);
    const air = baseAirflow(EARTH_PLANET_PARAMS, grid);
    const a = computeTemperature(EARTH_PLANET_PARAMS, grid, itcz, wind, ocean, air);
    const b = computeTemperature(EARTH_PLANET_PARAMS, grid, itcz, wind, ocean, air);
    expect(a).toEqual(b);
  });
});

describe('sim/05_temperature: 等温線（[docs/spec/05_気温.md §4.12]）', () => {
  it('annualIsotherms と monthlyIsotherms を返す（既定 10°C 刻み）', () => {
    const result = fullCompute();
    expect(result.annualIsotherms.length).toBeGreaterThan(0);
    expect(result.monthlyIsotherms.length).toBe(12);
    // 各等値線は temperatureCelsius が刻み幅の整数倍
    for (const line of result.annualIsotherms) {
      expect(Math.abs(line.temperatureCelsius % 10)).toBeLessThan(1e-6);
      expect(line.segments.length).toBeGreaterThan(0);
    }
  });

  it('isothermIntervalCelsius=0 で空配列を返す（生成抑制）', () => {
    const result = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      isothermIntervalCelsius: 0,
    });
    expect(result.annualIsotherms.length).toBe(0);
    for (const m of result.monthlyIsotherms) {
      expect(m.length).toBe(0);
    }
  });

  it('刻み幅を細かくすると等値線数が増える', () => {
    const coarse = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      isothermIntervalCelsius: 20,
    });
    const fine = fullCompute(EARTH_PLANET_PARAMS, baseGrid(), {
      isothermIntervalCelsius: 5,
    });
    expect(fine.annualIsotherms.length).toBeGreaterThan(coarse.annualIsotherms.length);
  });

  it('extractIsothermSegmentsAtLevel: 一定値マップでは空配列', () => {
    const grid = baseGrid();
    const flatMap: number[][] = new Array(grid.latitudeCount);
    for (let i = 0; i < grid.latitudeCount; i++) {
      flatMap[i] = new Array(grid.longitudeCount).fill(15);
    }
    const segments = __internals.extractIsothermSegmentsAtLevel(
      flatMap as unknown as ReadonlyArray<ReadonlyArray<number>>,
      grid,
      10,
    );
    expect(segments.length).toBe(0);
  });

  it('extractIsothermSegmentsAtLevel: 階段マップで境界に等値線が現れる', () => {
    const grid = baseGrid();
    const stepMap: number[][] = new Array(grid.latitudeCount);
    for (let i = 0; i < grid.latitudeCount; i++) {
      const row = new Array<number>(grid.longitudeCount);
      for (let j = 0; j < grid.longitudeCount; j++) {
        // 経度 0° 境界で温度が 0 → 20 に変化
        row[j] = j < grid.longitudeCount / 2 ? 0 : 20;
      }
      stepMap[i] = row;
    }
    const segments = __internals.extractIsothermSegmentsAtLevel(
      stepMap as unknown as ReadonlyArray<ReadonlyArray<number>>,
      grid,
      10,
    );
    // 中央経度の境界に縦の等値線が現れる
    expect(segments.length).toBeGreaterThan(0);
  });
});

describe('sim/05_temperature: 内部ヘルパ', () => {
  it('dailyInsolationFactor: 赤道（lat=0、dec=0）で約 1/π', () => {
    // h₀ = π/2、Q = (0 + 1×1×1)/π = 1/π ≈ 0.318
    expect(__internals.dailyInsolationFactor(0, 0)).toBeCloseTo(1 / Math.PI, 4);
  });

  it('dailyInsolationFactor: 極夜（lat=80、dec=-23）で 0', () => {
    const v = __internals.dailyInsolationFactor(80, -23);
    expect(v).toBeCloseTo(0, 6);
  });

  it('dailyInsolationFactor: 極昼（lat=80、dec=+23）で正値', () => {
    const v = __internals.dailyInsolationFactor(80, 23);
    expect(v).toBeGreaterThan(0);
  });

  it('distanceFactorByMonth: 離心率 0 で常に 1', () => {
    for (let m = 0; m < 12; m++) {
      expect(__internals.distanceFactorByMonth(m, 0, 0)).toBeCloseTo(1, 6);
    }
  });

  it('distanceFactorByMonth: 離心率 0.5 では月によって値が変化（max > 1.5、min < 0.7）', () => {
    const values: number[] = new Array(12);
    for (let m = 0; m < 12; m++) values[m] = __internals.distanceFactorByMonth(m, 0.5, 0);
    expect(Math.max(...values)).toBeGreaterThan(1.5);
    expect(Math.min(...values)).toBeLessThan(0.7);
  });

  it('computeDistanceToOcean: 全海洋では距離 0 一様', () => {
    const dist = __internals.computeDistanceToOcean(baseGrid());
    for (const row of dist) {
      for (const d of row) {
        expect(d).toBe(0);
      }
    }
  });

  it('computeDistanceToOcean: 内陸セルは正の距離を持つ', () => {
    const grid = mapGridCells(baseGrid(), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 30 && Math.abs(cell.latitudeDeg) <= 30
        ? { ...cell, isLand: true, continentId: 'small' }
        : cell,
    );
    const dist = __internals.computeDistanceToOcean(grid);
    const i = Math.round((1 + 90) / grid.resolutionDeg - 0.5);
    const jInterior = Math.round((15 + 180) / grid.resolutionDeg - 0.5);
    expect(dist[i]?.[jInterior] ?? 0).toBeGreaterThan(0);
  });
});

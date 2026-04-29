import { describe, expect, it } from 'vitest';
import {
  EARTH_PLANET_PARAMS,
  createGrid,
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
import {
  DEFAULT_AIRFLOW_STEP_PARAMS,
  computeAirflow,
} from '@/sim/04_airflow';

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

function mapGridCells(grid: Grid, customizer: (cell: Cell) => Cell): Grid {
  return {
    resolutionDeg: grid.resolutionDeg,
    latitudeCount: grid.latitudeCount,
    longitudeCount: grid.longitudeCount,
    cells: grid.cells.map((row) => row.map((cell) => customizer(cell))),
  };
}

describe('sim/04_airflow: computeAirflow 出力構造', () => {
  it('全 12 ヶ月の風ベクトル場・圧力 anomaly・気圧中心・山脈フラグを返す', () => {
    const grid = baseGrid(2);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      baseOcean(EARTH_PLANET_PARAMS, grid),
    );
    expect(result.monthlyWindField.length).toBe(12);
    expect(result.monthlyPressureAnomalyHpa.length).toBe(12);
    expect(result.monthlyPressureCenters.length).toBe(12);
    expect(result.mountainDeflectionApplied.length).toBe(grid.latitudeCount);
  });

  it('pressureCenters は最小実装で空配列', () => {
    const grid = baseGrid(2);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      baseOcean(EARTH_PLANET_PARAMS, grid),
    );
    for (const month of result.monthlyPressureCenters) {
      expect(month.length).toBe(0);
    }
  });
});

describe('sim/04_airflow: 圧力 anomaly = pressure - basePressure', () => {
  it('全海洋・地球プリセットの基準気圧 1013.25 hPa から帯状値を引いた値が anomaly', () => {
    const grid = baseGrid(2);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      wind,
      baseOcean(EARTH_PLANET_PARAMS, grid),
    );
    const pressureMap = wind.monthlySurfacePressureHpa[0]!;
    const anomalyMap = result.monthlyPressureAnomalyHpa[0]!;
    const i = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    expect(anomalyMap[i]?.[j]).toBeCloseTo(
      (pressureMap[i]?.[j] ?? 0) - EARTH_PLANET_PARAMS.atmosphereOcean.surfacePressureHpa,
      6,
    );
  });
});

describe('sim/04_airflow: 山脈偏向フラグ', () => {
  it('elevation > mountainDeflectionThresholdMeters のセルで true', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.latitudeDeg === 31 ? { ...cell, isLand: true, elevationMeters: 5000 } : cell,
    );
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      baseOcean(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_AIRFLOW_STEP_PARAMS, mountainDeflectionThresholdMeters: 2000 },
    );
    let highCount = 0;
    for (const row of result.mountainDeflectionApplied) {
      for (const v of row) {
        if (v) highCount++;
      }
    }
    expect(highCount).toBeGreaterThan(0);
  });

  it('全海洋では山脈フラグはすべて false', () => {
    const grid = baseGrid(2);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      baseOcean(EARTH_PLANET_PARAMS, grid),
    );
    for (const row of result.mountainDeflectionApplied) {
      for (const v of row) {
        expect(v).toBe(false);
      }
    }
  });
});

describe('sim/04_airflow: 地衡風成分の合成', () => {
  it('pressureGradientCoefficient = 0 では Step 2 の卓越風と同値', () => {
    const grid = baseGrid(2);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      wind,
      baseOcean(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_AIRFLOW_STEP_PARAMS, pressureGradientCoefficient: 0 },
    );
    // 中緯度（lat = 30°）で比較（赤道近傍は地衡風近似破綻領域）
    const i = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const prevailing = wind.monthlyPrevailingWind[0]?.[i]?.[j];
    const final = result.monthlyWindField[0]?.[i]?.[j];
    expect(prevailing).toBeDefined();
    expect(final).toBeDefined();
    if (prevailing && final) {
      expect(final.uMps).toBeCloseTo(prevailing.uMps, 6);
      expect(final.vMps).toBeCloseTo(prevailing.vMps, 6);
    }
  });

  it('赤道近傍（|sin(lat)| < 0.05）では地衡風成分が 0（破綻回避）', () => {
    const grid = baseGrid(2);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      wind,
      baseOcean(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_AIRFLOW_STEP_PARAMS, pressureGradientCoefficient: 1 },
    );
    // lat = 0° 付近（|sin(lat)| ≈ 0）
    const i = Math.round((1 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    const prevailing = wind.monthlyPrevailingWind[0]?.[i]?.[j];
    const final = result.monthlyWindField[0]?.[i]?.[j];
    if (prevailing && final) {
      expect(final.uMps).toBeCloseTo(prevailing.uMps, 6);
      expect(final.vMps).toBeCloseTo(prevailing.vMps, 6);
    }
  });

  it('経度方向に陸海差がある planet で NH 夏の地衡風成分は卓越風に対して非ゼロ寄与', () => {
    // 経度 0-90° の NH のみ陸地、それ以外は海洋。経度方向に大陸 anomaly が変化し、
    // ∂p/∂x が生じて地衡風成分が現れる（同緯度全陸地だと ∂p/∂x = 0 になり地衡風 0）。
    const halfLandGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 90 && cell.latitudeDeg > 0
        ? { ...cell, isLand: true, continentId: 'nh-east' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, halfLandGrid);
    const wind = computeWindBelt(EARTH_PLANET_PARAMS, halfLandGrid, itcz, DEFAULT_WIND_BELT_STEP_PARAMS);
    const ocean = computeOceanCurrent(EARTH_PLANET_PARAMS, halfLandGrid, itcz, wind, DEFAULT_OCEAN_CURRENT_STEP_PARAMS);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      halfLandGrid,
      itcz,
      wind,
      ocean,
      { ...DEFAULT_AIRFLOW_STEP_PARAMS, pressureGradientCoefficient: 1 },
    );
    // 大陸の境界付近（lon ≈ 90°、lat = 30°）では経度方向に大きな pressure 勾配がある
    const i = Math.round((30 + 90) / halfLandGrid.resolutionDeg - 0.5);
    const j = Math.round((90 + 180) / halfLandGrid.resolutionDeg - 0.5);
    const prevailing = wind.monthlyPrevailingWind[6]?.[i]?.[j]; // 7 月
    const final = result.monthlyWindField[6]?.[i]?.[j];
    expect(prevailing).toBeDefined();
    expect(final).toBeDefined();
    if (prevailing && final) {
      const diffU = final.uMps - prevailing.uMps;
      const diffV = final.vMps - prevailing.vMps;
      const totalDiff = Math.sqrt(diffU * diffU + diffV * diffV);
      expect(totalDiff).toBeGreaterThan(0.01);
    }
  });
});

describe('sim/04_airflow: 縮退・極端値耐性', () => {
  it('axialTiltDeg = 0 で declination が 0 でも NaN を出さない', () => {
    const flat: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 0 },
    };
    const grid = baseGrid(2);
    const result = computeAirflow(
      flat,
      grid,
      baseITCZ(flat, grid),
      baseWindBelt(flat, grid),
      baseOcean(flat, grid),
    );
    for (const monthField of result.monthlyWindField) {
      for (const row of monthField) {
        for (const wind of row) {
          expect(Number.isFinite(wind.uMps)).toBe(true);
          expect(Number.isFinite(wind.vMps)).toBe(true);
        }
      }
    }
  });
});

describe('sim/04_airflow: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = baseGrid(2);
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, grid);
    const a = computeAirflow(EARTH_PLANET_PARAMS, grid, itcz, wind, ocean);
    const b = computeAirflow(EARTH_PLANET_PARAMS, grid, itcz, wind, ocean);
    expect(a).toEqual(b);
  });
});

describe('sim/04_airflow: 圧力中心検出（[docs/spec/04_気流.md §4.1〜§4.4]）', () => {
  it('全海洋では帯状偏差がほぼ 0 となり中心は検出されない', () => {
    const grid = baseGrid(2);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      baseOcean(EARTH_PLANET_PARAMS, grid),
    );
    for (const month of result.monthlyPressureCenters) {
      expect(month.length).toBe(0);
    }
  });

  it('NH 経度 0-90° 陸地で 7 月に低気圧中心が検出される（夏の大陸低気圧）', () => {
    const halfLandGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 90 && cell.latitudeDeg > 0
        ? { ...cell, isLand: true, continentId: 'nh-east' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, halfLandGrid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, halfLandGrid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, halfLandGrid);
    const result = computeAirflow(EARTH_PLANET_PARAMS, halfLandGrid, itcz, wind, ocean);
    const julyCenters = result.monthlyPressureCenters[6];
    const lows = julyCenters.filter((c) => c.type === 'low');
    expect(lows.length).toBeGreaterThan(0);
    // 北半球の陸地中央付近（lat > 0、lon 0-90°）に検出される
    const continentalLow = lows.find(
      (c) =>
        c.position.latitudeDeg > 0 &&
        c.position.latitudeDeg < 60 &&
        c.position.longitudeDeg > 0 &&
        c.position.longitudeDeg < 90,
    );
    expect(continentalLow).toBeDefined();
  });

  it('intensityHpa は正の値（|anomaly_dev| 最大値）', () => {
    const halfLandGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 90 && cell.latitudeDeg > 0
        ? { ...cell, isLand: true, continentId: 'nh-east' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, halfLandGrid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, halfLandGrid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, halfLandGrid);
    const result = computeAirflow(EARTH_PLANET_PARAMS, halfLandGrid, itcz, wind, ocean);
    for (const month of result.monthlyPressureCenters) {
      for (const center of month) {
        expect(center.intensityHpa).toBeGreaterThan(0);
      }
    }
  });

  it('しきい値を上げると検出数が減る（パラメータが効く）', () => {
    const halfLandGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 90 && cell.latitudeDeg > 0
        ? { ...cell, isLand: true, continentId: 'nh-east' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, halfLandGrid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, halfLandGrid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, halfLandGrid);
    const lowThreshold = computeAirflow(EARTH_PLANET_PARAMS, halfLandGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      pressureCenterThresholdHpa: 0.5,
    });
    const highThreshold = computeAirflow(EARTH_PLANET_PARAMS, halfLandGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      pressureCenterThresholdHpa: 100,
    });
    const lowCount = lowThreshold.monthlyPressureCenters.reduce((s, m) => s + m.length, 0);
    const highCount = highThreshold.monthlyPressureCenters.reduce((s, m) => s + m.length, 0);
    expect(lowCount).toBeGreaterThan(highCount);
    expect(highCount).toBe(0);
  });
});

describe('sim/04_airflow: 山脈による風流路の偏向（[docs/spec/04_気流.md §4.6]）', () => {
  it('南北方向に並ぶ山脈の風下側 1 セルで u 成分が減衰', () => {
    // lon = -1° / +1° の 2 列に NH 全緯度の山脈（南北方向の連続列）。
    // Hadley 帯（lat 11°）では u が西向き（負）なので風下は j-1（西側、lon = -3°）。
    const ridgeGrid = mapGridCells(baseGrid(2), (cell) =>
      Math.abs(cell.longitudeDeg) <= 1 && cell.latitudeDeg > 0
        ? { ...cell, isLand: true, elevationMeters: 5000, continentId: 'ridge' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, ridgeGrid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, ridgeGrid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, ridgeGrid);
    const baseline = computeAirflow(EARTH_PLANET_PARAMS, ridgeGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      mountainDeflectionThresholdMeters: 99999, // 偏向無効
    });
    const deflected = computeAirflow(EARTH_PLANET_PARAMS, ridgeGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      mountainDeflectionThresholdMeters: 2000, // 偏向有効
    });
    // 山脈の lon=-1° 隣接（風下）の Hadley（lat=11°）セルを比較
    // i = round((10+90)/2 - 0.5) = 50 → lat = -90 + 50.5*2 = 11°（Hadley、u 負）
    const i = Math.round((10 + 90) / ridgeGrid.resolutionDeg - 0.5);
    // u が負（西向き、Hadley NH）なので風下は j-1。lon = -3° のセルを見る。
    const j = Math.round((-3 + 180) / ridgeGrid.resolutionDeg - 0.5);
    const baseU = Math.abs(baseline.monthlyWindField[0]?.[i]?.[j]?.uMps ?? 0);
    const deflU = Math.abs(deflected.monthlyWindField[0]?.[i]?.[j]?.uMps ?? 0);
    expect(deflU).toBeLessThan(baseU);
  });

  it('しきい値が高すぎる山脈無し planet でも全 12 ヶ月で NaN を出さない', () => {
    const grid = baseGrid(2);
    const result = computeAirflow(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      baseOcean(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_AIRFLOW_STEP_PARAMS, mountainDeflectionThresholdMeters: 99999 },
    );
    for (const monthField of result.monthlyWindField) {
      for (const row of monthField) {
        for (const wind of row) {
          expect(Number.isFinite(wind.uMps)).toBe(true);
          expect(Number.isFinite(wind.vMps)).toBe(true);
        }
      }
    }
  });
});

describe('sim/04_airflow: モンスーン領域での風向反転（[docs/spec/04_気流.md §4.8]）', () => {
  it('monsoonReversalStrength=0 と =1 で夏半球の monsoon mask セルの風向が逆になる', () => {
    // ITCZ がよく振れる地球プリセット + 大陸を NH 赤道直交近くに置くことで monsoon mask を発生させる
    const monsoonGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 &&
      cell.longitudeDeg <= 90 &&
      cell.latitudeDeg > -10 &&
      cell.latitudeDeg < 30
        ? { ...cell, isLand: true, continentId: 'monsoon' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, monsoonGrid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, monsoonGrid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, monsoonGrid);
    // 7 月 (NH 夏)、地衡風寄与は 0 にして卓越風だけで比較
    const noReversal = computeAirflow(EARTH_PLANET_PARAMS, monsoonGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      pressureGradientCoefficient: 0,
      monsoonReversalStrength: 0,
    });
    const fullReversal = computeAirflow(EARTH_PLANET_PARAMS, monsoonGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      pressureGradientCoefficient: 0,
      monsoonReversalStrength: 1,
    });
    // monsoon マスクが立つ陸地セルを探す
    const julyMonsoon = wind.monthlyMonsoonMask[6]!;
    let reversed = false;
    for (let i = 0; i < monsoonGrid.latitudeCount; i++) {
      const monsoonRow = julyMonsoon[i];
      if (!monsoonRow) continue;
      for (let j = 0; j < monsoonGrid.longitudeCount; j++) {
        if (!monsoonRow[j]) continue;
        const a = noReversal.monthlyWindField[6]?.[i]?.[j];
        const b = fullReversal.monthlyWindField[6]?.[i]?.[j];
        if (!a || !b) continue;
        // u 成分の符号反転 or v 成分の符号反転を確認
        if (
          (Math.abs(a.uMps) > 0.1 && Math.sign(a.uMps) !== Math.sign(b.uMps)) ||
          (Math.abs(a.vMps) > 0.1 && Math.sign(a.vMps) !== Math.sign(b.vMps))
        ) {
          reversed = true;
          break;
        }
      }
      if (reversed) break;
    }
    expect(reversed).toBe(true);
  });

  it('monsoon mask が立たない冬半球（NH 1 月）では風が変わらない', () => {
    const monsoonGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 &&
      cell.longitudeDeg <= 90 &&
      cell.latitudeDeg > -10 &&
      cell.latitudeDeg < 30
        ? { ...cell, isLand: true, continentId: 'monsoon' }
        : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, monsoonGrid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, monsoonGrid);
    const ocean = baseOcean(EARTH_PLANET_PARAMS, monsoonGrid);
    const noReversal = computeAirflow(EARTH_PLANET_PARAMS, monsoonGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      pressureGradientCoefficient: 0,
      monsoonReversalStrength: 0,
    });
    const fullReversal = computeAirflow(EARTH_PLANET_PARAMS, monsoonGrid, itcz, wind, ocean, {
      ...DEFAULT_AIRFLOW_STEP_PARAMS,
      pressureGradientCoefficient: 0,
      monsoonReversalStrength: 1,
    });
    // 1 月（declSign = -1、SH 夏）。NH の monsoon マスク陸地（lat > 0）は冬側なので反転されない
    for (let i = 0; i < monsoonGrid.latitudeCount; i++) {
      const cellRow = monsoonGrid.cells[i];
      if (!cellRow) continue;
      for (let j = 0; j < monsoonGrid.longitudeCount; j++) {
        const cell = cellRow[j];
        if (!cell || !cell.isLand || cell.latitudeDeg <= 0) continue;
        const a = noReversal.monthlyWindField[0]?.[i]?.[j];
        const b = fullReversal.monthlyWindField[0]?.[i]?.[j];
        if (!a || !b) continue;
        expect(a.uMps).toBeCloseTo(b.uMps, 6);
        expect(a.vMps).toBeCloseTo(b.vMps, 6);
      }
    }
  });
});

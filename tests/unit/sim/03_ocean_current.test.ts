import { describe, expect, it } from 'vitest';
import {
  EARTH_PLANET_PARAMS,
  createGrid,
  type Cell,
  type Grid,
  type GridResolutionDeg,
  type ITCZResult,
  type PlanetParams,
  type WindBeltResult,
} from '@/domain';
import { computeITCZ, DEFAULT_ITCZ_STEP_PARAMS } from '@/sim/01_itcz';
import { computeWindBelt, DEFAULT_WIND_BELT_STEP_PARAMS } from '@/sim/02_wind_belt';
import {
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  __internals,
  classificationFromCorrection,
  computeOceanCurrent,
} from '@/sim/03_ocean_current';

const baseGrid = (resolutionDeg: GridResolutionDeg = 2): Grid => createGrid(resolutionDeg);

const baseITCZ = (planet: PlanetParams = EARTH_PLANET_PARAMS, grid: Grid = baseGrid()): ITCZResult =>
  computeITCZ(planet, grid, DEFAULT_ITCZ_STEP_PARAMS);

const baseWindBelt = (
  planet: PlanetParams = EARTH_PLANET_PARAMS,
  grid: Grid = baseGrid(),
): WindBeltResult =>
  computeWindBelt(planet, grid, baseITCZ(planet, grid), DEFAULT_WIND_BELT_STEP_PARAMS);

/** 全セルを customizer で書き換えた新しい Grid（不変性を保つ）。 */
function mapGridCells(grid: Grid, customizer: (cell: Cell) => Cell): Grid {
  return {
    resolutionDeg: grid.resolutionDeg,
    latitudeCount: grid.latitudeCount,
    longitudeCount: grid.longitudeCount,
    cells: grid.cells.map((row) => row.map((cell) => customizer(cell))),
  };
}

/** 経度 [from, to] (度) の範囲を陸地にした Grid（南北全緯度）。 */
function landStripGrid(fromLonDeg: number, toLonDeg: number): Grid {
  return mapGridCells(baseGrid(2), (cell) =>
    cell.longitudeDeg >= fromLonDeg && cell.longitudeDeg <= toLonDeg
      ? { ...cell, isLand: true, continentId: 'strip' }
      : cell,
  );
}

describe('sim/03_ocean_current: computeOceanCurrent 出力構造', () => {
  it('全 12 ヶ月の流線・海氷・海岸補正・衝突点・ENSO マスクを返す', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    expect(result.monthlyStreamlines.length).toBe(12);
    expect(result.monthlySeaIceMask.length).toBe(12);
    expect(result.monthlyCoastalTemperatureCorrectionCelsius.length).toBe(12);
    expect(result.monthlyCollisionPoints.length).toBe(12);
    expect(result.ensoDipoleCandidateMask.length).toBe(grid.latitudeCount);
  });

  it('各月の海岸補正マップは Grid と同形 (latitudeCount × longitudeCount)', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    for (const monthMap of result.monthlyCoastalTemperatureCorrectionCelsius) {
      expect(monthMap.length).toBe(grid.latitudeCount);
      for (const row of monthMap) {
        expect(row.length).toBe(grid.longitudeCount);
      }
    }
  });

  it('全海洋グリッドでは盆全周の亜熱帯ジャイヤ + 赤道反流の streamlines を返す（[§4.1〜§4.5]）', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    // 全海洋なら 1 盆 → 赤道反流 1 + NH ジャイヤ 4 + SH ジャイヤ 4 = 9 streamlines
    for (const month of result.monthlyStreamlines) {
      expect(month.length).toBeGreaterThan(0);
      // すべての streamline は 2 点以上の path を持つ
      for (const sl of month) {
        expect(sl.path.length).toBeGreaterThanOrEqual(2);
        expect(['warm', 'cold', 'neutral']).toContain(sl.classification);
      }
    }
    // collisionPoints は最小実装では未生成
    for (const month of result.monthlyCollisionPoints) {
      expect(month.length).toBe(0);
    }
  });
});

describe('sim/03_ocean_current: 暖寒流分類（[docs/spec/03_海流.md §4.3 / §4.5]）', () => {
  it('全海洋グリッドでは陸が見つからず、すべて中立（補正値 0）', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const correctionMap = result.monthlyCoastalTemperatureCorrectionCelsius[0]!;
    for (const row of correctionMap) {
      for (const v of row) {
        expect(Math.abs(v)).toBe(0);
      }
    }
  });

  it('経度 0° に陸地ストリップのみがあるとき、東岸（陸の東隣海）が暖流、西岸（陸の西隣海）が寒流（順行 NH）', () => {
    // 経度 0° 付近に細い陸を置く。残りはすべて海洋。
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const correctionMap = result.monthlyCoastalTemperatureCorrectionCelsius[0]!;
    // NH 中緯度（緯度 +30° 付近）でサンプル
    const nhRow = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    // 陸の東側 (lon = +5°) と西側 (lon = -5°) のセル
    const eastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    const westJ = Math.round((-5 + 180) / grid.resolutionDeg - 0.5);
    const eastCorrection = correctionMap[nhRow]?.[eastJ];
    const westCorrection = correctionMap[nhRow]?.[westJ];
    expect(eastCorrection).toBeDefined();
    expect(westCorrection).toBeDefined();
    if (eastCorrection !== undefined && westCorrection !== undefined) {
      // 陸の東側のセル: 西側陸近く (westDeg 小) → 西岸境界流 (暖流) → 補正値 > 0
      expect(eastCorrection).toBeGreaterThan(0);
      // 陸の西側のセル: 東側陸近く (eastDeg 小) → 東岸境界流 (寒流) → 補正値 < 0
      expect(westCorrection).toBeLessThan(0);
    }
  });

  it('逆行惑星では分類が反転（同じ陸ストリップで東側が寒流、西側が暖流）', () => {
    const grid = landStripGrid(-1, 1);
    const retrograde: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, rotationDirection: 'retrograde' },
    };
    const result = computeOceanCurrent(
      retrograde,
      grid,
      baseITCZ(retrograde, grid),
      baseWindBelt(retrograde, grid),
    );
    const correctionMap = result.monthlyCoastalTemperatureCorrectionCelsius[0]!;
    const nhRow = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const eastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    const westJ = Math.round((-5 + 180) / grid.resolutionDeg - 0.5);
    const eastCorrection = correctionMap[nhRow]?.[eastJ] ?? 0;
    const westCorrection = correctionMap[nhRow]?.[westJ] ?? 0;
    expect(eastCorrection).toBeLessThan(0); // 順行で warm だったのが逆行で cold
    expect(westCorrection).toBeGreaterThan(0); // 逆も同様
  });

  it('|lat| > 60° の高緯度ではすべて中立（補正値 0）', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const correctionMap = result.monthlyCoastalTemperatureCorrectionCelsius[0]!;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const row = grid.cells[i]!;
      const lat = row[0]!.latitudeDeg;
      if (Math.abs(lat) <= 60) continue;
      const correctionRow = correctionMap[i]!;
      for (const v of correctionRow) {
        expect(Math.abs(v)).toBe(0);
      }
    }
  });
});

describe('sim/03_ocean_current: 海氷マスク（[docs/spec/03_海流.md §4.7]）', () => {
  it('|lat| > 70° の海洋セルが海氷', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const seaIceMap = result.monthlySeaIceMask[0]!;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const lat = grid.cells[i]![0]!.latitudeDeg;
      const row = seaIceMap[i]!;
      if (Math.abs(lat) > 70) {
        // 海洋セルなら true（grid は全海洋）
        for (const v of row) expect(v).toBe(true);
      } else {
        for (const v of row) expect(v).toBe(false);
      }
    }
  });

  it('seaIceLatitudeThresholdDeg = 80 にすると |lat| > 80 のみ海氷になる', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, seaIceLatitudeThresholdDeg: 80 },
    );
    const seaIceMap = result.monthlySeaIceMask[0]!;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const lat = grid.cells[i]![0]!.latitudeDeg;
      const row = seaIceMap[i]!;
      if (Math.abs(lat) > 80) {
        for (const v of row) expect(v).toBe(true);
      } else if (Math.abs(lat) <= 70) {
        for (const v of row) expect(v).toBe(false);
      }
    }
  });

  it('陸地セルは海氷フラグ false', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      Math.abs(cell.latitudeDeg) > 75 ? { ...cell, isLand: true } : cell,
    );
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const seaIceMap = result.monthlySeaIceMask[0]!;
    for (let i = 0; i < grid.latitudeCount; i++) {
      const row = grid.cells[i]!;
      const seaIceRow = seaIceMap[i]!;
      for (let j = 0; j < grid.longitudeCount; j++) {
        if (row[j]!.isLand) {
          expect(seaIceRow[j]).toBe(false);
        }
      }
    }
  });
});

describe('sim/03_ocean_current: 海岸距離による線形減衰（[docs/spec/03_海流.md §4.8]）', () => {
  it('海岸隣接セルは最大昇温/降温に近く、影響範囲外は 0', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
    );
    const correctionMap = result.monthlyCoastalTemperatureCorrectionCelsius[0]!;
    const nhRow = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    // 陸の東隣 (lon = +3° 付近、距離 ~2-3°) は warm の最大に近い
    const closeJ = Math.round((3 + 180) / grid.resolutionDeg - 0.5);
    const close = correctionMap[nhRow]?.[closeJ] ?? 0;
    // 陸からはるか遠い (lon = +90°、距離 90°、影響範囲 10° を大幅に超える) は 0
    const farJ = Math.round((90 + 180) / grid.resolutionDeg - 0.5);
    const far = correctionMap[nhRow]?.[farJ] ?? 0;
    expect(close).toBeGreaterThan(8);
    expect(close).toBeLessThanOrEqual(15);
    expect(Math.abs(far)).toBe(0);
  });
});

describe('sim/03_ocean_current: classificationFromCorrection ヘルパ', () => {
  it('正値で warm、負値で cold、ゼロで neutral', () => {
    expect(classificationFromCorrection(5)).toBe('warm');
    expect(classificationFromCorrection(-5)).toBe('cold');
    expect(classificationFromCorrection(0)).toBe('neutral');
  });
});

describe('sim/03_ocean_current: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = baseGrid(2);
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const wind = baseWindBelt(EARTH_PLANET_PARAMS, grid);
    const a = computeOceanCurrent(EARTH_PLANET_PARAMS, grid, itcz, wind);
    const b = computeOceanCurrent(EARTH_PLANET_PARAMS, grid, itcz, wind);
    expect(a).toEqual(b);
  });
});

describe('sim/03_ocean_current: ストリームライン（[docs/spec/03_海流.md §4.1〜§4.5]）', () => {
  it('全海洋盆では 1 セットの「赤道反流 + NH ジャイヤ 4 + SH ジャイヤ 4」= 9 streamlines', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    expect(result.monthlyStreamlines[0]?.length).toBe(9);
  });

  it('warm 分類のストリームラインは少なくとも 1 本存在する', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const month = result.monthlyStreamlines[0]!;
    const warmCount = month.filter((s) => s.classification === 'warm').length;
    const coldCount = month.filter((s) => s.classification === 'cold').length;
    expect(warmCount).toBeGreaterThanOrEqual(2); // NH + SH の暖流
    expect(coldCount).toBeGreaterThanOrEqual(2); // NH + SH の寒流
  });

  it('陸地が多すぎて盆幅 < streamlineBasinMinWidthDeg のときは streamlines が空', () => {
    // 全陸地グリッド → 盆検出されない
    const grid = mapGridCells(baseGrid(2), (cell) => ({
      ...cell,
      isLand: true,
      continentId: 'all-land',
    }));
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    expect(result.monthlyStreamlines[0]?.length).toBe(0);
  });

  it('findOceanBasinsAtLatitudeIndex: 全海洋ロウは [-180, 180] の 1 区間を返す', () => {
    const grid = baseGrid(2);
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const basins = __internals.findOceanBasinsAtLatitudeIndex(grid, eqI, 30);
    expect(basins.length).toBe(1);
    expect(basins[0]!.startLonDeg).toBe(-180);
    expect(basins[0]!.endLonDeg).toBe(180);
  });

  it('findOceanBasinsAtLatitudeIndex: 大陸を挟むと盆が分割される', () => {
    // 経度 0–60° に陸地ベルトを置く
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60
        ? { ...cell, isLand: true, continentId: 'belt' }
        : cell,
    );
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const basins = __internals.findOceanBasinsAtLatitudeIndex(grid, eqI, 30);
    // 残った海洋区間は経度 60° 〜 0°（経度循環で分断された 1 区間、wrap-around 含む）
    expect(basins.length).toBeGreaterThanOrEqual(1);
    // 残海洋幅は 300° 程度
    const widths = basins.map((b) => {
      const w = b.endLonDeg >= b.startLonDeg ? b.endLonDeg - b.startLonDeg : 360 - (b.startLonDeg - b.endLonDeg);
      return w;
    });
    expect(Math.max(...widths)).toBeGreaterThan(280);
  });

  it('逆行惑星（rotationSign = -1）では赤道反流の向きが反転', () => {
    const retrograde: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, rotationDirection: 'retrograde' },
    };
    const proGyres = __internals.buildAllStreamlines(baseGrid(2), 1, 30, 7, 32, 10);
    const retroGyres = __internals.buildAllStreamlines(baseGrid(2), -1, 30, 7, 32, 10);
    // 赤道反流は最初の streamline（順行と逆行で path[0].lon が逆転）
    const proFirst = proGyres[0]!;
    const retroFirst = retroGyres[0]!;
    // 順行と逆行で開始経度が異なる（東向き vs 西向き）
    expect(proFirst.path[0]!.longitudeDeg).not.toBe(retroFirst.path[0]!.longitudeDeg);
    // computeOceanCurrent 経由でも反転される
    const proResult = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      baseGrid(2),
      baseITCZ(),
      baseWindBelt(),
      DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
    );
    const retroResult = computeOceanCurrent(
      retrograde,
      baseGrid(2),
      baseITCZ(retrograde),
      baseWindBelt(retrograde),
      DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
    );
    expect(proResult.monthlyStreamlines[0]?.[0]?.path[0]?.longitudeDeg).not.toBe(
      retroResult.monthlyStreamlines[0]?.[0]?.path[0]?.longitudeDeg,
    );
  });
});

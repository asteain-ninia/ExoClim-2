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
import { buildTerrainGrid } from '@/domain/terrain';

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
    // 1 盆あたり 4 衝突点（2 半球 × 2 種類）。全海洋では 1 盆 → 4 衝突点
    for (const month of result.monthlyCollisionPoints) {
      expect(month.length).toBe(4);
    }
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
    // collisionPoints は盆あたり 4 個（赤道流 × 2 半球 + 極流 × 2 半球）
    for (const month of result.monthlyCollisionPoints) {
      expect(month.length).toBeGreaterThan(0);
      const eqCount = month.filter((p) => p.type === 'equatorial_current').length;
      const polarCount = month.filter((p) => p.type === 'polar_current').length;
      expect(eqCount).toBe(polarCount);
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
  it('|lat| > 70° の海洋セルが海氷（拡張なしの月: 例 5 月＝monthIndex 4）', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    // monthIndex 4 (= 5 月) は NH/SH ともに冬季ではないため、寒流延長は効かず基本配置のみ
    const seaIceMap = result.monthlySeaIceMask[4]!;
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

  it('全海洋グリッドでは寒流延長は効かない（沿岸が存在しないため、12 月でも基本配置と同じ）', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    // 12 月（NH 冬、monthIndex 11）の海氷マスクが拡張対象月でない月（5 月、monthIndex 4）と
    // 同じ（全海洋なので延長対象セルが存在しない）
    const decMask = result.monthlySeaIceMask[11]!;
    const mayMask = result.monthlySeaIceMask[4]!;
    for (let i = 0; i < grid.latitudeCount; i++) {
      for (let j = 0; j < grid.longitudeCount; j++) {
        expect(decMask[i]![j]).toBe(mayMask[i]![j]);
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

describe('sim/03_ocean_current: ストリームライン（[docs/spec/03_海流.md §4.1〜§4.6]）', () => {
  it('全海洋盆では「赤道反流 + NH 亜熱帯 4 + NH 極 3 + SH 亜熱帯 4 + SH 極 3」= 15 streamlines（陸地なしのため分断ゼロ）', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    expect(result.monthlyStreamlines[0]?.length).toBe(15);
  });

  it('warm/cold 分類は亜熱帯ジャイヤ 2 + 極ジャイヤ 2 = 各 4 本以上存在する', () => {
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
    // 1 盆: 亜熱帯西岸 warm × 2 半球 + 極ジャイヤ東縁極向き warm × 2 半球 = 4
    expect(warmCount).toBeGreaterThanOrEqual(4);
    // 1 盆: 亜熱帯東岸 cold × 2 半球 + 極ジャイヤ西縁復帰 cold × 2 半球 = 4
    expect(coldCount).toBeGreaterThanOrEqual(4);
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

  it('陸地分断（[現状.md §既知 ユーザフィードバック対応]）: 矩形ループ辺に島嶼があれば streamline が分断される', () => {
    // 経度 +50 〜 +60° に縦長島を置く（亜熱帯ジャイヤの中緯度東向き反転帯を横断）
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 50 && cell.longitudeDeg <= 60 && Math.abs(cell.latitudeDeg) < 50
        ? { ...cell, isLand: true, continentId: 'island' }
        : cell,
    );
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const month = result.monthlyStreamlines[0]!;
    // 全 streamline で陸セルを含まないことを検証（splitPathByLand の効果）
    for (const sl of month) {
      for (const point of sl.path) {
        const isLand = __internals.isLandAtGeoPoint(grid, point.latitudeDeg, point.longitudeDeg);
        expect(isLand).toBe(false);
      }
    }
    // 全海洋テスト（15 streamline）より分断で増えるはず
    expect(month.length).toBeGreaterThan(15);
  });

  it('splitPathByLand: 陸セル区間で path が分断される', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 10 && cell.latitudeDeg === -1
        ? { ...cell, isLand: true, continentId: 'thin' }
        : cell,
    );
    // 赤道直線で pasta する path
    const path = [
      { latitudeDeg: 0, longitudeDeg: -30 },
      { latitudeDeg: 0, longitudeDeg: -20 },
      { latitudeDeg: 0, longitudeDeg: -10 },
    ];
    const splits = __internals.splitPathByLand(path, grid);
    // 全部海上 → 1 path に集約
    expect(splits.length).toBe(1);
    expect(splits[0]?.length).toBe(3);
  });

  it('splitPathByLand: 全点陸セルなら空配列を返す', () => {
    const grid = mapGridCells(baseGrid(2), (cell) => ({
      ...cell,
      isLand: true,
      continentId: 'all-land',
    }));
    const path = [
      { latitudeDeg: 0, longitudeDeg: 0 },
      { latitudeDeg: 0, longitudeDeg: 10 },
    ];
    const splits = __internals.splitPathByLand(path, grid);
    expect(splits.length).toBe(0);
  });

  it('curveSegment: deflectionDeg=0 で直線維持', () => {
    const path = [
      { latitudeDeg: 0, longitudeDeg: -90 },
      { latitudeDeg: 0, longitudeDeg: 0 },
      { latitudeDeg: 0, longitudeDeg: 90 },
    ];
    const curved = __internals.curveSegment(path, 'lat', 0);
    expect(curved.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(curved[i]?.latitudeDeg).toBe(0);
    }
  });

  it('curveSegment: lat 軸で deflection=10 のとき中間点が ~10° 膨らむ', () => {
    const path = [
      { latitudeDeg: 0, longitudeDeg: -90 },
      { latitudeDeg: 0, longitudeDeg: 0 },
      { latitudeDeg: 0, longitudeDeg: 90 },
    ];
    const curved = __internals.curveSegment(path, 'lat', 10);
    // 端点は不動だが sin(π) は浮動小数点で ~1e-15 になる（[§6.1.1]）。toBeCloseTo で許容
    expect(curved[0]?.latitudeDeg).toBeCloseTo(0, 6);
    expect(curved[2]?.latitudeDeg).toBeCloseTo(0, 6);
    // 中央点は最大（sin(π/2) = 1）
    expect(curved[1]?.latitudeDeg).toBeCloseTo(10, 4);
  });

  it('curveSegment: lon 軸で deflection を負にするとイビ向きに膨らむ', () => {
    const path = [
      { latitudeDeg: 30, longitudeDeg: -90 },
      { latitudeDeg: 0, longitudeDeg: -90 },
      { latitudeDeg: -30, longitudeDeg: -90 },
    ];
    const curved = __internals.curveSegment(path, 'lon', -8);
    expect(curved[1]?.longitudeDeg).toBeCloseTo(-98, 4);
  });

  it('curveSegment: path 長 < 3 だとそのまま返す', () => {
    const path = [
      { latitudeDeg: 0, longitudeDeg: 0 },
      { latitudeDeg: 0, longitudeDeg: 10 },
    ];
    const curved = __internals.curveSegment(path, 'lat', 5);
    expect(curved).toEqual(path);
  });

  it('streamlineCurvatureDeg > 0 で gyre 端点は変わらず中間点が膨らむ', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, streamlineCurvatureDeg: 6 },
    );
    const month = result.monthlyStreamlines[0]!;
    // warm 分類（西岸境界流）から代表 1 本を取り、中間点が両端点間の直線上にないことを確認
    const warm = month.find((s) => s.classification === 'warm');
    expect(warm).toBeDefined();
    if (warm) {
      const path = warm.path;
      expect(path.length).toBeGreaterThan(2);
      const start = path[0]!;
      const end = path[path.length - 1]!;
      const mid = path[Math.floor(path.length / 2)]!;
      // 西岸境界流は lon = const なので中間点 lon が端点 lon から逸れていれば曲線化が効いている
      const startLon = start.longitudeDeg;
      const endLon = end.longitudeDeg;
      const midLon = mid.longitudeDeg;
      // 端点同士の経度差が小さい（縦線）が中間 lon が端点と異なる
      expect(Math.abs(startLon - endLon)).toBeLessThan(0.1);
      expect(Math.abs(midLon - startLon)).toBeGreaterThan(2);
    }
  });

  it('複数緯度 basin: 中緯度 lat ±32° に島を置くと中緯度反転セグメントが追加される（[§4.4 / P4-22]）', () => {
    // 赤道行は連続海洋（1 basin）。lat +32° と lat -32° の中緯度行に島嶼を 2 つ配置 →
    // 中緯度行で 3 basin 検出される（島 2 つで分断）。各 basin で独立な中緯度反転セグメントが追加。
    const grid = mapGridCells(baseGrid(2), (cell) => {
      const isMidLat = Math.abs(Math.abs(cell.latitudeDeg) - 32) < 4;
      const inIsland1 = cell.longitudeDeg >= -60 && cell.longitudeDeg <= -45;
      const inIsland2 = cell.longitudeDeg >= 45 && cell.longitudeDeg <= 60;
      return isMidLat && (inIsland1 || inIsland2)
        ? { ...cell, isLand: true, continentId: 'midisland' }
        : cell;
    });
    const baseline = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      baseGrid(2),
      baseITCZ(EARTH_PLANET_PARAMS, baseGrid(2)),
      baseWindBelt(EARTH_PLANET_PARAMS, baseGrid(2)),
    );
    const withMidLatIslands = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    // 全海洋: 15 streamline（既知）。中緯度に島嶼がある場合は補完セグメントが追加されるため増える。
    expect(withMidLatIslands.monthlyStreamlines[0]?.length).toBeGreaterThan(
      baseline.monthlyStreamlines[0]?.length ?? 0,
    );
  });

  it('findOceanBasinsAtLatitudeDeg: lat 0° で全海洋なら 1 basin', () => {
    const basins = __internals.findOceanBasinsAtLatitudeDeg(baseGrid(2), 0, 30);
    expect(basins.length).toBe(1);
  });

  it('findOceanBasinsAtLatitudeDeg: 中緯度に島嶼を置くと複数 basin 検出', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      Math.abs(cell.latitudeDeg - 32) < 4 && cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60
        ? { ...cell, isLand: true, continentId: 'island' }
        : cell,
    );
    const basins = __internals.findOceanBasinsAtLatitudeDeg(grid, 32, 30);
    expect(basins.length).toBeGreaterThanOrEqual(1);
  });

  it('generateMidLatitudeReversalSegment: lat midLat 一定の path を生成', () => {
    const basin = { startLonDeg: -180, endLonDeg: 180 };
    const segs = __internals.generateMidLatitudeReversalSegment(
      basin,
      1,
      1,
      32,
      10,
      null,
      0,
    );
    expect(segs.length).toBe(1);
    for (const point of segs[0]?.path ?? []) {
      expect(point.latitudeDeg).toBe(32);
    }
  });

  it('generateWesternBoundarySegment: warm 分類で lon 一定の path を生成', () => {
    const basin = { startLonDeg: -90, endLonDeg: 90 };
    const segs = __internals.generateWesternBoundarySegment(basin, 1, 1, 7, 32, 10, null, 0);
    expect(segs.length).toBe(1);
    const seg = segs[0]!;
    expect(seg.classification).toBe('warm');
    for (const point of seg.path) {
      expect(point.longitudeDeg).toBe(-90); // 順行 → 西縁 = startLon
    }
    // 端点 lat: eqLat → midLat
    expect(seg.path[0]?.latitudeDeg).toBeCloseTo(7, 4);
    expect(seg.path[seg.path.length - 1]?.latitudeDeg).toBeCloseTo(32, 4);
  });

  it('generateEasternBoundarySegment: cold 分類で lon 一定の path を生成', () => {
    const basin = { startLonDeg: -90, endLonDeg: 90 };
    const segs = __internals.generateEasternBoundarySegment(basin, 1, 1, 7, 32, 10, null, 0);
    expect(segs.length).toBe(1);
    const seg = segs[0]!;
    expect(seg.classification).toBe('cold');
    for (const point of seg.path) {
      expect(point.longitudeDeg).toBe(90); // 順行 → 東縁 = endLon
    }
    // 端点 lat: midLat → eqLat
    expect(seg.path[0]?.latitudeDeg).toBeCloseTo(32, 4);
    expect(seg.path[seg.path.length - 1]?.latitudeDeg).toBeCloseTo(7, 4);
  });

  it('generatePolarPolewardSegment: warm 分類で midLat → polarLat', () => {
    const basin = { startLonDeg: -90, endLonDeg: 90 };
    const segs = __internals.generatePolarPolewardSegment(basin, 1, 1, 32, 80, 10, null, 0);
    expect(segs[0]?.classification).toBe('warm');
    expect(segs[0]?.path[0]?.latitudeDeg).toBeCloseTo(32, 4);
    expect(segs[0]?.path[segs[0]!.path.length - 1]?.latitudeDeg).toBeCloseTo(80, 4);
  });

  it('generatePolarEquatorwardSegment: cold 分類で polarLat → midLat', () => {
    const basin = { startLonDeg: -90, endLonDeg: 90 };
    const segs = __internals.generatePolarEquatorwardSegment(basin, 1, 1, 32, 80, 10, null, 0);
    expect(segs[0]?.classification).toBe('cold');
    expect(segs[0]?.path[0]?.latitudeDeg).toBeCloseTo(80, 4);
    expect(segs[0]?.path[segs[0]!.path.length - 1]?.latitudeDeg).toBeCloseTo(32, 4);
  });

  it('複数中緯度 basin で縦線セグメント (西岸/東岸境界流) も追加される (P4-23)', () => {
    // P4-22 と同じ grid（中緯度に島嶼 2 つ）→ 縦線も増えるため P4-22 単独より streamline 数が増える
    const grid = mapGridCells(baseGrid(2), (cell) => {
      const isMidLat = Math.abs(Math.abs(cell.latitudeDeg) - 32) < 4;
      const inIsland1 = cell.longitudeDeg >= -60 && cell.longitudeDeg <= -45;
      const inIsland2 = cell.longitudeDeg >= 45 && cell.longitudeDeg <= 60;
      return isMidLat && (inIsland1 || inIsland2)
        ? { ...cell, isLand: true, continentId: 'midisland' }
        : cell;
    });
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const month = result.monthlyStreamlines[0]!;
    // warm/cold streamline が標準 4 本 (NH 西岸 + 極側 + SH 西岸 + 極側) より多くなる
    const warmCount = month.filter((s) => s.classification === 'warm').length;
    const coldCount = month.filter((s) => s.classification === 'cold').length;
    expect(warmCount).toBeGreaterThan(4);
    expect(coldCount).toBeGreaterThan(4);
  });

  it('generatePolarReversalSegment: 逆行で東西成分が反転', () => {
    const basin = { startLonDeg: -90, endLonDeg: 90 };
    const proSeg = __internals.generatePolarReversalSegment(basin, 1, 1, 80, 5, null, 0);
    const retroSeg = __internals.generatePolarReversalSegment(basin, 1, -1, 80, 5, null, 0);
    expect(proSeg[0]?.path[0]?.longitudeDeg).not.toBe(
      retroSeg[0]?.path[0]?.longitudeDeg,
    );
  });

  it('computeDistanceToLandField: 陸セルは 0、海セルは正の値（[P4-24]）', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1 && Math.abs(cell.latitudeDeg) < 30
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const dist = __internals.computeDistanceToLandField(grid);
    // 陸セル (lat 0°, lon 0° 付近)
    const eqRow = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const lon0 = Math.round((0 + 180) / grid.resolutionDeg - 0.5);
    expect(dist[eqRow]?.[lon0]).toBe(0);
    // 海セル (lat 0°, lon 90°、陸から遠い)
    const farLon = Math.round((90 + 180) / grid.resolutionDeg - 0.5);
    expect(dist[eqRow]?.[farLon]).toBeGreaterThan(0);
    // 陸の隣接海セル (lat 0°, lon 4°) は距離が小さい
    const closeLon = Math.round((4 + 180) / grid.resolutionDeg - 0.5);
    expect(dist[eqRow]?.[closeLon]).toBeGreaterThan(0);
    expect(dist[eqRow]?.[closeLon]).toBeLessThan(dist[eqRow]?.[farLon] ?? Infinity);
  });

  it('computeDistanceToLandField: 全海洋では全セル Infinity', () => {
    const grid = baseGrid(2);
    const dist = __internals.computeDistanceToLandField(grid);
    for (const row of dist) {
      for (const v of row) {
        expect(v).toBe(Infinity);
      }
    }
  });

  it('smoothField: 鋭い境界が平滑化される', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const dist = __internals.computeDistanceToLandField(grid);
    const smoothed = __internals.smoothField(dist, grid, 3);
    // 平滑化後は陸セル隣接でも 0 でない値になる
    const eqRow = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const lon0 = Math.round((0 + 180) / grid.resolutionDeg - 0.5);
    expect(smoothed[eqRow]?.[lon0]).toBeGreaterThan(0);
  });

  it('computeFieldGradient: 陸セル方向に勾配ベクトルが向く', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const dist = __internals.computeDistanceToLandField(grid);
    const smoothed = __internals.smoothField(dist, grid, 3);
    const { gradLon } = __internals.computeFieldGradient(smoothed, grid);
    // 陸の東隣の海セル (lon = +5°) では gradLon < 0 (西に陸あり → 西で値が小さい → 中央差分は負)
    const eqRow = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const lonEast = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    expect(gradLon[eqRow]?.[lonEast]).toBeGreaterThan(0); // 東向きが「陸から離れる」方向
  });

  it('buildCollisionField: distance + smoothed + grad を一括返却', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const cf = __internals.buildCollisionField(grid, 2);
    expect(cf.distance.length).toBe(grid.latitudeCount);
    expect(cf.smoothed.length).toBe(grid.latitudeCount);
    expect(cf.gradLon.length).toBe(grid.latitudeCount);
    expect(cf.gradLat.length).toBe(grid.latitudeCount);
    expect(cf.distance[0]?.length).toBe(grid.longitudeCount);
  });

  it('deflectPathByCollisionField: 全海洋では path が変化しない（[P4-25]）', () => {
    const grid = baseGrid(2);
    const field = __internals.buildCollisionField(grid, 2);
    const path = [
      { latitudeDeg: 0, longitudeDeg: -90 },
      { latitudeDeg: 0, longitudeDeg: 0 },
      { latitudeDeg: 0, longitudeDeg: 90 },
    ];
    const deflected = __internals.deflectPathByCollisionField(path, field, grid, 5, 3);
    for (let k = 0; k < path.length; k++) {
      expect(deflected[k]?.latitudeDeg).toBe(path[k]?.latitudeDeg);
      expect(deflected[k]?.longitudeDeg).toBe(path[k]?.longitudeDeg);
    }
  });

  it('deflectPathByCollisionField: 陸地隣接の海セルが陸地から離れる方向に変位する', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const field = __internals.buildCollisionField(grid, 3);
    // 陸の東隣にあるサンプル点（lon = +4°）
    const path = [{ latitudeDeg: 0, longitudeDeg: 4 }];
    const deflected = __internals.deflectPathByCollisionField(path, field, grid, 8, 3);
    // 東向き（陸から離れる）に変位 → newLon > 4
    expect(deflected[0]?.longitudeDeg).toBeGreaterThan(4);
  });

  it('deflectPathByCollisionField: rangeCells=0 で no-op', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const field = __internals.buildCollisionField(grid, 3);
    const path = [{ latitudeDeg: 0, longitudeDeg: 4 }];
    const deflected = __internals.deflectPathByCollisionField(path, field, grid, 0, 3);
    expect(deflected[0]?.longitudeDeg).toBe(4);
  });

  it('streamlineDeflectionRangeCells > 0 で陸地隣接 streamline サンプル点が変位する', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -1 && cell.longitudeDeg <= 1 && Math.abs(cell.latitudeDeg) < 50
        ? { ...cell, isLand: true, continentId: 'strip' }
        : cell,
    );
    const noDef = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      {
        ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
        streamlineDeflectionRangeCells: 0,
        streamlineMaxDeflectionDeg: 0,
      },
    );
    const withDef = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      {
        ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
        streamlineDeflectionRangeCells: 8,
        streamlineMaxDeflectionDeg: 5,
      },
    );
    // 同じ classification のセグメントを取り出して、少なくとも 1 サンプル点が異なる
    const noDefMonth = noDef.monthlyStreamlines[0]!;
    const withDefMonth = withDef.monthlyStreamlines[0]!;
    expect(withDefMonth.length).toBeGreaterThan(0);
    // 何らかの差分があるはず
    let foundDiff = false;
    for (let k = 0; k < Math.min(noDefMonth.length, withDefMonth.length); k++) {
      const noDefPath = noDefMonth[k]?.path;
      const withDefPath = withDefMonth[k]?.path;
      if (!noDefPath || !withDefPath || noDefPath.length !== withDefPath.length) continue;
      for (let p = 0; p < noDefPath.length; p++) {
        if (
          Math.abs((noDefPath[p]?.latitudeDeg ?? 0) - (withDefPath[p]?.latitudeDeg ?? 0)) > 0.001 ||
          Math.abs((noDefPath[p]?.longitudeDeg ?? 0) - (withDefPath[p]?.longitudeDeg ?? 0)) > 0.001
        ) {
          foundDiff = true;
          break;
        }
      }
      if (foundDiff) break;
    }
    expect(foundDiff).toBe(true);
  });

  it('agent-tracing: 有効化すると赤道反流の path が dynamic 生成される（[P4-26]）', () => {
    const grid = baseGrid(2);
    const noAgent = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, agentTracingEnabled: false },
    );
    const withAgent = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, agentTracingEnabled: true, agentMaxSteps: 100 },
    );
    // 両方とも何らかの赤道反流 streamline を返す
    expect(noAgent.monthlyStreamlines[0]?.length).toBeGreaterThan(0);
    expect(withAgent.monthlyStreamlines[0]?.length).toBeGreaterThan(0);
    // agent-traced 版は path が dynamic 生成（最初の neutral streamline で path が異なる）
    const noAgentECC = noAgent.monthlyStreamlines[0]?.find((s) => s.classification === 'neutral');
    const withAgentECC = withAgent.monthlyStreamlines[0]?.find((s) => s.classification === 'neutral');
    expect(noAgentECC?.path.length).not.toBe(withAgentECC?.path.length);
  });

  it('traceEquatorialCountercurrentAgent: 順行で東向きに進む', () => {
    const grid = baseGrid(2);
    const field = __internals.buildCollisionField(grid, 2);
    const path = __internals.traceEquatorialCountercurrentAgent(
      { startLonDeg: -180, endLonDeg: 180 },
      1,
      field,
      grid,
      { baseSpeedDegPerStep: 0.6, collisionRepulsionStrength: 0.5, maxSteps: 50 },
    );
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]?.longitudeDeg).toBeCloseTo(-180, 4);
    // 東向き → path 後半の lon は path 前半より大きい
    const firstLon = path[0]?.longitudeDeg ?? 0;
    const lastLon = path[path.length - 1]?.longitudeDeg ?? 0;
    // 経度ラップを考慮して符号付き差を計算（東向きなら正、極端な大きさは除外）
    const dx = ((lastLon - firstLon + 540) % 360) - 180;
    expect(dx).toBeGreaterThan(0);
  });

  it('traceEquatorialCountercurrentAgent: maxSteps=1 で path 長 ≤ 2', () => {
    const grid = baseGrid(2);
    const field = __internals.buildCollisionField(grid, 2);
    const path = __internals.traceEquatorialCountercurrentAgent(
      { startLonDeg: 0, endLonDeg: 180 },
      1,
      field,
      grid,
      { baseSpeedDegPerStep: 0.6, collisionRepulsionStrength: 0.5, maxSteps: 1 },
    );
    expect(path.length).toBeLessThanOrEqual(2);
  });

  it('stepOceanAgent: 陸セル侵入で active=false', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 9 && cell.longitudeDeg <= 11 && Math.abs(cell.latitudeDeg) < 2
        ? { ...cell, isLand: true, continentId: 'block' }
        : cell,
    );
    const field = __internals.buildCollisionField(grid, 2);
    const agent = {
      latitudeDeg: 0,
      longitudeDeg: 10, // 陸セル内
      vLatPerStep: 0,
      vLonPerStep: 0.6,
      active: true,
      pathHistory: [{ latitudeDeg: 0, longitudeDeg: 10 }],
      positionRingBuffer: [{ lat: 0, lon: 10 }],
    };
    __internals.stepOceanAgent(agent, field, grid, {
      baseSpeedDegPerStep: 0.6,
      collisionRepulsionStrength: 0.5,
      maxSteps: 100,
    });
    expect(agent.active).toBe(false);
  });

  it('isLandAtGeoPoint: 経度循環でラップ（+185° → -175°）', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= -177 && cell.longitudeDeg <= -173
        ? { ...cell, isLand: true }
        : cell,
    );
    expect(__internals.isLandAtGeoPoint(grid, 0, 185)).toBe(true);
    expect(__internals.isLandAtGeoPoint(grid, 0, 0)).toBe(false);
  });

  it('逆行惑星（rotationSign = -1）では赤道反流の向きが反転', () => {
    const retrograde: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, rotationDirection: 'retrograde' },
    };
    const proGyres = __internals.buildAllStreamlines(baseGrid(2), 1, 30, 7, 32, 80, 10, 0, 0, 0, false);
    const retroGyres = __internals.buildAllStreamlines(baseGrid(2), -1, 30, 7, 32, 80, 10, 0, 0, 0, false);
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

describe('sim/03_ocean_current: ENSO ダイポール候補マスク（[docs/spec/03_海流.md §4.10]）', () => {
  it('全海洋グリッドでは「東西を陸地に挟まれない」ため候補なし（全 false）', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    for (const row of result.ensoDipoleCandidateMask) {
      for (const v of row) {
        expect(v).toBe(false);
      }
    }
  });

  it('陸ストリップを置くと赤道付近（既定 |lat|≤10°）の海セルに候補マスクが立つ', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const mask = result.ensoDipoleCandidateMask;
    const eqRow = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    // 赤道付近の海セル（lon=+90°、陸から遠い）に true
    const seaJ = Math.round((90 + 180) / grid.resolutionDeg - 0.5);
    expect(mask[eqRow]?.[seaJ]).toBe(true);
    // 同じ赤道行の陸セル (lon=0° 付近) は false
    const landJ = Math.round((0 + 180) / grid.resolutionDeg - 0.5);
    expect(mask[eqRow]?.[landJ]).toBe(false);
  });

  it('|lat| > ensoLatitudeRangeDeg は候補対象外', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const mask = result.ensoDipoleCandidateMask;
    // lat +30° は範囲外（既定 10°）
    const highLatRow = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const seaJ = Math.round((90 + 180) / grid.resolutionDeg - 0.5);
    expect(mask[highLatRow]?.[seaJ]).toBe(false);
  });

  it('ensoEnabled=false で全 false に縮退', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, ensoEnabled: false },
    );
    for (const row of result.ensoDipoleCandidateMask) {
      for (const v of row) {
        expect(v).toBe(false);
      }
    }
  });

  it('ensoLatitudeRangeDeg を 5 に縮めると |lat|>5 は対象外', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, ensoLatitudeRangeDeg: 5 },
    );
    const mask = result.ensoDipoleCandidateMask;
    const lat8Row = Math.round((8 + 90) / grid.resolutionDeg - 0.5);
    const seaJ = Math.round((90 + 180) / grid.resolutionDeg - 0.5);
    expect(mask[lat8Row]?.[seaJ]).toBe(false);
  });
});

describe('sim/03_ocean_current: 衝突点（[docs/spec/03_海流.md §4.5 / §4.6]）', () => {
  it('全海洋盆では「赤道流 × 2 半球 + 極流 × 2 半球」= 4 衝突点を返す', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const month = result.monthlyCollisionPoints[0]!;
    expect(month.length).toBe(4);
  });

  it('順行 NH の衝突点は basin の西縁（経度 -180°）にある', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const month = result.monthlyCollisionPoints[0]!;
    // 全海洋なら basin = [-180, 180]、西縁 = -180
    for (const p of month) {
      expect(p.position.longitudeDeg).toBeCloseTo(-180, 6);
    }
  });

  it('赤道流衝突点は lat ±eqLat、極流衝突点は lat ±polarLat に配置される', () => {
    const grid = baseGrid(2);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const month = result.monthlyCollisionPoints[0]!;
    const eqPoints = month.filter((p) => p.type === 'equatorial_current');
    const polarPoints = month.filter((p) => p.type === 'polar_current');
    expect(eqPoints.length).toBe(2);
    expect(polarPoints.length).toBe(2);
    // 既定 eqLat = 7°、polarLat = 80°
    for (const p of eqPoints) {
      expect(Math.abs(p.position.latitudeDeg)).toBeCloseTo(7, 6);
    }
    for (const p of polarPoints) {
      expect(Math.abs(p.position.latitudeDeg)).toBeCloseTo(80, 6);
    }
    // 半球が NH と SH の両方に出ていること
    expect(eqPoints.some((p) => p.position.latitudeDeg > 0)).toBe(true);
    expect(eqPoints.some((p) => p.position.latitudeDeg < 0)).toBe(true);
  });

  it('逆行惑星では衝突点が basin の東縁（経度 +180°）に反転する（[§4.9]）', () => {
    const grid = baseGrid(2);
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
    const month = result.monthlyCollisionPoints[0]!;
    for (const p of month) {
      expect(p.position.longitudeDeg).toBeCloseTo(180, 6);
    }
  });

  it('陸地が多すぎて basin が検出されないと衝突点が空', () => {
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
    expect(result.monthlyCollisionPoints[0]?.length).toBe(0);
  });

  it('衝突点マーカーは常に海セル上に配置される（[ユーザ指摘 2026-05-03]、P4-47）', () => {
    // equator 行で basin が見つかった経度に、±eqLat / ±polarLat 行では陸が
    // 存在することがある。マーカー位置を当該緯度で海セルにスナップする補正が
    // 効いていることを確認する。
    // 仮想大陸（idealized_continent）= 経度中央寄せの単一連続陸塊で再現性高い。
    const grid = buildTerrainGrid(
      { kind: 'preset', presetId: 'idealized_continent' },
      1,
    );
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    for (let m = 0; m < 12; m++) {
      const month = result.monthlyCollisionPoints[m]!;
      for (const p of month) {
        const r = Math.round((p.position.latitudeDeg + 90) / grid.resolutionDeg - 0.5);
        const c = Math.round((p.position.longitudeDeg + 180) / grid.resolutionDeg - 0.5);
        const rClamp = Math.max(0, Math.min(grid.latitudeCount - 1, r));
        const cClamp = ((c % grid.longitudeCount) + grid.longitudeCount) % grid.longitudeCount;
        const cell = grid.cells[rClamp]?.[cClamp];
        expect(cell, `marker @ lat=${p.position.latitudeDeg}, lon=${p.position.longitudeDeg}`).toBeDefined();
        expect(
          cell?.isLand,
          `Collision marker (${p.type}) at (lat=${p.position.latitudeDeg.toFixed(2)}, lon=${p.position.longitudeDeg.toFixed(2)}) is on a LAND cell`,
        ).toBe(false);
      }
    }
  });
});

describe("sim/03_ocean_current: 寒流沿い東岸海氷延長（[docs/spec/03_海流.md §4.7]、Worldbuilder's Log #28）", () => {
  /**
   * 経度 [-1, 1] に細い陸地ストリップを置き、その「東岸」（順行で westDeg 小さい側＝lon > 1
   * の海セル）に NH 冬季のみ海氷が延長されることを確認する。
   *
   * 注意: 順行 NH では cold 復帰流が basin 西縁＝大陸の東岸を南下するため、地球の地理で言えば
   * 「大陸東岸の海セル（西側に大陸近接）」が延長対象。これは西岸境界流（暖流）と同じ経度域だが、
   * 緯度範囲 [45°, 70°] は亜熱帯ジャイヤ（per-cell |lat|>60° で neutral 化）の影響圏の外側。
   */
  it('NH 冬季（12 月）には大陸東岸の高緯度海セル（lat 45〜70°）に海氷が延長される', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    // 12 月（monthIndex 11、NH 冬）
    const decMask = result.monthlySeaIceMask[11]!;
    // lat +50° の row、大陸の東岸（lon = +5°、西側に陸近接）
    const nhRow = Math.round((50 + 90) / grid.resolutionDeg - 0.5);
    const eastCoastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    expect(decMask[nhRow]?.[eastCoastJ]).toBe(true);
    // 同じ lat の遠く（lon = +90°、西側に陸が遠い）は延長対象外
    const farJ = Math.round((90 + 180) / grid.resolutionDeg - 0.5);
    expect(decMask[nhRow]?.[farJ]).toBe(false);
  });

  it('5 月（NH/SH ともに冬季ではない）には延長されず、基本配置のみ', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const mayMask = result.monthlySeaIceMask[4]!;
    const nhRow = Math.round((50 + 90) / grid.resolutionDeg - 0.5);
    const eastCoastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    // 拡張対象月でないため、lat 50° は基本配置の対象外（70°以下）
    expect(mayMask[nhRow]?.[eastCoastJ]).toBe(false);
  });

  it('SH 冬季（7 月）には南半球の大陸東岸（lat -45〜-70°）に海氷が延長される', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const julMask = result.monthlySeaIceMask[6]!;
    const shRow = Math.round((-50 + 90) / grid.resolutionDeg - 0.5);
    const eastCoastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    expect(julMask[shRow]?.[eastCoastJ]).toBe(true);
    // 同じ月で NH 側の lat +50° は延長されない（NH は夏）
    const nhRow = Math.round((50 + 90) / grid.resolutionDeg - 0.5);
    expect(julMask[nhRow]?.[eastCoastJ]).toBe(false);
  });

  it('seaIceColdCurrentExtensionEnabled = false で延長が無効化される', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
      { ...DEFAULT_OCEAN_CURRENT_STEP_PARAMS, seaIceColdCurrentExtensionEnabled: false },
    );
    const decMask = result.monthlySeaIceMask[11]!;
    const nhRow = Math.round((50 + 90) / grid.resolutionDeg - 0.5);
    const eastCoastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    expect(decMask[nhRow]?.[eastCoastJ]).toBe(false);
  });

  it('逆行惑星では cold 復帰流側が反転し、大陸西岸（東側に陸近接）に延長される（[§4.9]）', () => {
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
    const decMask = result.monthlySeaIceMask[11]!;
    const nhRow = Math.round((50 + 90) / grid.resolutionDeg - 0.5);
    // 順行で延長されていた東岸（lon = +5°、西側に陸近接）は逆行では延長されない
    const eastCoastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    expect(decMask[nhRow]?.[eastCoastJ]).toBe(false);
    // 逆行では西岸（lon = -5°、東側に陸近接）に延長される
    const westCoastJ = Math.round((-5 + 180) / grid.resolutionDeg - 0.5);
    expect(decMask[nhRow]?.[westCoastJ]).toBe(true);
  });

  it('seaIceColdCurrentExtensionMinLatDeg より赤道側は延長対象外', () => {
    const grid = landStripGrid(-1, 1);
    const result = computeOceanCurrent(
      EARTH_PLANET_PARAMS,
      grid,
      baseITCZ(EARTH_PLANET_PARAMS, grid),
      baseWindBelt(EARTH_PLANET_PARAMS, grid),
    );
    const decMask = result.monthlySeaIceMask[11]!;
    // lat +30° は minLat 45° 未満のため延長対象外
    const lowLatRow = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const eastCoastJ = Math.round((5 + 180) / grid.resolutionDeg - 0.5);
    expect(decMask[lowLatRow]?.[eastCoastJ]).toBe(false);
  });
});

describe('sim/03_ocean_current: 極ジャイヤ（[docs/spec/03_海流.md §4.5 / §4.6]）', () => {
  it('generatePolarGyre は warm（東縁極向き）/ neutral（極帯反転）/ cold（西縁復帰）の 3 streamlines を返す', () => {
    const basin = { startLonDeg: -180, endLonDeg: 180 };
    const polar = __internals.generatePolarGyre(basin, 1, 1, 32, 80, 10);
    expect(polar.length).toBe(3);
    expect(polar[0]!.classification).toBe('warm');
    expect(polar[1]!.classification).toBe('neutral');
    expect(polar[2]!.classification).toBe('cold');
  });

  it('NH 極ジャイヤは polarLat（既定 +80°）まで達する', () => {
    const basin = { startLonDeg: -180, endLonDeg: 180 };
    const polar = __internals.generatePolarGyre(basin, 1, 1, 32, 80, 10);
    // 東縁極向き（warm）の終点 lat は +polarLat
    const easternPoleward = polar[0]!;
    expect(easternPoleward.path[easternPoleward.path.length - 1]!.latitudeDeg).toBeCloseTo(80, 6);
    // 極帯反転（neutral）は lat = +polarLat 一定
    const polarReversal = polar[1]!;
    for (const point of polarReversal.path) {
      expect(point.latitudeDeg).toBeCloseTo(80, 6);
    }
    // 西縁復帰（cold）の終点 lat は midLat
    const westernEquatorward = polar[2]!;
    expect(westernEquatorward.path[westernEquatorward.path.length - 1]!.latitudeDeg).toBeCloseTo(
      32,
      6,
    );
  });

  it('SH 極ジャイヤは polarLat = -80° まで達する（半球反転）', () => {
    const basin = { startLonDeg: -180, endLonDeg: 180 };
    const polar = __internals.generatePolarGyre(basin, -1, 1, 32, 80, 10);
    const easternPoleward = polar[0]!;
    expect(easternPoleward.path[easternPoleward.path.length - 1]!.latitudeDeg).toBeCloseTo(-80, 6);
    const westernEquatorward = polar[2]!;
    expect(westernEquatorward.path[westernEquatorward.path.length - 1]!.latitudeDeg).toBeCloseTo(
      -32,
      6,
    );
  });

  it('順行の NH 極ジャイヤでは極帯反転は東 → 西へ走る（polar easterlies、§4.6）', () => {
    // 経度 0–60° に陸地ベルトを置いて basin を限定する
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60
        ? { ...cell, isLand: true, continentId: 'belt' }
        : cell,
    );
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const basins = __internals.findOceanBasinsAtLatitudeIndex(grid, eqI, 30);
    expect(basins.length).toBe(1);
    const basin = basins[0]!;
    // 順行の polar reversal: easternBoundaryLon (= basin.endLonDeg) から
    // westernBoundaryLon (= basin.startLonDeg) へ
    const polar = __internals.generatePolarGyre(basin, 1, 1, 32, 80, 10);
    const reversal = polar[1]!;
    expect(reversal.path[0]!.longitudeDeg).toBeCloseTo(basin.endLonDeg, 6);
    expect(reversal.path[reversal.path.length - 1]!.longitudeDeg).toBeCloseTo(
      basin.startLonDeg,
      6,
    );
  });

  it('逆行惑星では極帯反転の経度方向が反転（東西成分反転、§4.9）', () => {
    const grid = mapGridCells(baseGrid(2), (cell) =>
      cell.longitudeDeg >= 0 && cell.longitudeDeg <= 60
        ? { ...cell, isLand: true, continentId: 'belt' }
        : cell,
    );
    const eqI = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const basin = __internals.findOceanBasinsAtLatitudeIndex(grid, eqI, 30)[0]!;
    const proPolar = __internals.generatePolarGyre(basin, 1, 1, 32, 80, 10);
    const retroPolar = __internals.generatePolarGyre(basin, 1, -1, 32, 80, 10);
    // 開始経度が逆転（順行 endLon → 逆行 startLon）
    expect(proPolar[1]!.path[0]!.longitudeDeg).not.toBe(retroPolar[1]!.path[0]!.longitudeDeg);
  });
});

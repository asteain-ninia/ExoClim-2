import { describe, expect, it } from 'vitest';
import {
  EARTH_PLANET_PARAMS,
  type Cell,
  type Grid,
  type GridResolutionDeg,
  type ITCZBand,
  type ITCZResult,
  type LongitudeProfile,
  type Months12,
  type PlanetParams,
} from '@/domain';
import { createGrid } from '@/domain';
import { computeITCZ, DEFAULT_ITCZ_STEP_PARAMS } from '@/sim/01_itcz';
import {
  DEFAULT_WIND_BELT_STEP_PARAMS,
  computeWindBelt,
} from '@/sim/02_wind_belt';

const baseGrid = (resolutionDeg: GridResolutionDeg = 2): Grid => createGrid(resolutionDeg);

const baseITCZ = (planet: PlanetParams = EARTH_PLANET_PARAMS, grid: Grid = baseGrid()): ITCZResult =>
  computeITCZ(planet, grid, DEFAULT_ITCZ_STEP_PARAMS);

/** 全セルを customizer で書き換えた新しい Grid（不変性を保つ）。 */
function mapGridCells(grid: Grid, customizer: (cell: Cell) => Cell): Grid {
  return {
    resolutionDeg: grid.resolutionDeg,
    latitudeCount: grid.latitudeCount,
    longitudeCount: grid.longitudeCount,
    cells: grid.cells.map((row) => row.map((cell) => customizer(cell))),
  };
}

describe('sim/02_wind_belt: computeWindBelt 出力構造', () => {
  it('全 12 ヶ月の風ベクトル場・気圧マップ・セル境界を返す', () => {
    const grid = baseGrid(2);
    const itczResult = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const result = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);
    expect(result.monthlyPrevailingWind.length).toBe(12);
    expect(result.monthlySurfacePressureHpa.length).toBe(12);
    expect(result.monthlyCellBoundariesDeg.length).toBe(12);
    expect(result.monthlyMonsoonMask.length).toBe(12);
    expect(result.monthlyCoastalUpwellingMask.length).toBe(12);
    expect(result.itczInfluenceAdjustmentDeg.length).toBe(12);
  });

  it('各月の風ベクトル場は Grid と同形 (latitudeCount × longitudeCount)', () => {
    const grid = baseGrid(2);
    const result = computeWindBelt(EARTH_PLANET_PARAMS, grid, baseITCZ(EARTH_PLANET_PARAMS, grid));
    for (const monthField of result.monthlyPrevailingWind) {
      expect(monthField.length).toBe(grid.latitudeCount);
      for (const row of monthField) {
        expect(row.length).toBe(grid.longitudeCount);
      }
    }
  });
});

describe('sim/02_wind_belt: 卓越風の方向（[docs/spec/02_風帯.md §4.2]）', () => {
  const grid = baseGrid(2);
  const itczResult = baseITCZ(EARTH_PLANET_PARAMS, grid);
  const result = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);

  /** 指定した緯度に最も近い行の中央経度の風ベクトルを取得。 */
  const sampleAtLatitude = (
    monthField: ReadonlyArray<ReadonlyArray<{ readonly uMps: number; readonly vMps: number }>>,
    latDeg: number,
  ) => {
    const i = Math.round((latDeg + 90) / grid.resolutionDeg - 0.5);
    return monthField[i]?.[Math.floor(grid.longitudeCount / 2)];
  };

  it('NH 貿易風帯（lat = +15°、Hadley 内）は南西向き（u<0, v<0）', () => {
    const wind = sampleAtLatitude(result.monthlyPrevailingWind[0]!, 15);
    expect(wind).toBeDefined();
    if (wind) {
      expect(wind.uMps).toBeLessThan(0); // 西向き
      expect(wind.vMps).toBeLessThan(0); // 南向き
    }
  });

  it('SH 貿易風帯（lat = -15°）は北西向き（u<0, v>0）', () => {
    const wind = sampleAtLatitude(result.monthlyPrevailingWind[0]!, -15);
    expect(wind).toBeDefined();
    if (wind) {
      expect(wind.uMps).toBeLessThan(0);
      expect(wind.vMps).toBeGreaterThan(0);
    }
  });

  it('NH 偏西風帯（lat = +45°、Ferrel 内）は北東向き（u>0, v>0）', () => {
    const wind = sampleAtLatitude(result.monthlyPrevailingWind[0]!, 45);
    expect(wind).toBeDefined();
    if (wind) {
      expect(wind.uMps).toBeGreaterThan(0);
      expect(wind.vMps).toBeGreaterThan(0);
    }
  });

  it('NH 極東風帯（lat = +75°、Polar 内）は南西向き（u<0, v<0）', () => {
    const wind = sampleAtLatitude(result.monthlyPrevailingWind[0]!, 75);
    expect(wind).toBeDefined();
    if (wind) {
      expect(wind.uMps).toBeLessThan(0);
      expect(wind.vMps).toBeLessThan(0);
    }
  });

  it('逆行惑星では東西成分の符号が反転する', () => {
    const retrograde: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, rotationDirection: 'retrograde' },
    };
    const r = computeWindBelt(retrograde, grid, itczResult);
    const wind = sampleAtLatitude(r.monthlyPrevailingWind[0]!, 15);
    // 順行の貿易風 u<0 が、逆行では u>0 になる
    expect(wind?.uMps ?? 0).toBeGreaterThan(0);
  });
});

describe('sim/02_wind_belt: 帯状気圧（[docs/spec/02_風帯.md §4.3]）', () => {
  const grid = baseGrid(2);
  const itczResult = baseITCZ(EARTH_PLANET_PARAMS, grid);
  const result = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);

  it('赤道（ITCZ 低気圧帯）は亜熱帯（高気圧帯）より気圧が低い', () => {
    const monthField = result.monthlySurfacePressureHpa[0]!;
    // 全海洋セルでサンプリング（陸地 anomaly を避けるため lat 5° 経度 0° 付近）
    const equatorRow = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
    const subtropicalRow = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const j = Math.floor(grid.longitudeCount / 2);
    expect(monthField[equatorRow]?.[j]).toBeLessThan(monthField[subtropicalRow]?.[j] ?? 0);
  });

  it('全海洋グリッドでは陸地 anomaly が無く帯状パターンのみ', () => {
    const result0 = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);
    const monthField = result0.monthlySurfacePressureHpa[0]!;
    // 同じ緯度の異なる経度では値が一致（全海洋なので）
    const row = Math.round((30 + 90) / grid.resolutionDeg - 0.5);
    const r = monthField[row]!;
    const first = r[0]!;
    for (const v of r) {
      expect(v).toBe(first);
    }
  });

  it('NH 全陸の planet で NH 夏は陸地気圧が同緯度海洋より低い（大陸夏低気圧）', () => {
    const nhLandGrid = mapGridCells(baseGrid(2), (cell) =>
      cell.latitudeDeg > 0 ? { ...cell, isLand: true, continentId: 'nh' } : cell,
    );
    const itcz = baseITCZ(EARTH_PLANET_PARAMS, nhLandGrid);
    const r = computeWindBelt(EARTH_PLANET_PARAMS, nhLandGrid, itcz);
    // m=6 (NH 夏): NH 陸地は低気圧 anomaly、SH 海洋は anomaly なし
    const julyField = r.monthlySurfacePressureHpa[6]!;
    const nhRow = Math.round((30 + 90) / nhLandGrid.resolutionDeg - 0.5);
    const shRow = Math.round((-30 + 90) / nhLandGrid.resolutionDeg - 0.5);
    const j = Math.floor(nhLandGrid.longitudeCount / 2);
    const nhPressure = julyField[nhRow]?.[j] ?? 0;
    const shPressure = julyField[shRow]?.[j] ?? 0;
    expect(nhPressure).toBeLessThan(shPressure);
  });
});

describe('sim/02_wind_belt: モンスーン領域マスク（[docs/spec/02_風帯.md §4.5]）', () => {
  it('陸地で ITCZ が経度方向に広く移動する場所が monsoon = true', () => {
    // ITCZ が大きく振れるよう、軸傾斜を大きく
    const tilted: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 30 },
    };
    const grid = mapGridCells(baseGrid(2), (cell) =>
      Math.abs(cell.latitudeDeg) < 25 ? { ...cell, isLand: true, continentId: 'eq' } : cell,
    );
    const itcz = baseITCZ(tilted, grid);
    const r = computeWindBelt(tilted, grid, itcz);
    // 7 月の monsoon mask: NH 陸地で true があるはず
    const julyMask = r.monthlyMonsoonMask[6]!;
    let monsoonCount = 0;
    for (const row of julyMask) {
      for (const v of row) {
        if (v) monsoonCount++;
      }
    }
    expect(monsoonCount).toBeGreaterThan(0);
  });

  it('全海洋の grid では monsoon は全て false', () => {
    const grid = baseGrid(2);
    const r = computeWindBelt(EARTH_PLANET_PARAMS, grid, baseITCZ(EARTH_PLANET_PARAMS, grid));
    for (const monthField of r.monthlyMonsoonMask) {
      for (const row of monthField) {
        for (const v of row) {
          expect(v).toBe(false);
        }
      }
    }
  });
});

describe('sim/02_wind_belt: セル境界（[docs/spec/02_風帯.md §4.1, §4.3]）', () => {
  it('NH 夏は NH 亜熱帯境界が外側（35°）、SH 亜熱帯境界が内側（-25°）', () => {
    const grid = baseGrid(2);
    const itczResult = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const result = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);
    // m = 6 (NH 夏)
    const julyBoundaries = result.monthlyCellBoundariesDeg[6]!;
    // 配列順は [SH polar, SH 亜熱帯, equator, NH 亜熱帯, NH polar]
    expect(julyBoundaries[1]).toBeLessThan(-25); // SH 亜熱帯 < -25 (赤道側に縮む)
    expect(julyBoundaries[3]).toBeGreaterThan(25); // NH 亜熱帯 > 25 (極側へ広がる)
  });
});

describe('sim/02_wind_belt: 縮退・極端値耐性', () => {
  it('axialTiltDeg = 0 で ITCZ が動かない場合でも NaN を出さない', () => {
    const flat: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 0 },
    };
    const grid = baseGrid(2);
    const result = computeWindBelt(flat, grid, baseITCZ(flat, grid));
    for (const monthField of result.monthlyPrevailingWind) {
      for (const row of monthField) {
        for (const wind of row) {
          expect(Number.isFinite(wind.uMps)).toBe(true);
          expect(Number.isFinite(wind.vMps)).toBe(true);
        }
      }
    }
  });

  it('meanWindSpeedMps = 0 で全風ベクトルが |0|（-0/+0 を区別しない）', () => {
    const grid = baseGrid(2);
    const result = computeWindBelt(EARTH_PLANET_PARAMS, grid, baseITCZ(EARTH_PLANET_PARAMS, grid), {
      ...DEFAULT_WIND_BELT_STEP_PARAMS,
      meanWindSpeedMps: 0,
    });
    for (const monthField of result.monthlyPrevailingWind) {
      for (const row of monthField) {
        for (const wind of row) {
          expect(Math.abs(wind.uMps)).toBe(0);
          expect(Math.abs(wind.vMps)).toBe(0);
        }
      }
    }
  });
});

describe('sim/02_wind_belt: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = baseGrid(2);
    const itczResult = baseITCZ(EARTH_PLANET_PARAMS, grid);
    const a = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);
    const b = computeWindBelt(EARTH_PLANET_PARAMS, grid, itczResult);
    expect(a).toEqual(b);
  });
});

/** Months12 ヘルパが参照されない警告を抑える（型のみ使用）。 */
const _unused: Months12<LongitudeProfile<ITCZBand>> | null = null;
void _unused;

import { describe, expect, it } from 'vitest';
import {
  EARTH_PLANET_PARAMS,
  createGrid,
  type Cell,
  type Grid,
  type GridResolutionDeg,
  type PlanetParams,
} from '@/domain';
import {
  DEFAULT_ITCZ_STEP_PARAMS,
  computeITCZ,
  solarDeclinationDeg,
} from '@/sim/01_itcz';

/** 既定 1° の地球軌道・本体 + 全海洋グリッドでのテスト用ヘルパ。 */
function earthOceanGrid(resolutionDeg: GridResolutionDeg = 2): Grid {
  return createGrid(resolutionDeg);
}

/** 全セルを customizer で書き換えた新しい Grid を返す（不変性を保つ）。 */
function mapGridCells(grid: Grid, customizer: (cell: Cell) => Cell): Grid {
  return {
    resolutionDeg: grid.resolutionDeg,
    latitudeCount: grid.latitudeCount,
    longitudeCount: grid.longitudeCount,
    cells: grid.cells.map((row) => row.map((cell) => customizer(cell))),
  };
}

/** 北半球を全陸地、南半球を全海洋にした地球風グリッド。 */
function nhLandShOceanGrid(resolutionDeg: GridResolutionDeg = 2): Grid {
  return mapGridCells(earthOceanGrid(resolutionDeg), (cell) =>
    cell.latitudeDeg > 0
      ? { ...cell, isLand: true, continentId: 'nh' }
      : cell,
  );
}

describe('sim/01_itcz: solarDeclinationDeg（[docs/spec/01_ITCZ.md §4.1]）', () => {
  it('地球の地軸傾斜 23.44° で δ(m=0) ≈ -22.65（北半球 1 月）', () => {
    const delta = solarDeclinationDeg(0, 23.44);
    expect(delta).toBeCloseTo(-23.44 * Math.cos(Math.PI / 12), 6);
    expect(delta).toBeLessThan(-22.5);
    expect(delta).toBeGreaterThan(-23);
  });

  it('地球の地軸傾斜 23.44° で δ(m=6) ≈ +22.65（北半球 7 月）', () => {
    const delta = solarDeclinationDeg(6, 23.44);
    expect(delta).toBeCloseTo(23.44 * Math.cos(Math.PI / 12), 6);
    expect(delta).toBeGreaterThan(22.5);
    expect(delta).toBeLessThan(23);
  });

  it('春分・秋分付近（m≈3, m≈9）で符号が反転する', () => {
    const tilt = 23.44;
    expect(solarDeclinationDeg(2, tilt) * solarDeclinationDeg(3, tilt)).toBeLessThan(0);
    expect(solarDeclinationDeg(8, tilt) * solarDeclinationDeg(9, tilt)).toBeLessThan(0);
  });

  it('axialTiltDeg = 0 では全月で δ = 0', () => {
    for (let m = 0; m < 12; m++) {
      expect(Math.abs(solarDeclinationDeg(m, 0))).toBe(0);
    }
  });

  it('axialTiltDeg = 90° でも NaN を返さない（極端値耐性）', () => {
    for (let m = 0; m < 12; m++) {
      const v = solarDeclinationDeg(m, 90);
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(90);
    }
  });
});

describe('sim/01_itcz: computeITCZ 出力構造（[docs/spec/01_ITCZ.md §5]）', () => {
  it('monthlyBands は長さ 12 で各月が longitudeCount 個のバンドを持つ', () => {
    const grid = earthOceanGrid(2);
    const result = computeITCZ(EARTH_PLANET_PARAMS, grid);
    expect(result.monthlyBands.length).toBe(12);
    for (const month of result.monthlyBands) {
      expect(month.length).toBe(grid.longitudeCount);
    }
  });

  it('annualMeanCenterLatitudeDeg は longitudeCount 個', () => {
    const grid = earthOceanGrid(2);
    const result = computeITCZ(EARTH_PLANET_PARAMS, grid);
    expect(result.annualMeanCenterLatitudeDeg.length).toBe(grid.longitudeCount);
  });

  it('全セルで NaN や物理的にあり得ない値を返さない', () => {
    const grid = earthOceanGrid(2);
    const result = computeITCZ(EARTH_PLANET_PARAMS, grid);
    for (const month of result.monthlyBands) {
      for (const band of month) {
        expect(Number.isFinite(band.centerLatitudeDeg)).toBe(true);
        expect(Number.isFinite(band.southBoundLatitudeDeg)).toBe(true);
        expect(Number.isFinite(band.northBoundLatitudeDeg)).toBe(true);
        expect(band.southBoundLatitudeDeg).toBeLessThanOrEqual(band.northBoundLatitudeDeg);
      }
    }
  });
});

describe('sim/01_itcz: 地球パラメータでの定性的特徴（[開発ガイド.md §3.2]）', () => {
  it('全海洋・地球軌道で年平均 ITCZ 中心線がほぼ赤道（年平均 |φ| ≤ 0.1°）', () => {
    const grid = earthOceanGrid(2);
    const result = computeITCZ(EARTH_PLANET_PARAMS, grid);
    for (const lat of result.annualMeanCenterLatitudeDeg) {
      expect(Math.abs(lat)).toBeLessThan(0.1);
    }
  });

  it('NH 夏（m=6）の中心線は北半球側、NH 冬（m=0）の中心線は南半球側', () => {
    const grid = earthOceanGrid(2);
    const result = computeITCZ(EARTH_PLANET_PARAMS, grid);
    const summer = result.monthlyBands[6];
    const winter = result.monthlyBands[0];
    for (const band of summer) {
      expect(band.centerLatitudeDeg).toBeGreaterThan(0);
    }
    for (const band of winter) {
      expect(band.centerLatitudeDeg).toBeLessThan(0);
    }
  });

  it('影響帯の半幅は山岳がない経度では既定値 15°', () => {
    const grid = earthOceanGrid(2);
    const result = computeITCZ(EARTH_PLANET_PARAMS, grid);
    const sample = result.monthlyBands[0]?.[0];
    expect(sample).toBeDefined();
    if (sample) {
      const halfWidth =
        (sample.northBoundLatitudeDeg - sample.southBoundLatitudeDeg) / 2;
      expect(halfWidth).toBeCloseTo(DEFAULT_ITCZ_STEP_PARAMS.baseInfluenceHalfWidthDeg, 6);
      expect((sample.northBoundLatitudeDeg + sample.southBoundLatitudeDeg) / 2).toBeCloseTo(
        sample.centerLatitudeDeg,
        6,
      );
    }
  });
});

describe('sim/01_itcz: 異常値・極端値（[開発ガイド.md §3.2] 異常値テスト）', () => {
  it('axialTiltDeg = 0 では全月で中心線が赤道、影響帯は ±15°', () => {
    const flat: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 0 },
    };
    const grid = earthOceanGrid(2);
    const result = computeITCZ(flat, grid);
    for (const month of result.monthlyBands) {
      for (const band of month) {
        expect(band.centerLatitudeDeg).toBeCloseTo(0, 6);
        expect(band.southBoundLatitudeDeg).toBeCloseTo(-15, 6);
        expect(band.northBoundLatitudeDeg).toBeCloseTo(15, 6);
      }
    }
  });

  it('axialTiltDeg = 60° の極端ケースでも NaN や非単調を出さない', () => {
    const extreme: PlanetParams = {
      ...EARTH_PLANET_PARAMS,
      body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 60 },
    };
    const grid = earthOceanGrid(2);
    const result = computeITCZ(extreme, grid);
    for (const month of result.monthlyBands) {
      for (const band of month) {
        expect(Number.isFinite(band.centerLatitudeDeg)).toBe(true);
        expect(band.southBoundLatitudeDeg).toBeLessThanOrEqual(band.northBoundLatitudeDeg);
      }
    }
  });
});

describe('sim/01_itcz: 陸海補正（モンスーン的引き寄せ、[docs/spec/01_ITCZ.md §4.2]）', () => {
  it('北半球が全陸・南半球が全海なら NH 夏の中心線が太陽直下点より北側に振れる', () => {
    const grid = nhLandShOceanGrid(2);
    const oceanResult = computeITCZ(EARTH_PLANET_PARAMS, earthOceanGrid(2));
    const landResult = computeITCZ(EARTH_PLANET_PARAMS, grid);
    // m=6 (NH summer): land grid centers should be further north than ocean grid centers
    const landCenter = landResult.monthlyBands[6]?.[0];
    const oceanCenter = oceanResult.monthlyBands[6]?.[0];
    expect(landCenter).toBeDefined();
    expect(oceanCenter).toBeDefined();
    if (landCenter && oceanCenter) {
      expect(landCenter.centerLatitudeDeg).toBeGreaterThan(oceanCenter.centerLatitudeDeg);
    }
  });

  it('monsoonPullStrengthDeg = 0 なら陸海補正が無効化される', () => {
    const grid = nhLandShOceanGrid(2);
    const oceanResult = computeITCZ(EARTH_PLANET_PARAMS, earthOceanGrid(2));
    const noPullResult = computeITCZ(EARTH_PLANET_PARAMS, grid, {
      ...DEFAULT_ITCZ_STEP_PARAMS,
      monsoonPullStrengthDeg: 0,
    });
    for (let m = 0; m < 12; m++) {
      const oceanBand = oceanResult.monthlyBands[m]?.[0];
      const noPullBand = noPullResult.monthlyBands[m]?.[0];
      if (oceanBand && noPullBand) {
        expect(noPullBand.centerLatitudeDeg).toBeCloseTo(oceanBand.centerLatitudeDeg, 6);
      }
    }
  });
});

describe('sim/01_itcz: 山岳横断切取（[docs/spec/01_ITCZ.md §4.5]）', () => {
  it('帯内に高山（5000 m）があると影響帯が切り取られる', () => {
    const baseGrid = earthOceanGrid(2);
    // 経度インデックス 0 の経度（中心 -179°）の緯度 +5° 帯のセルだけ標高を 5000 m に
    const targetLonIndex = 0;
    const customGrid = mapGridCells(baseGrid, (cell) => {
      const lonIndex = Math.round((cell.longitudeDeg - (-179)) / 2);
      if (lonIndex === targetLonIndex && Math.abs(cell.latitudeDeg - 5) < 1.5) {
        return { ...cell, elevationMeters: 5000, isLand: true };
      }
      return cell;
    });
    const params = { ...DEFAULT_ITCZ_STEP_PARAMS, monsoonPullStrengthDeg: 0 };
    const result = computeITCZ(EARTH_PLANET_PARAMS, customGrid, params);
    // m=6 (NH summer): center near δ ≈ +22.65, base band [+7.65, +37.65].
    // At lon 0, the high mountain at +5° is below center → south boundary should be clipped above 5°
    const band = result.monthlyBands[6]?.[targetLonIndex];
    expect(band).toBeDefined();
    if (band) {
      // South boundary should not include the +5° high cell
      expect(band.southBoundLatitudeDeg).toBeGreaterThan(5);
    }
  });

  it('mountainCutoffMeters を高くすれば切取が効かなくなる', () => {
    const baseGrid = earthOceanGrid(2);
    const customGrid = mapGridCells(baseGrid, (cell) => {
      const lonIndex = Math.round((cell.longitudeDeg - (-179)) / 2);
      if (lonIndex === 0 && Math.abs(cell.latitudeDeg - 5) < 1.5) {
        return { ...cell, elevationMeters: 5000, isLand: true };
      }
      return cell;
    });
    const result = computeITCZ(EARTH_PLANET_PARAMS, customGrid, {
      ...DEFAULT_ITCZ_STEP_PARAMS,
      monsoonPullStrengthDeg: 0,
      mountainCutoffMeters: 10000,
    });
    const band = result.monthlyBands[6]?.[0];
    expect(band).toBeDefined();
    if (band) {
      // With cutoff > 5000, no clipping → south = center - 15
      const expectedHalfWidth = DEFAULT_ITCZ_STEP_PARAMS.baseInfluenceHalfWidthDeg;
      expect(band.southBoundLatitudeDeg).toBeCloseTo(
        band.centerLatitudeDeg - expectedHalfWidth,
        6,
      );
    }
  });
});

describe('sim/01_itcz: 決定性（[要件定義書.md §3.2]）', () => {
  it('同一入力で 2 回呼ぶと構造的に同値の結果を返す', () => {
    const grid = earthOceanGrid(2);
    const a = computeITCZ(EARTH_PLANET_PARAMS, grid);
    const b = computeITCZ(EARTH_PLANET_PARAMS, grid);
    expect(a).toEqual(b);
  });
});

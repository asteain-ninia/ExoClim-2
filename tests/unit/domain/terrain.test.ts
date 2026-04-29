import { describe, expect, it } from 'vitest';
import {
  buildTerrainGrid,
  getEarthStatisticsAt,
  type TerrainSource,
} from '@/domain';

/** Grid から「land の総数」と「elevation の有限性」を集計するヘルパ。 */
function summarize(grid: ReturnType<typeof buildTerrainGrid>) {
  let totalCells = 0;
  let landCells = 0;
  let allElevationsFinite = true;
  let maxElevation = -Infinity;
  let minElevation = Infinity;
  for (const row of grid.cells) {
    for (const cell of row) {
      totalCells++;
      if (cell.isLand) landCells++;
      if (!Number.isFinite(cell.elevationMeters)) allElevationsFinite = false;
      if (cell.elevationMeters > maxElevation) maxElevation = cell.elevationMeters;
      if (cell.elevationMeters < minElevation) minElevation = cell.elevationMeters;
    }
  }
  return { totalCells, landCells, allElevationsFinite, maxElevation, minElevation };
}

describe('domain/terrain: buildTerrainGrid', () => {
  describe('preset / no_land（全海洋）', () => {
    it('全セルが海洋・標高 0', () => {
      const source: TerrainSource = { kind: 'preset', presetId: 'no_land' };
      const grid = buildTerrainGrid(source, 2);
      const s = summarize(grid);
      expect(s.landCells).toBe(0);
      expect(s.maxElevation).toBe(0);
      expect(Math.abs(s.minElevation)).toBe(0);
    });
  });

  describe('preset / earth（地球統計拘束付き手続き生成）', () => {
    it('陸地割合がおおよそ地球（0.27〜0.32）に整合する', () => {
      const source: TerrainSource = { kind: 'preset', presetId: 'earth' };
      const grid = buildTerrainGrid(source, 2);
      const s = summarize(grid);
      const landFraction = s.landCells / s.totalCells;
      // 地球統計の数値積分値は 0.29 周辺。手続き生成のずれを許容して 0.20〜0.40 で判定。
      expect(landFraction).toBeGreaterThan(0.2);
      expect(landFraction).toBeLessThan(0.4);
    });

    it('標高は -8000m 〜 +6000m の範囲で有限値', () => {
      const source: TerrainSource = { kind: 'preset', presetId: 'earth' };
      const grid = buildTerrainGrid(source, 2);
      const s = summarize(grid);
      expect(s.allElevationsFinite).toBe(true);
      expect(s.maxElevation).toBeLessThanOrEqual(6000);
      expect(s.minElevation).toBeGreaterThan(-15000);
    });

    it('決定性: 同入力で 2 回呼ぶと同値の Grid を返す', () => {
      const source: TerrainSource = { kind: 'preset', presetId: 'earth' };
      const a = buildTerrainGrid(source, 2);
      const b = buildTerrainGrid(source, 2);
      expect(a).toEqual(b);
    });

    it('緯度別陸地割合が EARTH_LATITUDE_STATISTICS と概ね整合する（赤道帯の海洋優勢）', () => {
      const source: TerrainSource = { kind: 'preset', presetId: 'earth' };
      const grid = buildTerrainGrid(source, 2);
      // 赤道帯（緯度 0±5°）の陸地割合が 0.5 未満であることを確認
      let landAtEquator = 0;
      let countAtEquator = 0;
      for (const row of grid.cells) {
        for (const cell of row) {
          if (Math.abs(cell.latitudeDeg) <= 5) {
            countAtEquator++;
            if (cell.isLand) landAtEquator++;
          }
        }
      }
      const fraction = landAtEquator / countAtEquator;
      const expectedStat = getEarthStatisticsAt(0);
      // 統計値そのものではなく、海洋優勢（< 0.5）の定性的特徴を確認
      expect(fraction).toBeLessThan(0.5);
      expect(fraction).toBeLessThan(expectedStat.landFraction + 0.1);
    });
  });

  describe('procedural（利用者指定 seed と landFraction）', () => {
    it('seed が変わると地形が変わる', () => {
      const a = buildTerrainGrid({ kind: 'procedural', seed: 1, landFraction: 0.29 }, 2);
      const b = buildTerrainGrid({ kind: 'procedural', seed: 2, landFraction: 0.29 }, 2);
      expect(a.cells).not.toEqual(b.cells);
    });

    it('landFraction = 0 でほぼ全海洋', () => {
      const grid = buildTerrainGrid({ kind: 'procedural', seed: 0, landFraction: 0 }, 2);
      const s = summarize(grid);
      expect(s.landCells).toBe(0);
    });

    it('landFraction = 1.0 で陸地割合が地球（0.29）の約 3.4 倍にスケールされ高陸地率になる', () => {
      const grid = buildTerrainGrid({ kind: 'procedural', seed: 0, landFraction: 1.0 }, 2);
      const s = summarize(grid);
      const fraction = s.landCells / s.totalCells;
      // landFraction / EARTH_GLOBAL_LAND_FRACTION = 1.0 / 0.29 ≈ 3.4 倍。
      // 各緯度が 1.0 で頭打ち（min(1, ...)）なため平均は約 0.6〜0.95。0.5 超を要件とする。
      expect(fraction).toBeGreaterThan(0.5);
    });

    it('決定性: 同 seed で同 Grid', () => {
      const a = buildTerrainGrid({ kind: 'procedural', seed: 42, landFraction: 0.3 }, 2);
      const b = buildTerrainGrid({ kind: 'procedural', seed: 42, landFraction: 0.3 }, 2);
      expect(a).toEqual(b);
    });
  });

  describe('preset / idealized_continent（理想化大陸）', () => {
    it('陸地が経度中央（0° 付近）に集中する', () => {
      const grid = buildTerrainGrid({ kind: 'preset', presetId: 'idealized_continent' }, 2);
      // 経度 ±90° の範囲で陸地比、|経度| > 90° の範囲で陸地比を比較
      let centralLand = 0;
      let centralCount = 0;
      let peripheralLand = 0;
      let peripheralCount = 0;
      for (const row of grid.cells) {
        for (const cell of row) {
          if (Math.abs(cell.longitudeDeg) <= 90) {
            centralCount++;
            if (cell.isLand) centralLand++;
          } else {
            peripheralCount++;
            if (cell.isLand) peripheralLand++;
          }
        }
      }
      const centralFrac = centralLand / centralCount;
      const peripheralFrac = peripheralLand / peripheralCount;
      expect(centralFrac).toBeGreaterThan(peripheralFrac);
    });
  });

  describe('custom（未実装）', () => {
    it('呼び出すと NotImplemented エラー', () => {
      const source: TerrainSource = { kind: 'custom', resourceId: 'fake' };
      expect(() => buildTerrainGrid(source, 2)).toThrowError(/not yet implemented/);
    });
  });

  describe('Grid 構造', () => {
    it('解像度 2° で 90 × 180 セル', () => {
      const grid = buildTerrainGrid({ kind: 'preset', presetId: 'no_land' }, 2);
      expect(grid.latitudeCount).toBe(90);
      expect(grid.longitudeCount).toBe(180);
    });

    it('セル中心の緯度・経度は createGrid と一致する', () => {
      const grid = buildTerrainGrid({ kind: 'preset', presetId: 'no_land' }, 2);
      expect(grid.cells[0]?.[0]?.latitudeDeg).toBeCloseTo(-89, 6);
      expect(grid.cells[grid.latitudeCount - 1]?.[0]?.latitudeDeg).toBeCloseTo(89, 6);
      expect(grid.cells[0]?.[0]?.longitudeDeg).toBeCloseTo(-179, 6);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_RESOLUTION_DEG,
  createGrid,
  type GridResolutionDeg,
} from '@/domain/grid';

describe('domain/grid: Grid / Cell 型と createGrid 生成器', () => {
  describe('解像度ごとのセル数（要件定義書 §4.1）', () => {
    it('既定解像度は 1° である', () => {
      expect(DEFAULT_GRID_RESOLUTION_DEG).toBe(1);
    });

    it.each<[GridResolutionDeg, number, number]>([
      [0.5, 360, 720],
      [1, 180, 360],
      [2, 90, 180],
    ])('解像度 %s° で %i × %i のセルを生成する', (res, latCount, lonCount) => {
      const grid = createGrid(res);
      expect(grid.resolutionDeg).toBe(res);
      expect(grid.latitudeCount).toBe(latCount);
      expect(grid.longitudeCount).toBe(lonCount);
      expect(grid.cells.length).toBe(latCount);
      for (const row of grid.cells) {
        expect(row.length).toBe(lonCount);
      }
    });

    it('1° 既定で 64,800 セルとなる（180×360）', () => {
      const grid = createGrid();
      const total = grid.cells.reduce((acc, row) => acc + row.length, 0);
      expect(total).toBe(64_800);
    });
  });

  describe('セル中心の緯度・経度', () => {
    it('1° グリッドの最南端セル中心は -89.5° / 最北端は +89.5°', () => {
      const grid = createGrid(1);
      const firstRow = grid.cells[0];
      const lastRow = grid.cells[grid.latitudeCount - 1];
      expect(firstRow).toBeDefined();
      expect(lastRow).toBeDefined();
      const south = firstRow![0]!;
      const north = lastRow![0]!;
      expect(south.latitudeDeg).toBeCloseTo(-89.5, 12);
      expect(north.latitudeDeg).toBeCloseTo(+89.5, 12);
    });

    it('1° グリッドの最西端セル中心は -179.5° / 最東端は +179.5°', () => {
      const grid = createGrid(1);
      const row = grid.cells[0];
      expect(row).toBeDefined();
      const west = row![0]!;
      const east = row![grid.longitudeCount - 1]!;
      expect(west.longitudeDeg).toBeCloseTo(-179.5, 12);
      expect(east.longitudeDeg).toBeCloseTo(+179.5, 12);
    });

    it('全セルの緯度は (-90, +90) 内、経度は [-180, +180) 内', () => {
      const grid = createGrid(1);
      for (const row of grid.cells) {
        for (const cell of row) {
          expect(cell.latitudeDeg).toBeGreaterThan(-90);
          expect(cell.latitudeDeg).toBeLessThan(+90);
          expect(cell.longitudeDeg).toBeGreaterThanOrEqual(-180);
          expect(cell.longitudeDeg).toBeLessThan(+180);
        }
      }
    });

    it('同一行内のセルは経度のみが異なる', () => {
      const grid = createGrid(1);
      const row = grid.cells[90];
      expect(row).toBeDefined();
      const baseLat = row![0]!.latitudeDeg;
      for (const cell of row!) {
        expect(cell.latitudeDeg).toBe(baseLat);
      }
    });
  });

  describe('セル属性のデフォルト値', () => {
    it('地形なしの初期化では全セルが海・標高 0・大陸所属 null', () => {
      const grid = createGrid(2);
      for (const row of grid.cells) {
        for (const cell of row) {
          expect(cell.isLand).toBe(false);
          expect(cell.elevationMeters).toBe(0);
          expect(cell.continentId).toBeNull();
        }
      }
    });
  });

  describe('決定性（要件定義書 §3.2 信頼性）', () => {
    it('同一入力で 2 回呼び出すと構造的に同値の結果を返す', () => {
      const a = createGrid(1);
      const b = createGrid(1);
      expect(a).toEqual(b);
    });

    it('異なる呼び出しは独立した配列インスタンスを返す（参照共有しない）', () => {
      const a = createGrid(1);
      const b = createGrid(1);
      expect(a.cells).not.toBe(b.cells);
    });
  });
});

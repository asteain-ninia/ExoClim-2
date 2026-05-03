// distance.ts ユーティリティのテスト（[P4-73]）。

import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_KM,
  KM_PER_DEG_LAT,
  cellsToKm,
  degLatToKm,
  degLonToKm,
  kmToChebCells,
  kmToLatCells,
  kmToLonCells,
} from '@/domain/distance';

describe('domain/distance', () => {
  describe('定数', () => {
    it('EARTH_RADIUS_KM = 6371（Pasta 既定）', () => {
      expect(EARTH_RADIUS_KM).toBe(6371);
    });
    it('KM_PER_DEG_LAT ≈ 111.32', () => {
      expect(KM_PER_DEG_LAT).toBeCloseTo(111.32, 1);
    });
  });

  describe('degLatToKm', () => {
    it('1° lat = 111.32 km', () => {
      expect(degLatToKm(1)).toBeCloseTo(111.32, 1);
    });
    it('90° lat = 10018.8 km（極まで）', () => {
      expect(degLatToKm(90)).toBeCloseTo(10018.8, 0);
    });
  });

  describe('degLonToKm', () => {
    it('赤道 1° lon = 111.32 km', () => {
      expect(degLonToKm(1, 0)).toBeCloseTo(111.32, 1);
    });
    it('lat 60° で 1° lon = 55.66 km（cos 60° = 0.5）', () => {
      expect(degLonToKm(1, 60)).toBeCloseTo(55.66, 1);
    });
    it('極（lat 90°）で 1° lon ≈ 0', () => {
      expect(Math.abs(degLonToKm(1, 90))).toBeLessThan(0.01);
    });
  });

  describe('kmToLatCells', () => {
    it('1113 km / 1° = 10 セル', () => {
      expect(kmToLatCells(1113.2, 1)).toBeCloseTo(10, 1);
    });
    it('556 km / 0.5° = 10 セル', () => {
      expect(kmToLatCells(556.6, 0.5)).toBeCloseTo(10, 1);
    });
  });

  describe('kmToLonCells', () => {
    it('赤道では lat 方向と同じ', () => {
      expect(kmToLonCells(1113.2, 1, 0)).toBeCloseTo(10, 1);
    });
    it('lat 60° では lat 方向の 2 倍（cos 60° = 0.5）', () => {
      expect(kmToLonCells(1113.2, 1, 60)).toBeCloseTo(20, 1);
    });
    it('極近傍は cap される', () => {
      const cells = kmToLonCells(1000, 1, 89.99, 200);
      expect(cells).toBeLessThanOrEqual(200);
    });
  });

  describe('kmToChebCells', () => {
    it('Chebyshev = max(lat, lon)、緯度高いほど lon が大', () => {
      const eq = kmToChebCells(1113, 1, 0);
      const lat60 = kmToChebCells(1113, 1, 60);
      expect(lat60).toBeGreaterThan(eq);
    });
  });

  describe('cellsToKm', () => {
    it('赤道で di=1, dj=0 → 1° × 111.32 = 111 km (lat 方向)', () => {
      expect(cellsToKm(1, 0, 1, 0)).toBeCloseTo(111.32, 1);
    });
    it('赤道で di=0, dj=1 → 1° × 111.32 (lon 方向 cos 補正なし)', () => {
      expect(cellsToKm(0, 1, 1, 0)).toBeCloseTo(111.32, 1);
    });
    it('lat 60° で di=0, dj=1 → 55.66 km', () => {
      expect(cellsToKm(0, 1, 1, 60)).toBeCloseTo(55.66, 1);
    });
    it('di=1, dj=1 → max(lat, lon) で Chebyshev', () => {
      // lat 0: lat=111, lon=111 → max=111
      expect(cellsToKm(1, 1, 1, 0)).toBeCloseTo(111.32, 1);
      // lat 60: lat=111, lon=55.66 → max=111
      expect(cellsToKm(1, 1, 1, 60)).toBeCloseTo(111.32, 1);
    });
  });
});

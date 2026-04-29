import { describe, expect, it } from 'vitest';
import {
  EARTH_GLOBAL_LAND_FRACTION,
  EARTH_LATITUDE_STATISTICS,
  ELEVATION_BINS_METERS,
  getEarthStatisticsAt,
} from '@/domain/earthStatistics';

describe('domain/earthStatistics: 地球の hypsometric 統計', () => {
  describe('テーブル整合', () => {
    it('5° 間隔・36 行（南極側 -87.5° から北極側 +87.5°）', () => {
      expect(EARTH_LATITUDE_STATISTICS.length).toBe(36);
      expect(EARTH_LATITUDE_STATISTICS[0]?.latitudeDeg).toBe(-87.5);
      expect(EARTH_LATITUDE_STATISTICS[35]?.latitudeDeg).toBe(87.5);
    });

    it('全エントリが 5 ビンを持ち、各ビンは [0, 1] の範囲', () => {
      for (const entry of EARTH_LATITUDE_STATISTICS) {
        expect(entry.bins.length).toBe(5);
        for (const bin of entry.bins) {
          expect(bin).toBeGreaterThanOrEqual(0);
          expect(bin).toBeLessThanOrEqual(1);
        }
      }
    });

    it('ELEVATION_BINS_METERS は 5 ビンで連続', () => {
      expect(ELEVATION_BINS_METERS.length).toBe(5);
      for (let i = 0; i < ELEVATION_BINS_METERS.length - 1; i++) {
        expect(ELEVATION_BINS_METERS[i]?.maxMeters).toBe(
          ELEVATION_BINS_METERS[i + 1]?.minMeters,
        );
      }
    });
  });

  describe('getEarthStatisticsAt（緯度補間）', () => {
    it('テーブル中心点（-2.5°）でテーブル値そのまま', () => {
      const result = getEarthStatisticsAt(-2.5);
      const expected = EARTH_LATITUDE_STATISTICS.find((e) => e.latitudeDeg === -2.5)!;
      for (let i = 0; i < 5; i++) {
        expect(result.bins[i]).toBeCloseTo(expected.bins[i]!, 6);
      }
    });

    it('テーブル外（緯度 +90° / -90°）でも有限値を返す', () => {
      const north = getEarthStatisticsAt(90);
      const south = getEarthStatisticsAt(-90);
      expect(Number.isFinite(north.landFraction)).toBe(true);
      expect(Number.isFinite(south.landFraction)).toBe(true);
    });

    it('赤道直下（0°）の陸地割合は南極（-87.5°）の極端値より小さい', () => {
      const equator = getEarthStatisticsAt(0);
      const antarctic = getEarthStatisticsAt(-87.5);
      // 南極大陸は -87.5° で 100% 近い陸地、赤道は海洋優勢
      expect(antarctic.landFraction).toBeGreaterThan(equator.landFraction);
    });

    it('北緯 60° 付近（ユーラシア・北米陸塊）で陸地割合 > 0.5', () => {
      const result = getEarthStatisticsAt(60);
      expect(result.landFraction).toBeGreaterThan(0.5);
    });

    it('5° の中間値（-85°）で線形補間が機能する', () => {
      const a = getEarthStatisticsAt(-87.5);
      const b = getEarthStatisticsAt(-82.5);
      const mid = getEarthStatisticsAt(-85);
      expect(mid.landFraction).toBeCloseTo((a.landFraction + b.landFraction) / 2, 6);
    });
  });

  describe('EARTH_GLOBAL_LAND_FRACTION', () => {
    it('地球の陸地割合は 0.29（実測 0.292 ± 0.01 の代表値）', () => {
      expect(EARTH_GLOBAL_LAND_FRACTION).toBeGreaterThan(0.27);
      expect(EARTH_GLOBAL_LAND_FRACTION).toBeLessThan(0.31);
    });
  });
});

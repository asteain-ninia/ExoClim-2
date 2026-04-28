import { describe, expect, it } from 'vitest';
import {
  EARTH_ATMOSPHERE_OCEAN_PARAMS,
  EARTH_BODY_PARAMS,
  EARTH_ORBITAL_PARAMS,
  EARTH_PLANET_PARAMS,
  EARTH_TERRAIN_SOURCE,
  type PlanetParams,
  type TerrainSource,
} from '@/domain/planetParams';

describe('domain/planetParams: 物理パラメータ型と地球プリセット', () => {
  describe('地球プリセットの構造（要件定義書 §4.2）', () => {
    it('PlanetParams は orbital / body / atmosphereOcean / terrain の 4 区画を持つ', () => {
      expect(EARTH_PLANET_PARAMS.orbital).toBe(EARTH_ORBITAL_PARAMS);
      expect(EARTH_PLANET_PARAMS.body).toBe(EARTH_BODY_PARAMS);
      expect(EARTH_PLANET_PARAMS.atmosphereOcean).toBe(EARTH_ATMOSPHERE_OCEAN_PARAMS);
      expect(EARTH_PLANET_PARAMS.terrain).toBe(EARTH_TERRAIN_SOURCE);
    });
  });

  describe('OrbitalParams の値域（要件定義書 §2.1.1）', () => {
    it('主星光度・軌道長半径・公転周期は正の数', () => {
      expect(EARTH_ORBITAL_PARAMS.starLuminositySolar).toBeGreaterThan(0);
      expect(EARTH_ORBITAL_PARAMS.semiMajorAxisAU).toBeGreaterThan(0);
      expect(EARTH_ORBITAL_PARAMS.orbitalPeriodDays).toBeGreaterThan(0);
    });

    it('離心率は 0 ≤ e < 1', () => {
      expect(EARTH_ORBITAL_PARAMS.eccentricity).toBeGreaterThanOrEqual(0);
      expect(EARTH_ORBITAL_PARAMS.eccentricity).toBeLessThan(1);
    });

    it('近日点引数は度単位', () => {
      expect(EARTH_ORBITAL_PARAMS.argumentOfPerihelionDeg).toBeGreaterThanOrEqual(0);
      expect(EARTH_ORBITAL_PARAMS.argumentOfPerihelionDeg).toBeLessThan(360);
    });

    it('地球の値が NASA Earth Fact Sheet と整合する', () => {
      expect(EARTH_ORBITAL_PARAMS.starLuminositySolar).toBe(1.0);
      expect(EARTH_ORBITAL_PARAMS.semiMajorAxisAU).toBe(1.0);
      expect(EARTH_ORBITAL_PARAMS.orbitalPeriodDays).toBeCloseTo(365.256, 3);
      expect(EARTH_ORBITAL_PARAMS.eccentricity).toBeCloseTo(0.0167, 4);
    });
  });

  describe('PlanetBodyParams の値域（要件定義書 §2.1.2）', () => {
    it('半径・自転周期・表面重力は正の数', () => {
      expect(EARTH_BODY_PARAMS.radiusKm).toBeGreaterThan(0);
      expect(EARTH_BODY_PARAMS.rotationPeriodHours).toBeGreaterThan(0);
      expect(EARTH_BODY_PARAMS.surfaceGravityMps2).toBeGreaterThan(0);
    });

    it('地軸傾斜は [0, 180] の範囲', () => {
      expect(EARTH_BODY_PARAMS.axialTiltDeg).toBeGreaterThanOrEqual(0);
      expect(EARTH_BODY_PARAMS.axialTiltDeg).toBeLessThanOrEqual(180);
    });

    it('自転方向は prograde または retrograde', () => {
      expect(['prograde', 'retrograde']).toContain(EARTH_BODY_PARAMS.rotationDirection);
    });

    it('地球は順行・傾斜 23.44°・半径 6371 km・恒星時自転周期 23.9345 時間', () => {
      expect(EARTH_BODY_PARAMS.rotationDirection).toBe('prograde');
      expect(EARTH_BODY_PARAMS.axialTiltDeg).toBeCloseTo(23.44, 2);
      expect(EARTH_BODY_PARAMS.radiusKm).toBe(6371);
      expect(EARTH_BODY_PARAMS.rotationPeriodHours).toBeCloseTo(23.9345, 4);
    });
  });

  describe('AtmosphereOceanParams の値域（要件定義書 §2.1.3）', () => {
    it('気圧・気温減率・海洋混合層深は正の数', () => {
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.surfacePressureHpa).toBeGreaterThan(0);
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.lapseRateCelsiusPerKm).toBeGreaterThan(0);
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.oceanMixedLayerDepthMeters).toBeGreaterThan(0);
    });

    it('アルベドと海洋被覆率は [0, 1] の範囲', () => {
      const p = EARTH_ATMOSPHERE_OCEAN_PARAMS;
      expect(p.surfaceAlbedoFraction).toBeGreaterThanOrEqual(0);
      expect(p.surfaceAlbedoFraction).toBeLessThanOrEqual(1);
      expect(p.cloudAlbedoFraction).toBeGreaterThanOrEqual(0);
      expect(p.cloudAlbedoFraction).toBeLessThanOrEqual(1);
      expect(p.oceanCoverageFraction).toBeGreaterThanOrEqual(0);
      expect(p.oceanCoverageFraction).toBeLessThanOrEqual(1);
    });

    it('温室効果・熱輸送は無次元相対値（地球で 1.0）', () => {
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.greenhouseStrengthRelative).toBe(1.0);
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.meridionalHeatTransportRelative).toBe(1.0);
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.zonalHeatTransportRelative).toBe(1.0);
    });

    it('気温減率は Pasta 既定 4.46 °C/km（docs/spec/05_気温.md §4.3）', () => {
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.lapseRateCelsiusPerKm).toBe(4.46);
    });

    it('地球の海洋被覆率はおよそ 0.71（NASA Earth Fact Sheet）', () => {
      expect(EARTH_ATMOSPHERE_OCEAN_PARAMS.oceanCoverageFraction).toBeCloseTo(0.71, 2);
    });
  });

  describe('TerrainSource の tagged union（要件定義書 §4.2）', () => {
    it('地球プリセットは preset バリアント', () => {
      expect(EARTH_TERRAIN_SOURCE.kind).toBe('preset');
      if (EARTH_TERRAIN_SOURCE.kind === 'preset') {
        expect(EARTH_TERRAIN_SOURCE.presetId).toBe('earth');
      }
    });

    it('procedural / custom バリアントを型として構成できる', () => {
      const procedural: TerrainSource = {
        kind: 'procedural',
        seed: 42,
        landFraction: 0.3,
      };
      const custom: TerrainSource = {
        kind: 'custom',
        resourceId: 'user-upload-001',
      };
      expect(procedural.kind).toBe('procedural');
      expect(custom.kind).toBe('custom');
      if (procedural.kind === 'procedural') {
        expect(procedural.seed).toBe(42);
        expect(procedural.landFraction).toBeCloseTo(0.3, 12);
      }
      if (custom.kind === 'custom') {
        expect(custom.resourceId).toBe('user-upload-001');
      }
    });

    it('kind の網羅性が型レベルで担保される（exhaustiveness）', () => {
      const describeSource = (source: TerrainSource): string => {
        switch (source.kind) {
          case 'preset':
            return `preset:${source.presetId}`;
          case 'procedural':
            return `procedural:${source.seed}/${source.landFraction}`;
          case 'custom':
            return `custom:${source.resourceId}`;
        }
      };
      expect(describeSource(EARTH_TERRAIN_SOURCE)).toBe('preset:earth');
    });
  });

  describe('決定性（要件定義書 §3.2 信頼性）', () => {
    it('プリセット定数は同一参照（凍結されたシングルトン的扱い）', () => {
      const a: PlanetParams = EARTH_PLANET_PARAMS;
      const b: PlanetParams = EARTH_PLANET_PARAMS;
      expect(a).toBe(b);
      expect(a.orbital).toBe(b.orbital);
    });
  });
});

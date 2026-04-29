import { beforeEach, describe, expect, it } from 'vitest';
import { EARTH_PLANET_PARAMS } from '@/domain';
import { DEFAULT_ITCZ_STEP_PARAMS } from '@/sim/01_itcz';
import { createParamsStore, type ParamsStore } from '@/store/params';

describe('store/params: パラメータ store', () => {
  let store: ReturnType<typeof createParamsStore>;
  let s: () => ParamsStore;

  beforeEach(() => {
    store = createParamsStore();
    s = () => store.getState();
  });

  describe('初期状態', () => {
    it('地球プリセット（軌道・本体・大気海洋）+ 仮想大陸地形 + デフォルト ITCZ パラメータで初期化される', () => {
      // 軌道・本体・大気海洋は EARTH プリセットそのまま
      expect(s().planet.orbital).toEqual(EARTH_PLANET_PARAMS.orbital);
      expect(s().planet.body).toEqual(EARTH_PLANET_PARAMS.body);
      expect(s().planet.atmosphereOcean).toEqual(EARTH_PLANET_PARAMS.atmosphereOcean);
      // 地形は ITCZ デモ用に仮想大陸に上書き
      expect(s().planet.terrain).toEqual({
        kind: 'preset',
        presetId: 'idealized_continent',
      });
      expect(s().itczParams).toEqual(DEFAULT_ITCZ_STEP_PARAMS);
    });
  });

  describe('部分更新アクション', () => {
    it('setOrbital は orbital サブツリーのみを更新し、他を維持する', () => {
      const before = s().planet;
      s().setOrbital({ eccentricity: 0.5 });
      const after = s().planet;
      expect(after.orbital.eccentricity).toBe(0.5);
      // 他の orbital フィールドは維持される
      expect(after.orbital.semiMajorAxisAU).toBe(before.orbital.semiMajorAxisAU);
      // body / atmosphereOcean / terrain は同一参照
      expect(after.body).toBe(before.body);
      expect(after.atmosphereOcean).toBe(before.atmosphereOcean);
      expect(after.terrain).toBe(before.terrain);
    });

    it('setBody は body サブツリーのみを更新する', () => {
      s().setBody({ axialTiltDeg: 45 });
      expect(s().planet.body.axialTiltDeg).toBe(45);
      expect(s().planet.body.radiusKm).toBe(EARTH_PLANET_PARAMS.body.radiusKm);
    });

    it('setAtmosphereOcean は atmosphereOcean サブツリーのみを更新する', () => {
      s().setAtmosphereOcean({ surfacePressureHpa: 500 });
      expect(s().planet.atmosphereOcean.surfacePressureHpa).toBe(500);
      expect(s().planet.atmosphereOcean.lapseRateCelsiusPerKm).toBe(
        EARTH_PLANET_PARAMS.atmosphereOcean.lapseRateCelsiusPerKm,
      );
    });

    it('setTerrain は terrain を全置換する', () => {
      s().setTerrain({ kind: 'procedural', seed: 42, landFraction: 0.3 });
      expect(s().planet.terrain).toEqual({
        kind: 'procedural',
        seed: 42,
        landFraction: 0.3,
      });
    });

    it('setITCZParams は itczParams のみを更新する', () => {
      s().setITCZParams({ baseInfluenceHalfWidthDeg: 20 });
      expect(s().itczParams.baseInfluenceHalfWidthDeg).toBe(20);
      expect(s().itczParams.smoothingWindowDeg).toBe(
        DEFAULT_ITCZ_STEP_PARAMS.smoothingWindowDeg,
      );
    });
  });

  describe('reset', () => {
    it('複数フィールドを変更後 reset で初期状態（軌道・本体・大気海洋は地球、地形は仮想大陸）に戻る', () => {
      s().setOrbital({ eccentricity: 0.5 });
      s().setBody({ axialTiltDeg: 45 });
      s().setITCZParams({ baseInfluenceHalfWidthDeg: 20 });
      s().reset();
      expect(s().planet.orbital).toEqual(EARTH_PLANET_PARAMS.orbital);
      expect(s().planet.body).toEqual(EARTH_PLANET_PARAMS.body);
      expect(s().planet.atmosphereOcean).toEqual(EARTH_PLANET_PARAMS.atmosphereOcean);
      expect(s().planet.terrain).toEqual({
        kind: 'preset',
        presetId: 'idealized_continent',
      });
      expect(s().itczParams).toEqual(DEFAULT_ITCZ_STEP_PARAMS);
    });
  });

  describe('購読', () => {
    it('subscribe は state 変更で発火する', () => {
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls++;
      });
      s().setOrbital({ eccentricity: 0.5 });
      s().setBody({ axialTiltDeg: 30 });
      unsubscribe();
      s().setOrbital({ eccentricity: 0.1 });
      expect(calls).toBe(2);
    });
  });
});

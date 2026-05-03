import { describe, expect, it } from 'vitest';
import {
  applySnapshot,
  isValidSnapshot,
  serializeParams,
  type ParamsSnapshot,
} from '@/store/settingsIo';
import { createParamsStore } from '@/store/params';

describe('store/settingsIo', () => {
  describe('serializeParams', () => {
    it('現在の params 状態を ParamsSnapshot として返す', () => {
      const store = createParamsStore();
      const snapshot = serializeParams(store.getState());
      expect(snapshot.version).toBe(1);
      expect(snapshot.app).toBe('exoclim');
      expect(typeof snapshot.exportedAt).toBe('string');
      expect(snapshot.params.planet).toBeDefined();
      expect(snapshot.params.itczParams).toBeDefined();
    });
  });

  describe('isValidSnapshot', () => {
    it('正しい snapshot は true', () => {
      const valid: ParamsSnapshot = {
        version: 1,
        app: 'exoclim',
        exportedAt: '2026-05-04T00:00:00Z',
        params: {
          planet: {},
          itczParams: {},
          windBeltParams: {},
          oceanCurrentParams: {},
          airflowParams: {},
          temperatureParams: {},
          precipitationParams: {},
          climateZoneParams: {},
        },
      };
      expect(isValidSnapshot(valid)).toBe(true);
    });

    it('app 不一致は false', () => {
      expect(isValidSnapshot({ app: 'other', version: 1, params: {} })).toBe(false);
    });

    it('version 不一致は false', () => {
      expect(isValidSnapshot({ app: 'exoclim', version: 2, params: {} })).toBe(false);
    });

    it('params 欠落は false', () => {
      expect(isValidSnapshot({ app: 'exoclim', version: 1 })).toBe(false);
    });

    it('null / 非オブジェクトは false', () => {
      expect(isValidSnapshot(null)).toBe(false);
      expect(isValidSnapshot('string')).toBe(false);
      expect(isValidSnapshot(42)).toBe(false);
    });
  });

  describe('applySnapshot', () => {
    it('snapshot を新規 store に適用すると params が反映される', () => {
      const sourceStore = createParamsStore();
      // 元 store でいくつかのパラメータを変える
      sourceStore.getState().setBody({ axialTiltDeg: 45 });
      sourceStore.getState().setITCZParams({ baseInfluenceHalfWidthDeg: 25 });
      const snapshot = serializeParams(sourceStore.getState());

      const targetStore = createParamsStore();
      applySnapshot(targetStore, snapshot);

      expect(targetStore.getState().planet.body.axialTiltDeg).toBe(45);
      expect(targetStore.getState().itczParams.baseInfluenceHalfWidthDeg).toBe(25);
    });

    it('reset → 反映 の順なので、snapshot 由来のフィールドのみ書き戻される', () => {
      const targetStore = createParamsStore();
      // 事前変更
      targetStore.getState().setBody({ axialTiltDeg: 80 });
      // snapshot は body axial=23.5（新規 store の既定値）
      const fresh = createParamsStore();
      const snapshot = serializeParams(fresh.getState());
      applySnapshot(targetStore, snapshot);
      // 既定値（地球プリセット）に戻る。EARTH_BODY_PARAMS.axialTiltDeg ≈ 23.44
      expect(targetStore.getState().planet.body.axialTiltDeg).toBeCloseTo(23.44, 1);
    });
  });
});

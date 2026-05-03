import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applySnapshot,
  clearParamsLocalStorage,
  isValidSnapshot,
  loadParamsFromLocalStorage,
  PARAMS_LOCAL_STORAGE_KEY,
  saveParamsToLocalStorage,
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

  describe('localStorage 自動保存 ([P4-64])', () => {
    // node 環境には window がないので localStorage を mock する
    beforeEach(() => {
      const storage = new Map<string, string>();
      (globalThis as unknown as { window: unknown }).window = {
        localStorage: {
          getItem: (k: string) => storage.get(k) ?? null,
          setItem: (k: string, v: string) => {
            storage.set(k, v);
          },
          removeItem: (k: string) => {
            storage.delete(k);
          },
        },
      };
      clearParamsLocalStorage();
    });
    afterEach(() => {
      clearParamsLocalStorage();
      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it('保存 → 読み込みでラウンドトリップ可能', () => {
      const store = createParamsStore();
      store.getState().setBody({ axialTiltDeg: 45 });
      const original = serializeParams(store.getState());
      saveParamsToLocalStorage(original);
      const loaded = loadParamsFromLocalStorage();
      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe(1);
      expect(loaded?.app).toBe('exoclim');
      const planet = loaded!.params.planet as { body?: { axialTiltDeg?: number } };
      expect(planet?.body?.axialTiltDeg).toBe(45);
    });

    it('未保存の状態では loadParamsFromLocalStorage が null を返す', () => {
      expect(loadParamsFromLocalStorage()).toBeNull();
    });

    it('clearParamsLocalStorage で削除される', () => {
      const store = createParamsStore();
      saveParamsToLocalStorage(serializeParams(store.getState()));
      expect(loadParamsFromLocalStorage()).not.toBeNull();
      clearParamsLocalStorage();
      expect(loadParamsFromLocalStorage()).toBeNull();
    });

    it('localStorage 直接設定の不正 JSON は null を返す（壊れない）', () => {
      window.localStorage.setItem(PARAMS_LOCAL_STORAGE_KEY, 'not-json');
      expect(loadParamsFromLocalStorage()).toBeNull();
    });

    it('localStorage 直接設定の app != exoclim は null を返す', () => {
      window.localStorage.setItem(
        PARAMS_LOCAL_STORAGE_KEY,
        JSON.stringify({ version: 1, app: 'other', params: {} }),
      );
      expect(loadParamsFromLocalStorage()).toBeNull();
    });
  });
});

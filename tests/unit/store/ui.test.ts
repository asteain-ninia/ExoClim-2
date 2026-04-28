import { beforeEach, describe, expect, it } from 'vitest';
import { createUIStore } from '@/store/ui';

describe('store/ui: UI 状態 store', () => {
  let store: ReturnType<typeof createUIStore>;

  beforeEach(() => {
    store = createUIStore();
  });

  describe('初期状態', () => {
    it('currentStep = itcz / currentSeason = annual / 凡例は両方表示', () => {
      const s = store.getState();
      expect(s.currentStep).toBe('itcz');
      expect(s.currentSeason).toBe('annual');
      expect(s.legendVisibility.itczCenterLine).toBe(true);
      expect(s.legendVisibility.itczInfluenceBand).toBe(true);
    });
  });

  describe('setCurrentStep', () => {
    it('Step 識別子を切替えられる', () => {
      store.getState().setCurrentStep('temperature');
      expect(store.getState().currentStep).toBe('temperature');
    });
  });

  describe('setCurrentSeason', () => {
    it('annual / 月インデックス（0-11）の双方を受け付ける', () => {
      store.getState().setCurrentSeason(6);
      expect(store.getState().currentSeason).toBe(6);
      store.getState().setCurrentSeason('annual');
      expect(store.getState().currentSeason).toBe('annual');
    });
  });

  describe('setLegendVisibility', () => {
    it('凡例フラグを部分更新する', () => {
      store.getState().setLegendVisibility({ itczCenterLine: false });
      expect(store.getState().legendVisibility.itczCenterLine).toBe(false);
      // 他フラグは維持
      expect(store.getState().legendVisibility.itczInfluenceBand).toBe(true);
    });
  });

  describe('reset', () => {
    it('reset で初期状態に戻る', () => {
      store.getState().setCurrentStep('precipitation');
      store.getState().setCurrentSeason(3);
      store.getState().setLegendVisibility({ itczCenterLine: false });
      store.getState().reset();
      const s = store.getState();
      expect(s.currentStep).toBe('itcz');
      expect(s.currentSeason).toBe('annual');
      expect(s.legendVisibility.itczCenterLine).toBe(true);
    });
  });
});

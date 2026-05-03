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

  describe('setHoveredCell', () => {
    it('hoveredCell を設定・解除できる', () => {
      expect(store.getState().hoveredCell).toBeNull();
      store.getState().setHoveredCell({ latIndex: 30, lonIndex: 60 });
      expect(store.getState().hoveredCell).toEqual({ latIndex: 30, lonIndex: 60 });
      store.getState().setHoveredCell(null);
      expect(store.getState().hoveredCell).toBeNull();
    });
  });

  describe('reset', () => {
    it('reset で初期状態に戻る（hoveredCell / isComputing を含む）', () => {
      store.getState().setCurrentStep('precipitation');
      store.getState().setCurrentSeason(3);
      store.getState().setLegendVisibility({ itczCenterLine: false });
      store.getState().setHoveredCell({ latIndex: 10, lonIndex: 20 });
      store.getState().setIsComputing(true);
      store.getState().reset();
      const s = store.getState();
      expect(s.currentStep).toBe('itcz');
      expect(s.currentSeason).toBe('annual');
      expect(s.legendVisibility.itczCenterLine).toBe(true);
      expect(s.hoveredCell).toBeNull();
      expect(s.isComputing).toBe(false);
    });
  });

  describe('setIsComputing ([P4-34])', () => {
    it('初期値は false', () => {
      expect(store.getState().isComputing).toBe(false);
    });
    it('true / false を切替えできる', () => {
      store.getState().setIsComputing(true);
      expect(store.getState().isComputing).toBe(true);
      store.getState().setIsComputing(false);
      expect(store.getState().isComputing).toBe(false);
    });
  });

  describe('setAdvancedMode ([P4-43])', () => {
    it('初期値は false（初心者向けに UI を簡潔に保つ）', () => {
      expect(store.getState().advancedMode).toBe(false);
    });
    it('true / false を切替えできる', () => {
      store.getState().setAdvancedMode(true);
      expect(store.getState().advancedMode).toBe(true);
      store.getState().setAdvancedMode(false);
      expect(store.getState().advancedMode).toBe(false);
    });
    it('reset で false に戻る', () => {
      store.getState().setAdvancedMode(true);
      store.getState().reset();
      expect(store.getState().advancedMode).toBe(false);
    });
  });

  describe('setTheme ([P4-45])', () => {
    it('初期値は dark', () => {
      expect(store.getState().theme).toBe('dark');
    });
    it('light / dark を切替えできる', () => {
      store.getState().setTheme('light');
      expect(store.getState().theme).toBe('light');
      store.getState().setTheme('dark');
      expect(store.getState().theme).toBe('dark');
    });
    it('reset で dark に戻る', () => {
      store.getState().setTheme('light');
      store.getState().reset();
      expect(store.getState().theme).toBe('dark');
    });
  });

  describe('panOffsetPx / setPanOffsetPx / panBy ([P4-62])', () => {
    it('初期値は 0', () => {
      expect(store.getState().panOffsetPx).toBe(0);
    });
    it('setPanOffsetPx で絶対値を設定', () => {
      store.getState().setPanOffsetPx(100);
      expect(store.getState().panOffsetPx).toBe(100);
      store.getState().setPanOffsetPx(-50);
      expect(store.getState().panOffsetPx).toBe(-50);
    });
    it('panBy で相対値を加算（負も扱える）', () => {
      store.getState().setPanOffsetPx(100);
      store.getState().panBy(35);
      expect(store.getState().panOffsetPx).toBe(135);
      store.getState().panBy(-200);
      expect(store.getState().panOffsetPx).toBe(-65);
    });
    it('reset で 0 に戻る', () => {
      store.getState().setPanOffsetPx(500);
      store.getState().reset();
      expect(store.getState().panOffsetPx).toBe(0);
    });
  });
});

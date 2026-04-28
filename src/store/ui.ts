// 状態層 ui store。マップ表示中の Step・季節位相・凡例切替などを保持する。
// 仕様: [要件定義書.md §5.4]「UI 状態 store。永続化対象外」 / [§2.3.1] [§2.3.2]。
// 規約: 永続化対象外。アプリ起動時に既定値で初期化する。

import { create } from 'zustand';

/** マップ表示中の Step 識別子（[要件定義書.md §2.3.1]）。 */
export type CurrentStepView =
  | 'itcz'
  | 'wind_belt'
  | 'ocean_current'
  | 'airflow'
  | 'temperature'
  | 'precipitation'
  | 'climate_zone';

/**
 * 季節位相の表示選択。
 * 'annual' は年平均、0〜11 は月インデックス（[Months12]）。
 */
export type SeasonPhaseView = 'annual' | number;

/**
 * 凡例・補助線の表示／非表示フラグ集合（[要件定義書.md §2.3.2]）。
 * Step 1 ITCZ 関連のみ初稿。Step 2〜7 連結時に項目を追加する。
 */
export interface LegendVisibility {
  readonly itczCenterLine: boolean;
  readonly itczInfluenceBand: boolean;
}

export interface UIState {
  readonly currentStep: CurrentStepView;
  readonly currentSeason: SeasonPhaseView;
  readonly legendVisibility: LegendVisibility;
}

export interface UIActions {
  readonly setCurrentStep: (step: CurrentStepView) => void;
  readonly setCurrentSeason: (season: SeasonPhaseView) => void;
  /** 凡例フラグを部分更新する。 */
  readonly setLegendVisibility: (patch: Partial<LegendVisibility>) => void;
  readonly reset: () => void;
}

export type UIStore = UIState & UIActions;

const INITIAL_UI_STATE: UIState = {
  currentStep: 'itcz',
  currentSeason: 'annual',
  legendVisibility: {
    itczCenterLine: true,
    itczInfluenceBand: true,
  },
};

export const createUIStore = () =>
  create<UIStore>((set) => ({
    ...INITIAL_UI_STATE,
    setCurrentStep: (currentStep) => set({ currentStep }),
    setCurrentSeason: (currentSeason) => set({ currentSeason }),
    setLegendVisibility: (patch) =>
      set((state) => ({
        legendVisibility: { ...state.legendVisibility, ...patch },
      })),
    reset: () => set(INITIAL_UI_STATE),
  }));

export const useUIStore = createUIStore();

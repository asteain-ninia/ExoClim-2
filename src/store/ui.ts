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
 * Step 1〜5 連結。Step 6〜7 連結時に項目を追加する。
 */
export interface LegendVisibility {
  readonly itczCenterLine: boolean;
  readonly itczInfluenceBand: boolean;
  /** Step 2 風帯の卓越風ベクトル（小さな矢印）の表示トグル。 */
  readonly windVectors: boolean;
  /** Step 3 海流の暖流（暖色）／寒流（寒色）overlay の表示トグル。 */
  readonly oceanCurrents: boolean;
  /** Step 3 海流の海氷マスクの表示トグル。 */
  readonly seaIce: boolean;
  /** Step 4 気流の最終地表風ベクトル overlay の表示トグル（ON にすると Step 2 矢印を置換）。 */
  readonly finalWindVectors: boolean;
  /** Step 4 気流の圧力 anomaly ヒートマップ表示トグル。 */
  readonly pressureAnomaly: boolean;
  /** Step 4 気流の気圧中心マーカー（H / L）表示トグル。 */
  readonly pressureCenters: boolean;
  /** Step 5 気温のヒートマップ overlay 表示トグル（青→赤）。 */
  readonly temperatureHeatmap: boolean;
  /** Step 5 気温の等温線 overlay 表示トグル（[docs/spec/05_気温.md §4.12]）。 */
  readonly isotherms: boolean;
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
    windVectors: false,    // Step 2 卓越風（既定 OFF: Step 4 final wind を既定で表示）
    oceanCurrents: true,
    seaIce: true,
    finalWindVectors: true,  // Step 4 final wind（既定 ON）
    pressureAnomaly: false,  // 圧力 anomaly ヒートマップ（既定 OFF、利用者が必要時に ON）
    pressureCenters: true,   // 気圧中心 H / L マーカー（既定 ON、地形と相関した anomaly 中心を直感化）
    temperatureHeatmap: false, // 気温ヒートマップ（既定 OFF、地形が見えなくなるため）
    isotherms: true,           // 等温線（既定 ON、地形を阻害せず温度勾配を読み取れる）
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

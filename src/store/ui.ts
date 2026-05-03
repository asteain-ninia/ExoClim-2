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
 * Step 1〜7 すべて連結済み。
 */
export interface LegendVisibility {
  readonly itczCenterLine: boolean;
  readonly itczInfluenceBand: boolean;
  /** Step 2 風帯の卓越風ベクトル（小さな矢印）の表示トグル。 */
  readonly windVectors: boolean;
  /** Step 3 海流の暖流（暖色）／寒流（寒色）overlay の表示トグル。 */
  readonly oceanCurrents: boolean;
  /** Step 3 海流のストリームライン（流線）表示トグル（[docs/spec/03_海流.md §4.1〜§4.5]）。 */
  readonly oceanStreamlines: boolean;
  /** Step 3 海流の衝突点マーカー（赤道流 / 極流）表示トグル（[docs/spec/03_海流.md §4.5 / §4.6]）。 */
  readonly collisionPoints: boolean;
  /** Step 3 海流の海氷マスクの表示トグル。 */
  readonly seaIce: boolean;
  /**
   * Step 2 風帯が出力する沿岸湧昇マスク（[docs/spec/02_風帯.md] / [src/sim/02_wind_belt.ts]）の
   * 表示トグル。寒流強化要因として可視化（[docs/spec/03_海流.md §既知の未対応事項]）。
   */
  readonly coastalUpwelling: boolean;
  /** Step 3 海流の ENSO ダイポール候補マスク（[docs/spec/03_海流.md §4.10]）の表示トグル。 */
  readonly ensoCandidateMask: boolean;
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
  /** Step 6 降水ラベル overlay 表示トグル（dry/normal/wet/very_wet の 4 階調塗り）。 */
  readonly precipitationLabels: boolean;
  /** Step 7 気候帯 overlay 表示トグル（Köppen-Geiger 配色）。 */
  readonly climateZones: boolean;
  /**
   * Step 7 Climate clash mask overlay 表示トグル（[Pasta §4.1.9]、[P4-79]）。
   * 隣接気候群レベル差 ≥ 3 の不自然な急変セルを赤いハッチで強調表示。
   * 既定 OFF（診断用、利用者が必要時に ON）。
   */
  readonly climateClash: boolean;
}

/**
 * マウスオーバー中のセル位置（grid index ベース、[要件定義書.md §2.3.5] デバッグビュー簡易版）。
 * MapCanvas が pointermove ハンドラから設定し、CellInspector が購読する。
 */
export interface HoveredCell {
  readonly latIndex: number;
  readonly lonIndex: number;
}

export interface UIState {
  readonly currentStep: CurrentStepView;
  readonly currentSeason: SeasonPhaseView;
  readonly legendVisibility: LegendVisibility;
  /** マウスオーバー中のセル。マップ外なら null。 */
  readonly hoveredCell: HoveredCell | null;
  /**
   * pipeline 計算中フラグ（[現状.md §6 U12]、P4-34 追加）。
   * connection 層が pipeline 起動/完了に応じて true/false に更新する。
   * UI 側は LoadingIndicator コンポーネントで購読してスピナー表示の判定に使う。
   */
  readonly isComputing: boolean;
  /**
   * 上級モード（[現状.md §6 U19]、P4-43 追加）。
   * `true` で全スライダー表示、`false` で `advanced` フラグ付きスライダーを非表示。
   * 既定 `false`（初心者向けに UI を簡潔に保つ）。
   */
  readonly advancedMode: boolean;
  /**
   * テーマ（[現状.md §6 U9]、P4-45 追加）。
   * 'dark' は既定の濃紺ベース、'light' は明色ベース。
   * `<ThemeToggle>` がトグルし、`<App>` の useEffect が `<html data-theme>` に
   * 反映する。localStorage に永続化される（key: 'exoclim-theme'）。
   */
  readonly theme: 'dark' | 'light';
  /**
   * Canvas の経度方向 pan offset（px、[現状.md §6 U7]、P4-62 追加）。
   * MapCanvas は内部解像度 1260 px（経度 360°）で描画し、本値分シフト。
   * マウスドラッグでも矢印キー（KeyboardShortcuts）でも更新される。
   * 永続化対象外（リロードで 0 に戻る）。
   */
  readonly panOffsetPx: number;
}

export interface UIActions {
  readonly setCurrentStep: (step: CurrentStepView) => void;
  readonly setCurrentSeason: (season: SeasonPhaseView) => void;
  /** 凡例フラグを部分更新する。 */
  readonly setLegendVisibility: (patch: Partial<LegendVisibility>) => void;
  /** マウスオーバー中のセルを設定（マップ外で null）。 */
  readonly setHoveredCell: (cell: HoveredCell | null) => void;
  /** pipeline 計算中フラグを更新する（[P4-34]）。 */
  readonly setIsComputing: (computing: boolean) => void;
  /** 上級モードを切替える（[P4-43]）。 */
  readonly setAdvancedMode: (enabled: boolean) => void;
  /** テーマを切替える（[P4-45]）。 */
  readonly setTheme: (theme: 'dark' | 'light') => void;
  /** Canvas pan offset を設定する（絶対値、[P4-62]）。 */
  readonly setPanOffsetPx: (px: number) => void;
  /** Canvas pan offset を相対値で加算する（矢印キー / ドラッグ用、[P4-62]）。 */
  readonly panBy: (deltaPx: number) => void;
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
    oceanStreamlines: true,
    collisionPoints: true,  // 衝突点（既定 ON、地形を阻害しない単発マーカー）
    seaIce: true,
    coastalUpwelling: false, // 沿岸湧昇マスク（既定 OFF、地形・海流が見えなくなるため利用者が必要時に ON）
    ensoCandidateMask: false, // ENSO ダイポール候補マスク（既定 OFF、診断的情報のため利用者が必要時に ON）
    finalWindVectors: true,  // Step 4 final wind（既定 ON）
    pressureAnomaly: false,  // 圧力 anomaly ヒートマップ（既定 OFF、利用者が必要時に ON）
    pressureCenters: true,   // 気圧中心 H / L マーカー（既定 ON、地形と相関した anomaly 中心を直感化）
    temperatureHeatmap: false, // 気温ヒートマップ（既定 OFF、地形が見えなくなるため）
    isotherms: true,           // 等温線（既定 ON、地形を阻害せず温度勾配を読み取れる）
    precipitationLabels: false, // 降水ラベル overlay（既定 OFF、地形が見えなくなるため）
    climateZones: false,        // 気候帯 overlay（既定 OFF、地形が見えなくなるため）
    climateClash: false,        // 気候 clash mask（既定 OFF、診断用）
  },
  hoveredCell: null,
  isComputing: false,
  advancedMode: false,
  theme: 'dark',
  panOffsetPx: 0,
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
    setHoveredCell: (cell) => set({ hoveredCell: cell }),
    setIsComputing: (isComputing) => set({ isComputing }),
    setAdvancedMode: (advancedMode) => set({ advancedMode }),
    setTheme: (theme) => set({ theme }),
    setPanOffsetPx: (panOffsetPx) => set({ panOffsetPx }),
    panBy: (deltaPx) => set((state) => ({ panOffsetPx: state.panOffsetPx + deltaPx })),
    reset: () => set(INITIAL_UI_STATE),
  }));

export const useUIStore = createUIStore();

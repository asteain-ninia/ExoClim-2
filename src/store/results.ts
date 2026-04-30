// 状態層 results store。ワーカー層から戻るシミュレーション結果を保持する。
// 仕様: [要件定義書.md §5.4] / [技術方針.md §2.1.4]。
// 規約: ワーカー層が PipelineOutput を更新で渡し、本 store は受信専用。
//
// 現状（P4-11）は Step 1 ITCZ + Step 2 風帯 + Step 3 海流 + Step 4 気流 + Step 5 気温 + Step 6 降水 + Step 7 気候帯を連結（全 Step 完了）。

import { create } from 'zustand';
import type {
  AirflowResult,
  ClimateZoneResult,
  Grid,
  ITCZResult,
  OceanCurrentResult,
  PrecipitationResult,
  TemperatureResult,
  WindBeltResult,
} from '@/domain';
import type { PipelineOutput } from '@/worker/pipeline';

export interface ResultsState {
  /** Step 1 ITCZ の結果。未計算なら null。 */
  readonly itcz: ITCZResult | null;
  /** Step 2 風帯の結果。未計算なら null。 */
  readonly windBelt: WindBeltResult | null;
  /** Step 3 海流の結果。未計算なら null。 */
  readonly oceanCurrent: OceanCurrentResult | null;
  /** Step 4 気流の結果。未計算なら null。 */
  readonly airflow: AirflowResult | null;
  /** Step 5 気温の結果。未計算なら null。 */
  readonly temperature: TemperatureResult | null;
  /** Step 6 降水の結果。未計算なら null。 */
  readonly precipitation: PrecipitationResult | null;
  /** Step 7 気候帯の結果。未計算なら null。 */
  readonly climateZone: ClimateZoneResult | null;
  /**
   * 直近 pipeline 実行で使われた Grid（地形含む）。UI 層が陸地・標高描画で参照する。
   * 未計算なら null。
   */
  readonly grid: Grid | null;
  /** 各 Step がキャッシュからヒットしたかのトレース（最後の pipeline 実行時点）。 */
  readonly cacheHits: {
    readonly itcz: boolean;
    readonly windBelt: boolean;
    readonly oceanCurrent: boolean;
    readonly airflow: boolean;
    readonly temperature: boolean;
    readonly precipitation: boolean;
    readonly climateZone: boolean;
  };
}

export interface ResultsActions {
  /** ワーカー層からの結果を反映する。 */
  readonly setOutput: (output: PipelineOutput) => void;
  /** pipeline 実行に使用した Grid を反映する（接続層が pipeline 起動と同期して呼ぶ）。 */
  readonly setGrid: (grid: Grid) => void;
  /** 結果を空に戻す。 */
  readonly reset: () => void;
}

export type ResultsStore = ResultsState & ResultsActions;

const INITIAL_RESULTS_STATE: ResultsState = {
  itcz: null,
  windBelt: null,
  oceanCurrent: null,
  airflow: null,
  temperature: null,
  precipitation: null,
  climateZone: null,
  grid: null,
  cacheHits: {
    itcz: false,
    windBelt: false,
    oceanCurrent: false,
    airflow: false,
    temperature: false,
    precipitation: false,
    climateZone: false,
  },
};

export const createResultsStore = () =>
  create<ResultsStore>((set) => ({
    ...INITIAL_RESULTS_STATE,
    setOutput: (output) =>
      set({
        itcz: output.itcz,
        windBelt: output.windBelt,
        oceanCurrent: output.oceanCurrent,
        airflow: output.airflow,
        temperature: output.temperature,
        precipitation: output.precipitation,
        climateZone: output.climateZone,
        cacheHits: {
          itcz: output.cacheHits.itcz,
          windBelt: output.cacheHits.windBelt,
          oceanCurrent: output.cacheHits.oceanCurrent,
          airflow: output.cacheHits.airflow,
          temperature: output.cacheHits.temperature,
          precipitation: output.cacheHits.precipitation,
          climateZone: output.cacheHits.climateZone,
        },
      }),
    setGrid: (grid) => set({ grid }),
    reset: () => set(INITIAL_RESULTS_STATE),
  }));

export const useResultsStore = createResultsStore();

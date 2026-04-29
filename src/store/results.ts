// 状態層 results store。ワーカー層から戻るシミュレーション結果を保持する。
// 仕様: [要件定義書.md §5.4] / [技術方針.md §2.1.4]。
// 規約: ワーカー層が PipelineOutput を更新で渡し、本 store は受信専用。
//
// 現状（P4-3 / P4-4）は Step 1 ITCZ のみ連結。Step 2〜7 の結果が増えるたびに本型を拡張する。

import { create } from 'zustand';
import type {
  AirflowResult,
  Grid,
  ITCZResult,
  OceanCurrentResult,
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
  grid: null,
  cacheHits: { itcz: false, windBelt: false, oceanCurrent: false, airflow: false },
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
        cacheHits: {
          itcz: output.cacheHits.itcz,
          windBelt: output.cacheHits.windBelt,
          oceanCurrent: output.cacheHits.oceanCurrent,
          airflow: output.cacheHits.airflow,
        },
      }),
    setGrid: (grid) => set({ grid }),
    reset: () => set(INITIAL_RESULTS_STATE),
  }));

export const useResultsStore = createResultsStore();

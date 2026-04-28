// ワーカー層 pipeline。計算層 Step を順に呼び、Step 単位のキャッシュで部分再計算を担う。
// 仕様:
//   - [技術方針.md §2.2] ステップ間の値渡し / [§2.2.3] 部分再計算
//   - [要件定義書.md §3.1] 性能（部分再計算経路の確保）
//   - [要件定義書.md §5.2] シミュレーションエンジン（src/worker/pipeline.ts に集約）
// 規約:
//   - 純粋関数として動作（cache を入力で受け取り、新しい cache を返す）。
//   - 各 Step は前回 inputs と deep equality で比較し、一致すればキャッシュ出力を返す。
//   - 浮動小数点数は Object.is で厳密一致（[技術方針.md §2.2.3] / [開発ガイド.md §6.1.1]）。
// 範囲（P4-3）:
//   - Step 1 ITCZ のみ連結。Step 2〜7 は P4-6 以降で順次追加。

import type { Grid, ITCZResult, PlanetParams } from '@/domain';
import type { ITCZStepParams } from '@/sim/01_itcz';
import { computeITCZ } from '@/sim/01_itcz';

import { deepEqual } from './deepEqual';

/** Step 単位のキャッシュエントリ。前回の入力と出力を保持する。 */
interface StepCacheEntry<TIn, TOut> {
  readonly inputs: TIn;
  readonly output: TOut;
}

/** Step 1 ITCZ への入力（キャッシュキーの構成要素）。 */
interface ITCZStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly params: ITCZStepParams;
}

/**
 * パイプライン全体のキャッシュ状態。
 * 現状は Step 1 のみを保持する暫定構造。Step 2〜7 は P4-6 以降で追加する。
 */
export interface PipelineCache {
  readonly itcz: StepCacheEntry<ITCZStepInputs, ITCZResult> | null;
}

/** 空のパイプラインキャッシュ。初回起動時の状態。 */
export const EMPTY_PIPELINE_CACHE: PipelineCache = {
  itcz: null,
};

/** ワーカー層 pipeline への入力。 */
export interface PipelineInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczParams: ITCZStepParams;
}

/**
 * パイプライン実行結果。
 * 現状は Step 1 ITCZ のみ。Step 2〜7 が連結されると、SimulationResult 全体に拡張される。
 */
export interface PipelineOutput {
  /** Step 1 ITCZ の結果。 */
  readonly itcz: ITCZResult;
  /** 各 Step がキャッシュからヒットしたかのトレース（[要件定義書.md §3.1] 部分再計算の検証用）。 */
  readonly cacheHits: {
    readonly itcz: boolean;
  };
}

/** Step 単位のキャッシュ取得 or 計算ヘルパ。 */
function getOrCompute<TIn, TOut>(
  prevEntry: StepCacheEntry<TIn, TOut> | null,
  inputs: TIn,
  compute: (inputs: TIn) => TOut,
): { readonly entry: StepCacheEntry<TIn, TOut>; readonly fromCache: boolean } {
  if (prevEntry && deepEqual(prevEntry.inputs, inputs)) {
    return { entry: prevEntry, fromCache: true };
  }
  const output = compute(inputs);
  return { entry: { inputs, output }, fromCache: false };
}

/**
 * パイプラインを実行し、新しいキャッシュ状態と出力を返す。
 *
 * 引数で受け取った cache を変更しない（純粋関数）。利用者は次回呼び出しで戻り値の cache を渡す。
 */
export function runPipeline(
  inputs: PipelineInputs,
  cache: PipelineCache = EMPTY_PIPELINE_CACHE,
): { readonly output: PipelineOutput; readonly cache: PipelineCache } {
  // === Step 1 ITCZ ===
  const itczInputs: ITCZStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    params: inputs.itczParams,
  };
  const itczStep = getOrCompute(
    cache.itcz,
    itczInputs,
    (i) => computeITCZ(i.planet, i.grid, i.params),
  );

  return {
    output: {
      itcz: itczStep.entry.output,
      cacheHits: { itcz: itczStep.fromCache },
    },
    cache: { itcz: itczStep.entry },
  };
}

// ワーカー層エントリポイント。
// Web Worker 上で計算層 pipeline を実行し、部分再計算を担う（[技術方針.md §2.1.3] / [§2.2.3]）。
// Worker 境界（postMessage）の glue は Phase 4-4 以降で追加する。

export { deepEqual } from './deepEqual';
export type { PipelineCache, PipelineInputs, PipelineOutput } from './pipeline';
export { EMPTY_PIPELINE_CACHE, runPipeline } from './pipeline';

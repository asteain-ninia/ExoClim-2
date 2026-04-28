/// <reference lib="webworker" />
// Web Worker エントリポイント。pipeline を Worker 上で実行する。
// 仕様: [技術方針.md §1.5] 計算層は Web Worker 上で実行 / [§2.1.3] ワーカー層責務。
// 規約: 本ファイルは Worker boundary 専用。状態層・UI 層から直接 import しない。
//   呼び出し側は {@link createWorkerPipelineBridge}（[src/worker/bridge.ts]）を経由する。

import {
  EMPTY_PIPELINE_CACHE,
  runPipeline,
  type PipelineCache,
  type PipelineInputs,
  type PipelineOutput,
} from './pipeline';

interface WorkerRequest {
  readonly id: number;
  readonly inputs: PipelineInputs;
}

interface WorkerResponse {
  readonly id: number;
  readonly output: PipelineOutput;
}

let cache: PipelineCache = EMPTY_PIPELINE_CACHE;

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, inputs } = event.data;
  const result = runPipeline(inputs, cache);
  cache = result.cache;
  const response: WorkerResponse = { id, output: result.output };
  self.postMessage(response);
});

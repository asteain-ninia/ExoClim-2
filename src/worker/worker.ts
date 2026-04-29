/// <reference lib="webworker" />
// Web Worker エントリポイント。pipeline を Worker 上で実行する。
// 仕様: [技術方針.md §1.5] 計算層は Web Worker 上で実行 / [§2.1.3] ワーカー層責務。
// 規約: 本ファイルは Worker boundary 専用。状態層・UI 層から直接 import しない。
//   呼び出し側は {@link createWorkerPipelineBridge}（[src/worker/bridge.ts]）を経由する。
//
// メッセージプロトコル:
//   inbound  WorkerGridUpdateRequest | WorkerRunRequest
//   outbound WorkerResponse
//
// Grid は postMessage の structured clone コストが大きいため、bridge 側で参照変化を
// 検出して `grid-update` で送り、本 worker 側でキャッシュする。run メッセージは
// planet と itczParams のみを含み、Grid はキャッシュから補う。

import type { Grid } from '@/domain';
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './bridge';
import {
  EMPTY_PIPELINE_CACHE,
  runPipeline,
  type PipelineCache,
  type PipelineInputs,
} from './pipeline';

let currentGrid: Grid | null = null;
let cache: PipelineCache = EMPTY_PIPELINE_CACHE;

self.addEventListener('message', (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  if (message.type === 'grid-update') {
    currentGrid = message.grid;
    return;
  }
  if (message.type === 'run') {
    if (!currentGrid) {
      // bridge は run 前に必ず grid-update を送る契約だが、安全側で no-op にする。
      return;
    }
    const inputs: PipelineInputs = {
      planet: message.planet,
      grid: currentGrid,
      itczParams: message.itczParams,
      windBeltParams: message.windBeltParams,
      oceanCurrentParams: message.oceanCurrentParams,
      airflowParams: message.airflowParams,
    };
    const result = runPipeline(inputs, cache);
    cache = result.cache;
    const response: WorkerOutboundMessage = { id: message.id, output: result.output };
    self.postMessage(response);
  }
});

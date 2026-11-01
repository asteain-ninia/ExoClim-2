/// <reference lib="webworker" />
// Web Worker エントリポイント。pipeline を Worker 上で実行する。
// 仕様: [技術方針.md §1.5] 計算層は Web Worker 上で実行 / [§2.1.3] ワーカー層責務。
// 規約: 本ファイルは Worker boundary 専用。状態層・UI 層から直接 import しない。
//   呼び出し側は {@link createWorkerPipelineBridge}（[src/worker/bridge.ts]）を経由する。
//
// メッセージプロトコル:
//   inbound  WorkerGridUpdateRequest | WorkerRunRequest
//   outbound WorkerOutboundMessage（成功 `{ id, output }` / 失敗 `{ id, error }`）
//
// Grid は postMessage の structured clone コストが大きいため、bridge 側で参照変化を
// 検出して `grid-update` で送り、Worker 側でキャッシュする。run メッセージは
// planet と各 Step パラメータのみを含み、Grid はキャッシュから補う。
// 処理本体は node 環境でテストできるよう [src/worker/workerHandler.ts] に分離している。

import type { WorkerInboundMessage } from './bridge';
import { createWorkerMessageHandler } from './workerHandler';

const handleMessage = createWorkerMessageHandler((response) => {
  self.postMessage(response);
});

self.addEventListener('message', (event: MessageEvent<WorkerInboundMessage>) => {
  handleMessage(event.data);
});

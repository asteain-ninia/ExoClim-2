// pipeline ブリッジ。Worker 経由（本番）と直接呼び出し（テスト・フォールバック）の二系統を提供する。
// 仕様: [要件定義書.md §5.4]「パラメータ store の更新を契機として、ワーカー層が部分再計算を起動」。
// 規約: bridge は cache を内包する stateful オブジェクト。dispose() で資源を解放する。
//
// テスト方針:
//   - 直接ブリッジ (createDirectPipelineBridge) は単体テストで網羅。
//   - Worker ブリッジ (createWorkerPipelineBridge) は dev サーバ上で手動確認
//     （Vitest は node 環境のため Web Worker のフルセット動作は再現困難）。

import {
  EMPTY_PIPELINE_CACHE,
  runPipeline,
  type PipelineCache,
  type PipelineInputs,
  type PipelineOutput,
} from './pipeline';

/**
 * pipeline ブリッジの統一インターフェース。
 * 状態層 store はこの interface だけに依存し、実装の選択（直接/Worker）に依らない。
 */
export interface PipelineBridge {
  /** 入力を渡し、pipeline 出力を返す。内部で cache を更新する。 */
  readonly run: (inputs: PipelineInputs) => Promise<PipelineOutput>;
  /** 内部資源を解放する。Worker は terminate、直接モードは cache をリセット。 */
  readonly dispose: () => void;
}

/**
 * 直接呼び出しブリッジ。同スレッドで {@link runPipeline} を実行する。
 * 用途: 単体・契約テスト、Web Worker 非対応環境のフォールバック。
 */
export function createDirectPipelineBridge(): PipelineBridge {
  let cache: PipelineCache = EMPTY_PIPELINE_CACHE;
  return {
    run: (inputs) => {
      const result = runPipeline(inputs, cache);
      cache = result.cache;
      return Promise.resolve(result.output);
    },
    dispose: () => {
      cache = EMPTY_PIPELINE_CACHE;
    },
  };
}

/** Worker への送信メッセージ（id でリクエスト/レスポンスを対応付ける）。 */
interface WorkerRequest {
  readonly id: number;
  readonly inputs: PipelineInputs;
}

/** Worker からの返信メッセージ。 */
interface WorkerResponse {
  readonly id: number;
  readonly output: PipelineOutput;
}

/**
 * Web Worker ブリッジ。Vite 6 の `new Worker(new URL(...), { type: 'module' })` 形式で起動する。
 * 用途: 本番アプリ。UI スレッドのブロッキング回避。
 *
 * 注意: 本関数は browser 環境を前提とする。Vitest（node 環境）では呼び出さない。
 */
export function createWorkerPipelineBridge(): PipelineBridge {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
  let nextRequestId = 0;
  const pendingRequests = new Map<number, (output: PipelineOutput) => void>();

  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const { id, output } = e.data;
    const resolver = pendingRequests.get(id);
    if (resolver) {
      pendingRequests.delete(id);
      resolver(output);
    }
  });

  return {
    run: (inputs) => {
      const id = ++nextRequestId;
      return new Promise<PipelineOutput>((resolve) => {
        pendingRequests.set(id, resolve);
        const message: WorkerRequest = { id, inputs };
        worker.postMessage(message);
      });
    },
    dispose: () => {
      worker.terminate();
      pendingRequests.clear();
    },
  };
}

// pipeline ブリッジ。Worker 経由（本番）と直接呼び出し（テスト・フォールバック）の二系統を提供する。
// 仕様: [要件定義書.md §5.4]「パラメータ store の更新を契機として、ワーカー層が部分再計算を起動」。
// 規約: bridge は cache を内包する stateful オブジェクト。dispose() で資源を解放する。
//
// テスト方針:
//   - 直接ブリッジ (createDirectPipelineBridge) は単体テストで網羅。
//   - Worker ブリッジ (createWorkerPipelineBridge) は dev サーバ上で手動確認
//     （Vitest は node 環境のため Web Worker のフルセット動作は再現困難）。

import type { Grid, PlanetParams } from '@/domain';
import type {
  AirflowStepParams,
  ITCZStepParams,
  OceanCurrentStepParams,
  PrecipitationStepParams,
  TemperatureStepParams,
  WindBeltStepParams,
} from '@/sim';
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

/**
 * Worker メッセージプロトコル。
 *
 * Grid は 1° 解像度で 64,800 セル × 5 フィールド ≈ 数 MB の重いオブジェクトのため、
 * 毎回 postMessage で structured clone するとスライダー操作で体感的に鈍くなる。
 * 本プロトコルでは Grid 参照が変化したときだけ `grid-update` を送り、Worker 側で
 * キャッシュする。通常の pipeline 実行は `run` メッセージで planet と itczParams
 * のみを送り、Grid は Worker キャッシュから復元する。
 */
interface WorkerGridUpdateRequest {
  readonly type: 'grid-update';
  readonly grid: Grid;
}

interface WorkerRunRequest {
  readonly type: 'run';
  readonly id: number;
  readonly planet: PlanetParams;
  readonly itczParams: ITCZStepParams;
  readonly windBeltParams: WindBeltStepParams;
  readonly oceanCurrentParams: OceanCurrentStepParams;
  readonly airflowParams: AirflowStepParams;
  readonly temperatureParams: TemperatureStepParams;
  readonly precipitationParams: PrecipitationStepParams;
}

export type WorkerInboundMessage = WorkerGridUpdateRequest | WorkerRunRequest;

interface WorkerResponse {
  readonly id: number;
  readonly output: PipelineOutput;
}

export type WorkerOutboundMessage = WorkerResponse;

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
  /**
   * 直近 Worker に送信した Grid 参照。新規 run 時に inputs.grid と参照比較し、
   * 同一なら再送しない（postMessage の structured clone コストを削減）。
   */
  let lastSentGrid: Grid | null = null;
  const pendingRequests = new Map<number, (output: PipelineOutput) => void>();

  worker.addEventListener('message', (e: MessageEvent<WorkerOutboundMessage>) => {
    const { id, output } = e.data;
    const resolver = pendingRequests.get(id);
    if (resolver) {
      pendingRequests.delete(id);
      resolver(output);
    }
  });

  return {
    run: (inputs) => {
      if (inputs.grid !== lastSentGrid) {
        lastSentGrid = inputs.grid;
        const gridMessage: WorkerGridUpdateRequest = {
          type: 'grid-update',
          grid: inputs.grid,
        };
        worker.postMessage(gridMessage);
      }
      const id = ++nextRequestId;
      return new Promise<PipelineOutput>((resolve) => {
        pendingRequests.set(id, resolve);
        const runMessage: WorkerRunRequest = {
          type: 'run',
          id,
          planet: inputs.planet,
          itczParams: inputs.itczParams,
          windBeltParams: inputs.windBeltParams,
          oceanCurrentParams: inputs.oceanCurrentParams,
          airflowParams: inputs.airflowParams,
          temperatureParams: inputs.temperatureParams,
          precipitationParams: inputs.precipitationParams,
        };
        worker.postMessage(runMessage);
      });
    },
    dispose: () => {
      worker.terminate();
      pendingRequests.clear();
      lastSentGrid = null;
    },
  };
}

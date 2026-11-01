// pipeline ブリッジ。Worker 経由（本番）と直接呼び出し（テスト・フォールバック）の二系統を提供する。
// 仕様: [要件定義書.md §5.4]「パラメータ store の更新を契機として、ワーカー層が部分再計算を起動」。
// 規約: bridge は cache を内包する stateful オブジェクト。dispose() で資源を解放する。
//
// テスト方針:
//   - 直接ブリッジ (createDirectPipelineBridge) は単体テストで網羅。
//   - Worker ブリッジのプロトコル処理 (createPipelineBridgeOverWorker) は偽 Worker で単体テスト。
//     実 Worker の起動 (createWorkerPipelineBridge) は dev サーバ / E2E で確認
//     （Vitest は node 環境のため Web Worker のフルセット動作は再現困難）。

import type { Grid, PlanetParams } from '@/domain';
import type {
  AirflowStepParams,
  ClimateZoneStepParams,
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
  /**
   * エラーハンドラを登録する（[現状.md §6 U20]、P4-33 追加）。
   *
   * Worker bridge: worker の `error` / `messageerror` イベント、および pipeline の
   *   実行例外を捕捉して呼ぶ。
   * 直接 bridge: runPipeline の例外を捕捉して呼ぶ。
   *
   * 戻り値はリスナー解除関数。
   */
  readonly onError: (handler: (message: string) => void) => () => void;
}

/**
 * 直接呼び出しブリッジ。同スレッドで {@link runPipeline} を実行する。
 * 用途: 単体・契約テスト、Web Worker 非対応環境のフォールバック。
 */
export function createDirectPipelineBridge(): PipelineBridge {
  let cache: PipelineCache = EMPTY_PIPELINE_CACHE;
  const errorHandlers = new Set<(message: string) => void>();
  return {
    run: (inputs) => {
      try {
        const result = runPipeline(inputs, cache);
        cache = result.cache;
        return Promise.resolve(result.output);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const h of errorHandlers) h(msg);
        return Promise.reject(e instanceof Error ? e : new Error(msg));
      }
    },
    dispose: () => {
      cache = EMPTY_PIPELINE_CACHE;
      errorHandlers.clear();
    },
    onError: (handler) => {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
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
  readonly climateZoneParams: ClimateZoneStepParams;
}

export type WorkerInboundMessage = WorkerGridUpdateRequest | WorkerRunRequest;

interface WorkerSuccessResponse {
  readonly id: number;
  readonly output: PipelineOutput;
}

/** Worker 内で pipeline が例外を投げた場合の応答。`error` は例外メッセージ。 */
interface WorkerErrorResponse {
  readonly id: number;
  readonly error: string;
}

export type WorkerOutboundMessage = WorkerSuccessResponse | WorkerErrorResponse;

/**
 * {@link createPipelineBridgeOverWorker} が必要とする Worker の最小インターフェース。
 * 本番は `Worker`、単体テストは EventTarget ベースの偽 Worker を渡す。
 */
export interface WorkerLike {
  postMessage(message: WorkerInboundMessage): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerOutboundMessage>) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(type: 'messageerror', listener: (event: MessageEvent) => void): void;
  terminate(): void;
}

interface PendingRequest {
  readonly resolve: (output: PipelineOutput) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Web Worker ブリッジ。Vite 6 の `new Worker(new URL(...), { type: 'module' })` 形式で起動する。
 * 用途: 本番アプリ。UI スレッドのブロッキング回避。
 *
 * 注意: 本関数は browser 環境を前提とする。Vitest（node 環境）では呼び出さない。
 *   プロトコル処理は {@link createPipelineBridgeOverWorker} に分離してあり、そちらを単体テストする。
 */
export function createWorkerPipelineBridge(): PipelineBridge {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
  return createPipelineBridgeOverWorker(worker);
}

/**
 * 任意の {@link WorkerLike} 上に pipeline ブリッジのプロトコルを実装する。
 *
 * エラー時の契約（未決着の Promise を残さない）:
 *   - Worker が `{ id, error }` を返したら、その要求の Promise を reject し onError を呼ぶ。
 *   - Worker の `error` / `messageerror` イベントでは、応答が来ない可能性があるため
 *     保留中の全要求を reject し onError を呼ぶ。
 *   - dispose() 時も保留中の全要求を reject する。
 * Promise が決着しないと、呼び出し側（store/connection）の single-in-flight フラグが
 * 立ったままになり、以後の再計算が一切起動しなくなる。
 */
export function createPipelineBridgeOverWorker(worker: WorkerLike): PipelineBridge {
  let nextRequestId = 0;
  /**
   * 直近 Worker に送信した Grid 参照。新規 run 時に inputs.grid と参照比較し、
   * 同一なら再送しない（postMessage の structured clone コストを削減）。
   */
  let lastSentGrid: Grid | null = null;
  const pendingRequests = new Map<number, PendingRequest>();
  const errorHandlers = new Set<(message: string) => void>();

  const fireError = (message: string): void => {
    for (const h of errorHandlers) h(message);
  };

  const rejectAllPending = (message: string): void => {
    const requests = [...pendingRequests.values()];
    pendingRequests.clear();
    for (const request of requests) request.reject(new Error(message));
  };

  worker.addEventListener('message', (e: MessageEvent<WorkerOutboundMessage>) => {
    const response = e.data;
    const request = pendingRequests.get(response.id);
    if (!request) return;
    pendingRequests.delete(response.id);
    if ('error' in response) {
      const message = `パイプライン計算エラー: ${response.error}`;
      fireError(message);
      request.reject(new Error(message));
      return;
    }
    request.resolve(response.output);
  });

  // Worker 内の未捕捉例外。message と filename / lineno を整形。
  worker.addEventListener('error', (e: ErrorEvent) => {
    const msg = e.message || 'Worker 内で未捕捉エラー';
    const message = `Worker エラー: ${msg}${e.filename ? ` (${e.filename}:${e.lineno})` : ''}`;
    fireError(message);
    rejectAllPending(message);
  });

  // postMessage の serialization 失敗（循環参照など）。どの要求への応答か特定できない。
  worker.addEventListener('messageerror', () => {
    const message = 'Worker からの応答メッセージが解読できませんでした';
    fireError(message);
    rejectAllPending(message);
  });

  return {
    run: (inputs) => {
      const id = ++nextRequestId;
      return new Promise<PipelineOutput>((resolve, reject) => {
        try {
          if (inputs.grid !== lastSentGrid) {
            const gridMessage: WorkerGridUpdateRequest = {
              type: 'grid-update',
              grid: inputs.grid,
            };
            worker.postMessage(gridMessage);
            lastSentGrid = inputs.grid;
          }
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
            climateZoneParams: inputs.climateZoneParams,
          };
          pendingRequests.set(id, { resolve, reject });
          worker.postMessage(runMessage);
        } catch (e) {
          // postMessage の structured clone 失敗（DataCloneError）など
          pendingRequests.delete(id);
          const message = `Worker への送信に失敗しました: ${e instanceof Error ? e.message : String(e)}`;
          fireError(message);
          reject(new Error(message));
        }
      });
    },
    dispose: () => {
      worker.terminate();
      rejectAllPending('pipeline ブリッジは破棄されました');
      errorHandlers.clear();
      lastSentGrid = null;
    },
    onError: (handler) => {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },
  };
}

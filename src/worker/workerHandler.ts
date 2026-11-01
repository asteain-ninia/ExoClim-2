// Worker 側メッセージ処理。worker.ts（`self` への配線のみ）から分離し、node 環境で単体テストできるようにする。
// 仕様: [技術方針.md §2.1.3] ワーカー層責務。プロトコルは [src/worker/bridge.ts] を参照。
//
// 契約: `run` 要求には必ず 1 回応答する（成功時 `{ id, output }`、失敗時 `{ id, error }`）。
//   応答が欠けると bridge 側の Promise が決着せず、UI の再計算が止まる。

import type { Grid } from '@/domain';
import type { WorkerInboundMessage, WorkerOutboundMessage } from './bridge';
import {
  EMPTY_PIPELINE_CACHE,
  runPipeline,
  type PipelineCache,
  type PipelineInputs,
} from './pipeline';

/**
 * Worker 内の状態（Grid キャッシュ・pipeline キャッシュ）を保持するメッセージハンドラを作る。
 *
 * @param post 応答の送信関数（本番は `self.postMessage`）。
 */
export function createWorkerMessageHandler(
  post: (response: WorkerOutboundMessage) => void,
): (message: WorkerInboundMessage) => void {
  let currentGrid: Grid | null = null;
  let cache: PipelineCache = EMPTY_PIPELINE_CACHE;

  return (message) => {
    if (message.type === 'grid-update') {
      currentGrid = message.grid;
      return;
    }
    if (message.type !== 'run') return;
    if (!currentGrid) {
      // bridge は run 前に必ず grid-update を送る契約だが、無応答にはせずエラーを返す。
      post({ id: message.id, error: 'Grid が未送信のまま計算要求を受け取りました' });
      return;
    }
    const inputs: PipelineInputs = {
      planet: message.planet,
      grid: currentGrid,
      itczParams: message.itczParams,
      windBeltParams: message.windBeltParams,
      oceanCurrentParams: message.oceanCurrentParams,
      airflowParams: message.airflowParams,
      temperatureParams: message.temperatureParams,
      precipitationParams: message.precipitationParams,
      climateZoneParams: message.climateZoneParams,
    };
    let result: ReturnType<typeof runPipeline>;
    try {
      result = runPipeline(inputs, cache);
    } catch (e) {
      // 例外時は cache を更新しない（前回成功時の状態を保持）。
      post({ id: message.id, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    cache = result.cache;
    post({ id: message.id, output: result.output });
  };
}

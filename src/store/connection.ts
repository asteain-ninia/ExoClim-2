// params store と results store を pipeline ブリッジで接続する。
// 仕様: [要件定義書.md §5.4]「パラメータ store の更新を契機として、ワーカー層が部分再計算を起動し、結果 store を更新する」。
// 規約:
//   - params 変更 → bridge 呼び出し → results 反映 の単方向フロー。
//   - 本モジュールは store と bridge を疎結合に繋ぐ薄い接着剤。Step 増減時は bridge 側を拡張する。

import type { StoreApi } from 'zustand';
import { createGrid, type Grid } from '@/domain';
import type { PipelineBridge } from '@/worker/bridge';
import type { PipelineInputs } from '@/worker/pipeline';
import type { ParamsStore } from './params';
import type { ResultsStore } from './results';

export interface ConnectStoresOptions {
  /** pipeline に渡す Grid（地形）。指定なしなら 1° 既定 Grid を 1 度だけ生成する。 */
  readonly grid?: Grid;
}

/**
 * params store の変更を監視し、ブリッジで pipeline を実行して results store を更新する。
 * 起動時に 1 度初期実行する（params の現在値で results を埋める）。
 *
 * @returns 解除関数 dispose を持つオブジェクト。dispose() で購読を停止する（bridge は呼び出し側が管理）。
 */
export function connectStoresToBridge(
  paramsStore: StoreApi<ParamsStore>,
  resultsStore: StoreApi<ResultsStore>,
  bridge: PipelineBridge,
  options: ConnectStoresOptions = {},
): { readonly dispose: () => void } {
  const grid = options.grid ?? createGrid(1);

  const runPipelineFromCurrentParams = async (): Promise<void> => {
    const params = paramsStore.getState();
    const inputs: PipelineInputs = {
      planet: params.planet,
      grid,
      itczParams: params.itczParams,
    };
    const output = await bridge.run(inputs);
    resultsStore.getState().setOutput(output);
  };

  // 初回実行（現在の params で results を埋める）
  void runPipelineFromCurrentParams();

  // params 変更を購読
  const unsubscribe = paramsStore.subscribe(() => {
    void runPipelineFromCurrentParams();
  });

  return { dispose: unsubscribe };
}

// params store と results store を pipeline ブリッジで接続する。
// 仕様: [要件定義書.md §5.4]「パラメータ store の更新を契機として、ワーカー層が部分再計算を起動し、結果 store を更新する」。
// 規約:
//   - params 変更 → bridge 呼び出し → results 反映 の単方向フロー。
//   - 本モジュールは store と bridge を疎結合に繋ぐ薄い接着剤。Step 増減時は bridge 側を拡張する。

import type { StoreApi } from 'zustand';
import {
  buildTerrainGrid,
  DEFAULT_GRID_RESOLUTION_DEG,
  type Grid,
  type GridResolutionDeg,
  type TerrainSource,
} from '@/domain';
import type { PipelineBridge } from '@/worker/bridge';
import { deepEqual } from '@/worker/deepEqual';
import type { PipelineInputs } from '@/worker/pipeline';
import type { NotificationsStore } from './notifications';
import type { ParamsStore } from './params';
import type { ResultsStore } from './results';

export interface ConnectStoresOptions {
  /**
   * 利用する Grid 解像度。指定なしなら {@link DEFAULT_GRID_RESOLUTION_DEG}（1°）。
   * Grid 自体は params.planet.terrain から {@link buildTerrainGrid} で都度解決する
   * （内部キャッシュで terrain 不変なら再生成しない）。
   */
  readonly resolutionDeg?: GridResolutionDeg;
  /**
   * テスト用に Grid を直接注入する経路。指定された場合は terrain 解決をスキップして固定 Grid を使う。
   * 通常の利用では指定しない。
   */
  readonly grid?: Grid;
  /**
   * notifications store。bridge エラーを toast に流すために使う（[現状.md §6 U20]、P4-33）。
   * 指定なしならエラーは console.error のみ。
   */
  readonly notificationsStore?: StoreApi<NotificationsStore>;
}

/**
 * params store の変更を監視し、ブリッジで pipeline を実行して results store を更新する。
 * 起動時に 1 度初期実行する（params の現在値で results を埋める）。
 *
 * Grid は `params.planet.terrain` から `buildTerrainGrid` で解決し、内部にキャッシュする。
 * terrain が同値なら再生成しない（地形生成は重い処理のため）。
 *
 * @returns 解除関数 dispose を持つオブジェクト。dispose() で購読を停止する（bridge は呼び出し側が管理）。
 */
export function connectStoresToBridge(
  paramsStore: StoreApi<ParamsStore>,
  resultsStore: StoreApi<ResultsStore>,
  bridge: PipelineBridge,
  options: ConnectStoresOptions = {},
): { readonly dispose: () => void } {
  const resolutionDeg = options.resolutionDeg ?? DEFAULT_GRID_RESOLUTION_DEG;

  // terrain → grid のキャッシュ。同値の terrain なら再生成しない。
  let cachedTerrainGrid: { source: TerrainSource; grid: Grid } | null = null;

  const resolveGrid = (terrain: TerrainSource): Grid => {
    if (options.grid) {
      // 注入 Grid を優先（テスト用経路）
      return options.grid;
    }
    if (cachedTerrainGrid && deepEqual(cachedTerrainGrid.source, terrain)) {
      return cachedTerrainGrid.grid;
    }
    const grid = buildTerrainGrid(terrain, resolutionDeg);
    cachedTerrainGrid = { source: terrain, grid };
    return grid;
  };

  // Single-in-flight + replay-latest パターン:
  //   - パイプラインが実行中なら新しい呼び出しは pendingDirty フラグを立てるだけ。
  //   - 実行完了時にフラグが立っていれば、最新の params で再実行する（do-while ループ）。
  //   - スライダーを高速ドラッグしても backlog が積まれず、最後の入力に追従する。
  let isRunning = false;
  let pendingDirty = false;

  const runPipelineFromCurrentParams = async (): Promise<void> => {
    if (isRunning) {
      pendingDirty = true;
      return;
    }
    isRunning = true;
    try {
      do {
        pendingDirty = false;
        const params = paramsStore.getState();
        const grid = resolveGrid(params.planet.terrain);
        resultsStore.getState().setGrid(grid);
        const inputs: PipelineInputs = {
          planet: params.planet,
          grid,
          itczParams: params.itczParams,
          windBeltParams: params.windBeltParams,
          oceanCurrentParams: params.oceanCurrentParams,
          airflowParams: params.airflowParams,
          temperatureParams: params.temperatureParams,
          precipitationParams: params.precipitationParams,
          climateZoneParams: params.climateZoneParams,
        };
        const output = await bridge.run(inputs);
        resultsStore.getState().setOutput(output);
      } while (pendingDirty);
    } finally {
      isRunning = false;
    }
  };

  // bridge のエラーを notifications store に流す
  const unsubscribeError = bridge.onError((message) => {
    if (options.notificationsStore) {
      options.notificationsStore.getState().push('error', message);
    } else {
      console.error('[bridge error]', message);
    }
  });

  // 初回実行（現在の params で results を埋める）
  void runPipelineFromCurrentParams();

  // params 変更を購読
  const unsubscribe = paramsStore.subscribe(() => {
    void runPipelineFromCurrentParams();
  });

  return {
    dispose: () => {
      unsubscribe();
      unsubscribeError();
    },
  };
}

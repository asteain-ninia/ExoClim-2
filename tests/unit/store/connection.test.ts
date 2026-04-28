import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGrid } from '@/domain';
import { connectStoresToBridge } from '@/store/connection';
import { createParamsStore } from '@/store/params';
import { createResultsStore } from '@/store/results';
import { createDirectPipelineBridge, type PipelineBridge } from '@/worker/bridge';

/** 初回実行が完了するのを待つヘルパ（直接ブリッジは microtask 1 つで完結する）。 */
const waitMicrotasks = async (n = 2): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
};

describe('store/connection: connectStoresToBridge（[要件定義書.md §5.4]）', () => {
  let paramsStore: ReturnType<typeof createParamsStore>;
  let resultsStore: ReturnType<typeof createResultsStore>;
  let bridge: PipelineBridge;
  let dispose: () => void;

  beforeEach(() => {
    paramsStore = createParamsStore();
    resultsStore = createResultsStore();
    bridge = createDirectPipelineBridge();
  });

  afterEach(() => {
    dispose?.();
    bridge.dispose();
  });

  it('初回実行で results store に Step 1 ITCZ 結果が反映される', async () => {
    const grid = createGrid(2);
    ({ dispose } = connectStoresToBridge(paramsStore, resultsStore, bridge, { grid }));
    await waitMicrotasks();
    expect(resultsStore.getState().itcz).not.toBeNull();
    expect(resultsStore.getState().itcz?.monthlyBands.length).toBe(12);
    expect(resultsStore.getState().cacheHits.itcz).toBe(false);
  });

  it('params 変更で results が再計算される', async () => {
    const grid = createGrid(2);
    ({ dispose } = connectStoresToBridge(paramsStore, resultsStore, bridge, { grid }));
    await waitMicrotasks();
    const firstResult = resultsStore.getState().itcz;

    paramsStore.getState().setBody({ axialTiltDeg: 60 });
    await waitMicrotasks();
    const secondResult = resultsStore.getState().itcz;

    expect(secondResult).not.toBeNull();
    expect(secondResult).not.toBe(firstResult);
    expect(resultsStore.getState().cacheHits.itcz).toBe(false);
  });

  it('変更を含まない再代入（同値設定）ではキャッシュヒットが results に伝わる', async () => {
    const grid = createGrid(2);
    ({ dispose } = connectStoresToBridge(paramsStore, resultsStore, bridge, { grid }));
    await waitMicrotasks();
    // 同じ値で setBody → 新しい planet 参照だが内容は同じ → bridge cache がヒット
    paramsStore
      .getState()
      .setBody({ axialTiltDeg: paramsStore.getState().planet.body.axialTiltDeg });
    await waitMicrotasks();
    expect(resultsStore.getState().cacheHits.itcz).toBe(true);
  });

  it('dispose で購読を停止し、以降の params 変更は results に伝わらない', async () => {
    const grid = createGrid(2);
    ({ dispose } = connectStoresToBridge(paramsStore, resultsStore, bridge, { grid }));
    await waitMicrotasks();
    const beforeDispose = resultsStore.getState().itcz;

    dispose();
    paramsStore.getState().setBody({ axialTiltDeg: 60 });
    await waitMicrotasks();
    expect(resultsStore.getState().itcz).toBe(beforeDispose);
  });
});

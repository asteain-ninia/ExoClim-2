import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EARTH_PLANET_PARAMS, createGrid, type PlanetParams } from '@/domain';
import { connectStoresToBridge } from '@/store/connection';
import { createNotificationsStore } from '@/store/notifications';
import { createParamsStore } from '@/store/params';
import { createResultsStore } from '@/store/results';
import { createUIStore } from '@/store/ui';
import {
  createDirectPipelineBridge,
  createPipelineBridgeOverWorker,
  type PipelineBridge,
} from '@/worker/bridge';
import type { PipelineInputs, PipelineOutput } from '@/worker/pipeline';
import { createWorkerMessageHandler } from '@/worker/workerHandler';
import { FakeWorker } from '../helpers/fakeWorker';

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

/** macrotask を挟んで Promise チェーンを流し切る。 */
const flush = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/** runPipeline が例外を投げる planet（body 欠落）。 */
const brokenPlanet = { ...EARTH_PLANET_PARAMS, body: undefined } as unknown as PlanetParams;

describe('store/connection: pipeline 失敗時の復帰（Worker エラー伝播）', () => {
  it('Worker 内で pipeline が例外 → isComputing が戻り、エラー通知され、次の params 変更で再計算される', async () => {
    const paramsStore = createParamsStore();
    const resultsStore = createResultsStore();
    const uiStore = createUIStore();
    const notificationsStore = createNotificationsStore();
    // 偽 Worker を実際の Worker 側ハンドラに非同期で接続する（本番と同じプロトコル経路）
    const worker = new FakeWorker();
    const handle = createWorkerMessageHandler((response) => {
      setTimeout(() => worker.respond(response), 0);
    });
    worker.onPost = (message) => {
      setTimeout(() => handle(message), 0);
    };
    const bridge = createPipelineBridgeOverWorker(worker);

    paramsStore.setState({ planet: brokenPlanet });
    const { dispose } = connectStoresToBridge(paramsStore, resultsStore, bridge, {
      grid: createGrid(2),
      uiStore,
      notificationsStore,
    });
    try {
      await flush();
      expect(uiStore.getState().isComputing).toBe(false);
      expect(resultsStore.getState().itcz).toBeNull();
      const notifications = notificationsStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.level).toBe('error');

      paramsStore.setState({ planet: EARTH_PLANET_PARAMS });
      await flush();
      expect(uiStore.getState().isComputing).toBe(false);
      expect(resultsStore.getState().itcz?.monthlyBands.length).toBe(12);
    } finally {
      dispose();
      bridge.dispose();
    }
  });

  it('失敗中に入った params 変更は失敗後に最新値で再実行される', async () => {
    const paramsStore = createParamsStore();
    const resultsStore = createResultsStore();
    const uiStore = createUIStore();
    const direct = createDirectPipelineBridge();
    const calls: PipelineInputs[] = [];
    let rejectFirst: ((e: Error) => void) | null = null;
    const bridge: PipelineBridge = {
      run: (inputs) => {
        calls.push(inputs);
        if (calls.length === 1) {
          return new Promise<PipelineOutput>((_, reject) => {
            rejectFirst = reject;
          });
        }
        return direct.run(inputs);
      },
      dispose: () => direct.dispose(),
      onError: (handler) => direct.onError(handler),
    };
    const { dispose } = connectStoresToBridge(paramsStore, resultsStore, bridge, {
      grid: createGrid(2),
      uiStore,
    });
    try {
      await flush(1);
      expect(calls).toHaveLength(1);
      expect(uiStore.getState().isComputing).toBe(true);
      paramsStore.getState().setBody({ axialTiltDeg: 45 });
      await flush(1);
      expect(calls).toHaveLength(1);

      rejectFirst!(new Error('boom'));
      await flush();
      expect(calls).toHaveLength(2);
      expect(calls[1]!.planet.body.axialTiltDeg).toBe(45);
      expect(uiStore.getState().isComputing).toBe(false);
      expect(resultsStore.getState().itcz).not.toBeNull();
    } finally {
      dispose();
      bridge.dispose();
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EARTH_PLANET_PARAMS, createGrid } from '@/domain';
import {
  DEFAULT_AIRFLOW_STEP_PARAMS,
  DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
  DEFAULT_ITCZ_STEP_PARAMS,
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
  DEFAULT_WIND_BELT_STEP_PARAMS,
} from '@/sim';
import {
  createDirectPipelineBridge,
  createPipelineBridgeOverWorker,
  type PipelineBridge,
} from '@/worker/bridge';
import type { PipelineInputs, PipelineOutput } from '@/worker/pipeline';
import { FakeWorker } from '../helpers/fakeWorker';

const baseInputs = (): PipelineInputs => ({
  planet: EARTH_PLANET_PARAMS,
  grid: createGrid(2),
  itczParams: DEFAULT_ITCZ_STEP_PARAMS,
  windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
  oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  airflowParams: DEFAULT_AIRFLOW_STEP_PARAMS,
  temperatureParams: DEFAULT_TEMPERATURE_STEP_PARAMS,
  precipitationParams: DEFAULT_PRECIPITATION_STEP_PARAMS,
  climateZoneParams: DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
});

describe('worker/bridge: createDirectPipelineBridge', () => {
  let bridge: PipelineBridge;

  afterEach(() => {
    bridge?.dispose();
  });

  it('初回 run で pipeline 出力を返す（cacheHits.itcz = false）', async () => {
    bridge = createDirectPipelineBridge();
    const output = await bridge.run(baseInputs());
    expect(output.itcz.monthlyBands.length).toBe(12);
    expect(output.cacheHits.itcz).toBe(false);
  });

  it('同一入力の 2 回目はキャッシュヒット（cacheHits.itcz = true、同一参照）', async () => {
    bridge = createDirectPipelineBridge();
    const inputs = baseInputs();
    const first = await bridge.run(inputs);
    const second = await bridge.run(inputs);
    expect(second.cacheHits.itcz).toBe(true);
    expect(second.itcz).toBe(first.itcz);
  });

  it('入力変更で再計算される（cacheHits.itcz = false）', async () => {
    bridge = createDirectPipelineBridge();
    const first = await bridge.run(baseInputs());
    const modified: PipelineInputs = {
      ...baseInputs(),
      planet: {
        ...EARTH_PLANET_PARAMS,
        body: { ...EARTH_PLANET_PARAMS.body, axialTiltDeg: 30 },
      },
    };
    const second = await bridge.run(modified);
    expect(second.cacheHits.itcz).toBe(false);
    expect(second.itcz).not.toBe(first.itcz);
  });

  it('dispose 後に新しい入力を渡してもキャッシュは空からスタート', async () => {
    bridge = createDirectPipelineBridge();
    const inputs = baseInputs();
    await bridge.run(inputs);
    bridge.dispose();
    const after = await bridge.run(inputs);
    // dispose で cache がリセットされたため、同じ入力でも初回扱い
    expect(after.cacheHits.itcz).toBe(false);
  });

  it('onError: handler を登録できる（[P4-33]）', () => {
    bridge = createDirectPipelineBridge();
    const unsubscribe = bridge.onError(() => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('onError: 解除関数を呼んでも例外を投げない', () => {
    bridge = createDirectPipelineBridge();
    const unsubscribe = bridge.onError(() => {});
    expect(() => unsubscribe()).not.toThrow();
    // 二重解除も安全
    expect(() => unsubscribe()).not.toThrow();
  });

  // 注: Worker 経由のエラー伝播は下の createPipelineBridgeOverWorker（偽 Worker）と
  // tests/unit/worker/workerHandler.test.ts、tests/unit/store/connection.test.ts で検証する。
});

describe('worker/bridge: createPipelineBridgeOverWorker（Worker プロトコル、偽 Worker で検証）', () => {
  const fakeOutput = { marker: 'output' } as unknown as PipelineOutput;

  it('run は grid-update → run を送り、{ id, output } 応答で resolve する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const promise = bridge.run(baseInputs());
    expect(worker.sent.map((m) => m.type)).toEqual(['grid-update', 'run']);
    worker.respond({ id: worker.lastRunId(), output: fakeOutput });
    await expect(promise).resolves.toBe(fakeOutput);
  });

  it('同一 Grid 参照なら grid-update を再送しない', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const inputs = baseInputs();
    const p1 = bridge.run(inputs);
    worker.respond({ id: worker.lastRunId(), output: fakeOutput });
    await p1;
    const p2 = bridge.run(inputs);
    worker.respond({ id: worker.lastRunId(), output: fakeOutput });
    await p2;
    expect(worker.sent.map((m) => m.type)).toEqual(['grid-update', 'run', 'run']);
  });

  it('{ id, error } 応答でその要求を reject し、onError に通知する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const onError = vi.fn();
    bridge.onError(onError);
    const promise = bridge.run(baseInputs());
    worker.respond({ id: worker.lastRunId(), error: 'boom' });
    await expect(promise).rejects.toThrow(/boom/);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatch(/boom/);

    // 失敗後も次の要求は正常に処理される
    const next = bridge.run(baseInputs());
    worker.respond({ id: worker.lastRunId(), output: fakeOutput });
    await expect(next).resolves.toBe(fakeOutput);
  });

  it('error 応答は該当 id の要求だけを reject する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const first = bridge.run(baseInputs());
    const firstId = worker.lastRunId();
    const second = bridge.run(baseInputs());
    const secondId = worker.lastRunId();
    worker.respond({ id: firstId, error: 'boom' });
    worker.respond({ id: secondId, output: fakeOutput });
    await expect(first).rejects.toThrow(/boom/);
    await expect(second).resolves.toBe(fakeOutput);
  });

  it('Worker の error イベントで保留中の全要求を reject し、onError に通知する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const onError = vi.fn();
    bridge.onError(onError);
    const first = bridge.run(baseInputs());
    const second = bridge.run(baseInputs());
    worker.emitError('uncaught', 'worker.ts', 42);
    await expect(first).rejects.toThrow(/uncaught/);
    await expect(second).rejects.toThrow(/uncaught/);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toContain('worker.ts:42');
  });

  it('Worker の messageerror イベントで保留中の全要求を reject し、onError に通知する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const onError = vi.fn();
    bridge.onError(onError);
    const promise = bridge.run(baseInputs());
    worker.emitMessageError();
    await expect(promise).rejects.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('postMessage が例外を投げたら reject し、Grid は次回再送する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const onError = vi.fn();
    bridge.onError(onError);
    worker.onPost = () => {
      throw new Error('DataCloneError');
    };
    const inputs = baseInputs();
    await expect(bridge.run(inputs)).rejects.toThrow(/DataCloneError/);
    expect(onError).toHaveBeenCalledTimes(1);

    worker.onPost = null;
    const next = bridge.run(inputs);
    expect(worker.sent.map((m) => m.type)).toEqual(['grid-update', 'run']);
    worker.respond({ id: worker.lastRunId(), output: fakeOutput });
    await expect(next).resolves.toBe(fakeOutput);
  });

  it('dispose で Worker を terminate し、保留中の要求を reject する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const promise = bridge.run(baseInputs());
    bridge.dispose();
    expect(worker.terminated).toBe(true);
    await expect(promise).rejects.toThrow();
  });

  it('応答済み / 未知 id の応答は無視する', async () => {
    const worker = new FakeWorker();
    const bridge = createPipelineBridgeOverWorker(worker);
    const promise = bridge.run(baseInputs());
    const id = worker.lastRunId();
    worker.respond({ id, output: fakeOutput });
    expect(() => worker.respond({ id, error: 'late' })).not.toThrow();
    expect(() => worker.respond({ id: 999, output: fakeOutput })).not.toThrow();
    await expect(promise).resolves.toBe(fakeOutput);
  });
});

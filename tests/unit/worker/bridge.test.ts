import { afterEach, describe, expect, it } from 'vitest';
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
  type PipelineBridge,
} from '@/worker/bridge';
import type { PipelineInputs } from '@/worker/pipeline';

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

  // 注: pipeline の実例外フローは現行の domain/sim 実装が空 grid を許容するため、
  // unit test で再現困難。実際の Worker bridge 経由のエラー伝播は dev 環境で手動確認
  // （[現状.md §6 U20] / 実装済み.md P4-33 「ユーザフィードバック反映」参照）。
});

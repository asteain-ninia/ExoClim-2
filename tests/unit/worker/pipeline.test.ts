import { describe, expect, it } from 'vitest';
import { EARTH_PLANET_PARAMS, createGrid } from '@/domain';
import {
  DEFAULT_ITCZ_STEP_PARAMS,
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  DEFAULT_WIND_BELT_STEP_PARAMS,
} from '@/sim';
import {
  EMPTY_PIPELINE_CACHE,
  runPipeline,
  type PipelineInputs,
} from '@/worker/pipeline';

const baseInputs = (): PipelineInputs => ({
  planet: EARTH_PLANET_PARAMS,
  grid: createGrid(2),
  itczParams: DEFAULT_ITCZ_STEP_PARAMS,
  windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
  oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
});

describe('worker/pipeline: runPipeline（Step 1 のみ連結 + キャッシュ骨格）', () => {
  describe('基本動作', () => {
    it('空キャッシュからの初回呼び出しで Step 1 ITCZ を計算する', () => {
      const { output, cache } = runPipeline(baseInputs(), EMPTY_PIPELINE_CACHE);
      expect(output.itcz.monthlyBands.length).toBe(12);
      expect(output.cacheHits.itcz).toBe(false);
      expect(cache.itcz).not.toBeNull();
    });

    it('EMPTY_PIPELINE_CACHE の初期状態は itcz が null', () => {
      expect(EMPTY_PIPELINE_CACHE.itcz).toBeNull();
    });

    it('呼び出し前後で引数の cache を変更しない（純粋関数）', () => {
      const initialCache = EMPTY_PIPELINE_CACHE;
      runPipeline(baseInputs(), initialCache);
      expect(initialCache.itcz).toBeNull();
    });
  });

  describe('キャッシュヒット（[技術方針.md §2.2.3] deep equality）', () => {
    it('同一参照の入力で 2 回目はキャッシュヒット（同一参照を返す）', () => {
      const inputs = baseInputs();
      const first = runPipeline(inputs, EMPTY_PIPELINE_CACHE);
      const second = runPipeline(inputs, first.cache);
      expect(second.output.cacheHits.itcz).toBe(true);
      expect(second.output.itcz).toBe(first.output.itcz);
    });

    it('構造的に同値な新参照の入力でもキャッシュヒット', () => {
      const inputs1 = baseInputs();
      const first = runPipeline(inputs1, EMPTY_PIPELINE_CACHE);
      const inputs2: PipelineInputs = {
        planet: { ...inputs1.planet },
        grid: inputs1.grid,
        itczParams: { ...inputs1.itczParams },
        windBeltParams: { ...inputs1.windBeltParams },
        oceanCurrentParams: { ...inputs1.oceanCurrentParams },
      };
      const second = runPipeline(inputs2, first.cache);
      expect(second.output.cacheHits.itcz).toBe(true);
    });

    it('Grid を再生成しても解像度が同じならキャッシュヒット（deep equality）', () => {
      const inputs1 = baseInputs();
      const first = runPipeline(inputs1, EMPTY_PIPELINE_CACHE);
      const inputs2: PipelineInputs = { ...inputs1, grid: createGrid(2) };
      const second = runPipeline(inputs2, first.cache);
      expect(second.output.cacheHits.itcz).toBe(true);
    });
  });

  describe('キャッシュミス（入力変化）', () => {
    it('axialTiltDeg を変えるとミスして再計算する', () => {
      const inputs1 = baseInputs();
      const first = runPipeline(inputs1, EMPTY_PIPELINE_CACHE);
      const inputs2: PipelineInputs = {
        ...inputs1,
        planet: {
          ...inputs1.planet,
          body: { ...inputs1.planet.body, axialTiltDeg: 30 },
        },
      };
      const second = runPipeline(inputs2, first.cache);
      expect(second.output.cacheHits.itcz).toBe(false);
      expect(second.output.itcz).not.toBe(first.output.itcz);
    });

    it('itczParams.smoothingWindowDeg を変えるとミスする', () => {
      const inputs1 = baseInputs();
      const first = runPipeline(inputs1, EMPTY_PIPELINE_CACHE);
      const inputs2: PipelineInputs = {
        ...inputs1,
        itczParams: { ...inputs1.itczParams, smoothingWindowDeg: 60 },
      };
      const second = runPipeline(inputs2, first.cache);
      expect(second.output.cacheHits.itcz).toBe(false);
    });

    it('Grid 解像度を変えるとミスする', () => {
      const inputs1 = baseInputs();
      const first = runPipeline(inputs1, EMPTY_PIPELINE_CACHE);
      const inputs2: PipelineInputs = { ...inputs1, grid: createGrid(1) };
      const second = runPipeline(inputs2, first.cache);
      expect(second.output.cacheHits.itcz).toBe(false);
    });
  });

  describe('決定性（[要件定義書.md §3.2]）', () => {
    it('同一入力で 2 つの独立した呼び出しが同値の出力を返す', () => {
      const inputs = baseInputs();
      const a = runPipeline(inputs, EMPTY_PIPELINE_CACHE);
      const b = runPipeline(inputs, EMPTY_PIPELINE_CACHE);
      expect(a.output.itcz).toEqual(b.output.itcz);
    });
  });

  describe('Step 1 内容の妥当性（pipeline 経由でも computeITCZ と同等）', () => {
    it('pipeline.itcz は computeITCZ の戻り値と同値', async () => {
      const { computeITCZ } = await import('@/sim/01_itcz');
      const inputs = baseInputs();
      const direct = computeITCZ(inputs.planet, inputs.grid, inputs.itczParams);
      const piped = runPipeline(inputs, EMPTY_PIPELINE_CACHE);
      expect(piped.output.itcz).toEqual(direct);
    });
  });
});

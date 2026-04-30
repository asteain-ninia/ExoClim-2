import { beforeEach, describe, expect, it } from 'vitest';
import { EARTH_PLANET_PARAMS, createGrid } from '@/domain';
import {
  DEFAULT_AIRFLOW_STEP_PARAMS,
  DEFAULT_ITCZ_STEP_PARAMS,
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
  DEFAULT_WIND_BELT_STEP_PARAMS,
} from '@/sim';
import { createResultsStore } from '@/store/results';
import { EMPTY_PIPELINE_CACHE, runPipeline } from '@/worker/pipeline';

describe('store/results: 結果 store', () => {
  let store: ReturnType<typeof createResultsStore>;

  beforeEach(() => {
    store = createResultsStore();
  });

  describe('初期状態', () => {
    it('itcz は null、cacheHits は { itcz: false }', () => {
      const state = store.getState();
      expect(state.itcz).toBeNull();
      expect(state.cacheHits.itcz).toBe(false);
    });
  });

  describe('setOutput', () => {
    it('PipelineOutput を受けて itcz と cacheHits を更新する', () => {
      const { output } = runPipeline(
        {
          planet: EARTH_PLANET_PARAMS,
          grid: createGrid(2),
          itczParams: DEFAULT_ITCZ_STEP_PARAMS,
          windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
          oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
          airflowParams: DEFAULT_AIRFLOW_STEP_PARAMS,
          temperatureParams: DEFAULT_TEMPERATURE_STEP_PARAMS,
          precipitationParams: DEFAULT_PRECIPITATION_STEP_PARAMS,
        },
        EMPTY_PIPELINE_CACHE,
      );
      store.getState().setOutput(output);
      expect(store.getState().itcz).toBe(output.itcz);
      expect(store.getState().cacheHits.itcz).toBe(false);
    });

    it('2 回目以降の setOutput でキャッシュヒット情報が更新される', () => {
      const inputs = {
        planet: EARTH_PLANET_PARAMS,
        grid: createGrid(2),
        itczParams: DEFAULT_ITCZ_STEP_PARAMS,
        windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
        oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
        airflowParams: DEFAULT_AIRFLOW_STEP_PARAMS,
        temperatureParams: DEFAULT_TEMPERATURE_STEP_PARAMS,
        precipitationParams: DEFAULT_PRECIPITATION_STEP_PARAMS,
      };
      const first = runPipeline(inputs, EMPTY_PIPELINE_CACHE);
      const second = runPipeline(inputs, first.cache);
      store.getState().setOutput(second.output);
      expect(store.getState().cacheHits.itcz).toBe(true);
    });
  });

  describe('reset', () => {
    it('reset で初期状態に戻る', () => {
      const { output } = runPipeline(
        {
          planet: EARTH_PLANET_PARAMS,
          grid: createGrid(2),
          itczParams: DEFAULT_ITCZ_STEP_PARAMS,
          windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
          oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
          airflowParams: DEFAULT_AIRFLOW_STEP_PARAMS,
          temperatureParams: DEFAULT_TEMPERATURE_STEP_PARAMS,
          precipitationParams: DEFAULT_PRECIPITATION_STEP_PARAMS,
        },
        EMPTY_PIPELINE_CACHE,
      );
      store.getState().setOutput(output);
      store.getState().reset();
      expect(store.getState().itcz).toBeNull();
      expect(store.getState().cacheHits.itcz).toBe(false);
    });
  });
});

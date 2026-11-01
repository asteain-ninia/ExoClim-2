import { describe, expect, it } from 'vitest';
import { EARTH_PLANET_PARAMS, createGrid, type PlanetParams } from '@/domain';
import {
  DEFAULT_AIRFLOW_STEP_PARAMS,
  DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
  DEFAULT_ITCZ_STEP_PARAMS,
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  DEFAULT_PRECIPITATION_STEP_PARAMS,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
  DEFAULT_WIND_BELT_STEP_PARAMS,
} from '@/sim';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/worker/bridge';
import { createWorkerMessageHandler } from '@/worker/workerHandler';

const runMessage = (id: number, planet: PlanetParams = EARTH_PLANET_PARAMS): WorkerInboundMessage => ({
  type: 'run',
  id,
  planet,
  itczParams: DEFAULT_ITCZ_STEP_PARAMS,
  windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
  oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  airflowParams: DEFAULT_AIRFLOW_STEP_PARAMS,
  temperatureParams: DEFAULT_TEMPERATURE_STEP_PARAMS,
  precipitationParams: DEFAULT_PRECIPITATION_STEP_PARAMS,
  climateZoneParams: DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
});

/** runPipeline が例外を投げる入力（body 欠落）。 */
const brokenPlanet = { ...EARTH_PLANET_PARAMS, body: undefined } as unknown as PlanetParams;

describe('worker/workerHandler: createWorkerMessageHandler', () => {
  it('grid-update 後の run に { id, output } で応答する', () => {
    const posted: WorkerOutboundMessage[] = [];
    const handle = createWorkerMessageHandler((r) => posted.push(r));
    handle({ type: 'grid-update', grid: createGrid(2) });
    handle(runMessage(1));
    expect(posted).toHaveLength(1);
    const response = posted[0]!;
    expect(response.id).toBe(1);
    expect('output' in response && response.output.itcz.monthlyBands.length).toBe(12);
  });

  it('runPipeline が例外を投げたら { id, error } で応答する（無応答にしない）', () => {
    const posted: WorkerOutboundMessage[] = [];
    const handle = createWorkerMessageHandler((r) => posted.push(r));
    handle({ type: 'grid-update', grid: createGrid(2) });
    expect(() => handle(runMessage(7, brokenPlanet))).not.toThrow();
    expect(posted).toHaveLength(1);
    const response = posted[0]!;
    expect(response.id).toBe(7);
    expect('error' in response && typeof response.error).toBe('string');
    expect('output' in response).toBe(false);
  });

  it('失敗後も cache は前回成功時の状態を保ち、次の要求を処理できる', () => {
    const posted: WorkerOutboundMessage[] = [];
    const handle = createWorkerMessageHandler((r) => posted.push(r));
    handle({ type: 'grid-update', grid: createGrid(2) });
    handle(runMessage(1));
    handle(runMessage(2, brokenPlanet));
    handle(runMessage(3));
    expect(posted.map((r) => r.id)).toEqual([1, 2, 3]);
    const third = posted[2]!;
    expect('output' in third && third.output.cacheHits.itcz).toBe(true);
  });

  it('Grid 未送信の run にはエラーで応答する', () => {
    const posted: WorkerOutboundMessage[] = [];
    const handle = createWorkerMessageHandler((r) => posted.push(r));
    handle(runMessage(5));
    expect(posted).toHaveLength(1);
    expect(posted[0]!.id).toBe(5);
    expect('error' in posted[0]!).toBe(true);
  });
});

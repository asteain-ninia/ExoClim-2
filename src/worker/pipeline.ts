// ワーカー層 pipeline。計算層 Step を順に呼び、Step 単位のキャッシュで部分再計算を担う。
// 仕様:
//   - [技術方針.md §2.2] ステップ間の値渡し / [§2.2.3] 部分再計算
//   - [要件定義書.md §3.1] 性能（部分再計算経路の確保）
//   - [要件定義書.md §5.2] シミュレーションエンジン（src/worker/pipeline.ts に集約）
// 規約:
//   - 純粋関数として動作（cache を入力で受け取り、新しい cache を返す）。
//   - 各 Step は前回 inputs と deep equality で比較し、一致すればキャッシュ出力を返す。
//   - 浮動小数点数は Object.is で厳密一致（[技術方針.md §2.2.3] / [開発ガイド.md §6.1.1]）。
// 範囲（P4-10 時点）:
//   - Step 1 ITCZ + Step 2 風帯 + Step 3 海流 + Step 4 気流 + Step 5 気温 + Step 6 降水を連結。Step 7 は P4-11 で追加。

import type {
  AirflowResult,
  Grid,
  ITCZResult,
  OceanCurrentResult,
  PlanetParams,
  PrecipitationResult,
  TemperatureResult,
  WindBeltResult,
} from '@/domain';
import type {
  AirflowStepParams,
  ITCZStepParams,
  OceanCurrentStepParams,
  PrecipitationStepParams,
  TemperatureStepParams,
  WindBeltStepParams,
} from '@/sim';
import {
  computeAirflow,
  computeITCZ,
  computeOceanCurrent,
  computePrecipitation,
  computeTemperature,
  computeWindBelt,
} from '@/sim';

import { deepEqual } from './deepEqual';

/** Step 単位のキャッシュエントリ。前回の入力と出力を保持する。 */
interface StepCacheEntry<TIn, TOut> {
  readonly inputs: TIn;
  readonly output: TOut;
}

/** Step 1 ITCZ への入力（キャッシュキーの構成要素）。 */
interface ITCZStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly params: ITCZStepParams;
}

/** Step 2 風帯への入力（キャッシュキーの構成要素）。 */
interface WindBeltStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczResult: ITCZResult;
  readonly params: WindBeltStepParams;
}

/** Step 3 海流への入力（キャッシュキーの構成要素）。 */
interface OceanCurrentStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczResult: ITCZResult;
  readonly windBeltResult: WindBeltResult;
  readonly params: OceanCurrentStepParams;
}

/** Step 4 気流への入力（キャッシュキーの構成要素）。 */
interface AirflowStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczResult: ITCZResult;
  readonly windBeltResult: WindBeltResult;
  readonly oceanCurrentResult: OceanCurrentResult;
  readonly params: AirflowStepParams;
}

/** Step 5 気温への入力（キャッシュキーの構成要素）。 */
interface TemperatureStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczResult: ITCZResult;
  readonly windBeltResult: WindBeltResult;
  readonly oceanCurrentResult: OceanCurrentResult;
  readonly airflowResult: AirflowResult;
  readonly params: TemperatureStepParams;
}

/** Step 6 降水への入力（キャッシュキーの構成要素）。 */
interface PrecipitationStepInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczResult: ITCZResult;
  readonly windBeltResult: WindBeltResult;
  readonly oceanCurrentResult: OceanCurrentResult;
  readonly airflowResult: AirflowResult;
  readonly temperatureResult: TemperatureResult;
  readonly params: PrecipitationStepParams;
}

/**
 * パイプライン全体のキャッシュ状態。
 * Step 7 は P4-11 で追加する。
 */
export interface PipelineCache {
  readonly itcz: StepCacheEntry<ITCZStepInputs, ITCZResult> | null;
  readonly windBelt: StepCacheEntry<WindBeltStepInputs, WindBeltResult> | null;
  readonly oceanCurrent: StepCacheEntry<OceanCurrentStepInputs, OceanCurrentResult> | null;
  readonly airflow: StepCacheEntry<AirflowStepInputs, AirflowResult> | null;
  readonly temperature: StepCacheEntry<TemperatureStepInputs, TemperatureResult> | null;
  readonly precipitation: StepCacheEntry<PrecipitationStepInputs, PrecipitationResult> | null;
}

/** 空のパイプラインキャッシュ。初回起動時の状態。 */
export const EMPTY_PIPELINE_CACHE: PipelineCache = {
  itcz: null,
  windBelt: null,
  oceanCurrent: null,
  airflow: null,
  temperature: null,
  precipitation: null,
};

/** ワーカー層 pipeline への入力。 */
export interface PipelineInputs {
  readonly planet: PlanetParams;
  readonly grid: Grid;
  readonly itczParams: ITCZStepParams;
  readonly windBeltParams: WindBeltStepParams;
  readonly oceanCurrentParams: OceanCurrentStepParams;
  readonly airflowParams: AirflowStepParams;
  readonly temperatureParams: TemperatureStepParams;
  readonly precipitationParams: PrecipitationStepParams;
}

/**
 * パイプライン実行結果。
 * 現状は Step 1〜6。Step 7 が連結されると SimulationResult 全体に拡張される。
 */
export interface PipelineOutput {
  /** Step 1 ITCZ の結果。 */
  readonly itcz: ITCZResult;
  /** Step 2 風帯の結果。 */
  readonly windBelt: WindBeltResult;
  /** Step 3 海流の結果。 */
  readonly oceanCurrent: OceanCurrentResult;
  /** Step 4 気流の結果。 */
  readonly airflow: AirflowResult;
  /** Step 5 気温の結果。 */
  readonly temperature: TemperatureResult;
  /** Step 6 降水の結果。 */
  readonly precipitation: PrecipitationResult;
  /** 各 Step がキャッシュからヒットしたかのトレース（[要件定義書.md §3.1] 部分再計算の検証用）。 */
  readonly cacheHits: {
    readonly itcz: boolean;
    readonly windBelt: boolean;
    readonly oceanCurrent: boolean;
    readonly airflow: boolean;
    readonly temperature: boolean;
    readonly precipitation: boolean;
  };
}

/** Step 単位のキャッシュ取得 or 計算ヘルパ。 */
function getOrCompute<TIn, TOut>(
  prevEntry: StepCacheEntry<TIn, TOut> | null,
  inputs: TIn,
  compute: (inputs: TIn) => TOut,
): { readonly entry: StepCacheEntry<TIn, TOut>; readonly fromCache: boolean } {
  if (prevEntry && deepEqual(prevEntry.inputs, inputs)) {
    return { entry: prevEntry, fromCache: true };
  }
  const output = compute(inputs);
  return { entry: { inputs, output }, fromCache: false };
}

/**
 * パイプラインを実行し、新しいキャッシュ状態と出力を返す。
 *
 * 引数で受け取った cache を変更しない（純粋関数）。利用者は次回呼び出しで戻り値の cache を渡す。
 *
 * 各 Step のキャッシュキーは前段の出力を含むため、前段が再計算されると後段も再計算される。
 * 前段がキャッシュヒット（同参照）なら、後段のキャッシュ判定は当該 Step 固有のパラメータの
 * 変化のみで決まる（[技術方針.md §2.2.3] 部分再計算の指針）。
 */
export function runPipeline(
  inputs: PipelineInputs,
  cache: PipelineCache = EMPTY_PIPELINE_CACHE,
): { readonly output: PipelineOutput; readonly cache: PipelineCache } {
  // === Step 1 ITCZ ===
  const itczInputs: ITCZStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    params: inputs.itczParams,
  };
  const itczStep = getOrCompute(cache.itcz, itczInputs, (i) =>
    computeITCZ(i.planet, i.grid, i.params),
  );

  // === Step 2 風帯 ===
  const windBeltInputs: WindBeltStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    itczResult: itczStep.entry.output,
    params: inputs.windBeltParams,
  };
  const windBeltStep = getOrCompute(cache.windBelt, windBeltInputs, (i) =>
    computeWindBelt(i.planet, i.grid, i.itczResult, i.params),
  );

  // === Step 3 海流 ===
  const oceanCurrentInputs: OceanCurrentStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    itczResult: itczStep.entry.output,
    windBeltResult: windBeltStep.entry.output,
    params: inputs.oceanCurrentParams,
  };
  const oceanCurrentStep = getOrCompute(cache.oceanCurrent, oceanCurrentInputs, (i) =>
    computeOceanCurrent(i.planet, i.grid, i.itczResult, i.windBeltResult, i.params),
  );

  // === Step 4 気流 ===
  const airflowInputs: AirflowStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    itczResult: itczStep.entry.output,
    windBeltResult: windBeltStep.entry.output,
    oceanCurrentResult: oceanCurrentStep.entry.output,
    params: inputs.airflowParams,
  };
  const airflowStep = getOrCompute(cache.airflow, airflowInputs, (i) =>
    computeAirflow(i.planet, i.grid, i.itczResult, i.windBeltResult, i.oceanCurrentResult, i.params),
  );

  // === Step 5 気温 ===
  const temperatureInputs: TemperatureStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    itczResult: itczStep.entry.output,
    windBeltResult: windBeltStep.entry.output,
    oceanCurrentResult: oceanCurrentStep.entry.output,
    airflowResult: airflowStep.entry.output,
    params: inputs.temperatureParams,
  };
  const temperatureStep = getOrCompute(cache.temperature, temperatureInputs, (i) =>
    computeTemperature(
      i.planet,
      i.grid,
      i.itczResult,
      i.windBeltResult,
      i.oceanCurrentResult,
      i.airflowResult,
      i.params,
    ),
  );

  // === Step 6 降水 ===
  const precipitationInputs: PrecipitationStepInputs = {
    planet: inputs.planet,
    grid: inputs.grid,
    itczResult: itczStep.entry.output,
    windBeltResult: windBeltStep.entry.output,
    oceanCurrentResult: oceanCurrentStep.entry.output,
    airflowResult: airflowStep.entry.output,
    temperatureResult: temperatureStep.entry.output,
    params: inputs.precipitationParams,
  };
  const precipitationStep = getOrCompute(cache.precipitation, precipitationInputs, (i) =>
    computePrecipitation(
      i.planet,
      i.grid,
      i.itczResult,
      i.windBeltResult,
      i.oceanCurrentResult,
      i.airflowResult,
      i.temperatureResult,
      i.params,
    ),
  );

  return {
    output: {
      itcz: itczStep.entry.output,
      windBelt: windBeltStep.entry.output,
      oceanCurrent: oceanCurrentStep.entry.output,
      airflow: airflowStep.entry.output,
      temperature: temperatureStep.entry.output,
      precipitation: precipitationStep.entry.output,
      cacheHits: {
        itcz: itczStep.fromCache,
        windBelt: windBeltStep.fromCache,
        oceanCurrent: oceanCurrentStep.fromCache,
        airflow: airflowStep.fromCache,
        temperature: temperatureStep.fromCache,
        precipitation: precipitationStep.fromCache,
      },
    },
    cache: {
      itcz: itczStep.entry,
      windBelt: windBeltStep.entry,
      oceanCurrent: oceanCurrentStep.entry,
      airflow: airflowStep.entry,
      temperature: temperatureStep.entry,
      precipitation: precipitationStep.entry,
    },
  };
}

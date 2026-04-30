// 状態層 params store。利用者が直接与えるパラメータ（PlanetParams）と
// Step 固有の調整パラメータ（現状は ITCZStepParams のみ）を保持する。
// 仕様: [要件定義書.md §5.4] / [技術方針.md §1.4 / §2.1.4]。
// 規約: ドメイン層の型を消費する。計算層・ワーカー層に依存しない。
//
// テスト用途では createParamsStore() で隔離されたインスタンスを作る。
// アプリ用途では singleton useParamsStore を購読する。

import { create } from 'zustand';
import {
  EARTH_PLANET_PARAMS,
  type AtmosphereOceanParams,
  type OrbitalParams,
  type PlanetBodyParams,
  type PlanetParams,
  type TerrainSource,
} from '@/domain';
import {
  DEFAULT_AIRFLOW_STEP_PARAMS,
  DEFAULT_ITCZ_STEP_PARAMS,
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  DEFAULT_TEMPERATURE_STEP_PARAMS,
  DEFAULT_WIND_BELT_STEP_PARAMS,
  type AirflowStepParams,
  type ITCZStepParams,
  type OceanCurrentStepParams,
  type TemperatureStepParams,
  type WindBeltStepParams,
} from '@/sim';

/**
 * アプリ初期表示で用いる地形ソース。
 * 「Earth プリセット」(`EARTH_PLANET_PARAMS.terrain` = `presetId: 'earth'`) は実地球を
 * 模した手続き生成だが、起動時のデモとしては経度方向の対称性が強い**仮想大陸**の方が
 * ITCZ の振る舞い（モンスーン引き寄せ・季節移動）が直感的に分かるため、初期表示のみ
 * 仮想大陸に上書きする。各スライダーの「↺」ボタンや個別の Earth プリセット定数は
 * そのまま実地球の値を返す（[要件定義書.md §2.5.3] 仮想大陸の検証用フィクスチャ）。
 */
const DEFAULT_INITIAL_TERRAIN: TerrainSource = {
  kind: 'preset',
  presetId: 'idealized_continent',
};

export interface ParamsState {
  readonly planet: PlanetParams;
  readonly itczParams: ITCZStepParams;
  readonly windBeltParams: WindBeltStepParams;
  readonly oceanCurrentParams: OceanCurrentStepParams;
  readonly airflowParams: AirflowStepParams;
  readonly temperatureParams: TemperatureStepParams;
}

export interface ParamsActions {
  /** 軌道パラメータを部分更新する。 */
  readonly setOrbital: (patch: Partial<OrbitalParams>) => void;
  /** 惑星本体パラメータを部分更新する。 */
  readonly setBody: (patch: Partial<PlanetBodyParams>) => void;
  /** 大気・海洋パラメータを部分更新する。 */
  readonly setAtmosphereOcean: (patch: Partial<AtmosphereOceanParams>) => void;
  /** 地形ソースを差し替える（tagged union 全体置換）。 */
  readonly setTerrain: (terrain: TerrainSource) => void;
  /** Step 1 ITCZ パラメータを部分更新する。 */
  readonly setITCZParams: (patch: Partial<ITCZStepParams>) => void;
  /** Step 2 風帯パラメータを部分更新する。 */
  readonly setWindBeltParams: (patch: Partial<WindBeltStepParams>) => void;
  /** Step 3 海流パラメータを部分更新する。 */
  readonly setOceanCurrentParams: (patch: Partial<OceanCurrentStepParams>) => void;
  /** Step 4 気流パラメータを部分更新する。 */
  readonly setAirflowParams: (patch: Partial<AirflowStepParams>) => void;
  /** Step 5 気温パラメータを部分更新する。 */
  readonly setTemperatureParams: (patch: Partial<TemperatureStepParams>) => void;
  /** 初期値（地球プリセット + デフォルト Step パラメータ）に戻す。 */
  readonly reset: () => void;
}

export type ParamsStore = ParamsState & ParamsActions;

const INITIAL_PARAMS_STATE: ParamsState = {
  planet: { ...EARTH_PLANET_PARAMS, terrain: DEFAULT_INITIAL_TERRAIN },
  itczParams: DEFAULT_ITCZ_STEP_PARAMS,
  windBeltParams: DEFAULT_WIND_BELT_STEP_PARAMS,
  oceanCurrentParams: DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  airflowParams: DEFAULT_AIRFLOW_STEP_PARAMS,
  temperatureParams: DEFAULT_TEMPERATURE_STEP_PARAMS,
};

/**
 * params store のファクトリ。テストでは隔離のため毎回呼ぶ。
 * アプリでは {@link useParamsStore} のシングルトンを使う。
 */
export const createParamsStore = () =>
  create<ParamsStore>((set) => ({
    ...INITIAL_PARAMS_STATE,
    setOrbital: (patch) =>
      set((state) => ({
        planet: { ...state.planet, orbital: { ...state.planet.orbital, ...patch } },
      })),
    setBody: (patch) =>
      set((state) => ({
        planet: { ...state.planet, body: { ...state.planet.body, ...patch } },
      })),
    setAtmosphereOcean: (patch) =>
      set((state) => ({
        planet: {
          ...state.planet,
          atmosphereOcean: { ...state.planet.atmosphereOcean, ...patch },
        },
      })),
    setTerrain: (terrain) =>
      set((state) => ({ planet: { ...state.planet, terrain } })),
    setITCZParams: (patch) =>
      set((state) => ({ itczParams: { ...state.itczParams, ...patch } })),
    setWindBeltParams: (patch) =>
      set((state) => ({ windBeltParams: { ...state.windBeltParams, ...patch } })),
    setOceanCurrentParams: (patch) =>
      set((state) => ({ oceanCurrentParams: { ...state.oceanCurrentParams, ...patch } })),
    setAirflowParams: (patch) =>
      set((state) => ({ airflowParams: { ...state.airflowParams, ...patch } })),
    setTemperatureParams: (patch) =>
      set((state) => ({ temperatureParams: { ...state.temperatureParams, ...patch } })),
    reset: () => set(INITIAL_PARAMS_STATE),
  }));

/** アプリ用 singleton。React コンポーネントから `useParamsStore((s) => s.planet)` 形式で購読。 */
export const useParamsStore = createParamsStore();

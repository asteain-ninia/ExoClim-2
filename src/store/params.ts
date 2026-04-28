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
import { DEFAULT_ITCZ_STEP_PARAMS, type ITCZStepParams } from '@/sim/01_itcz';

export interface ParamsState {
  readonly planet: PlanetParams;
  readonly itczParams: ITCZStepParams;
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
  /** 初期値（地球プリセット + デフォルト Step パラメータ）に戻す。 */
  readonly reset: () => void;
}

export type ParamsStore = ParamsState & ParamsActions;

const INITIAL_PARAMS_STATE: ParamsState = {
  planet: EARTH_PLANET_PARAMS,
  itczParams: DEFAULT_ITCZ_STEP_PARAMS,
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
    reset: () => set(INITIAL_PARAMS_STATE),
  }));

/** アプリ用 singleton。React コンポーネントから `useParamsStore((s) => s.planet)` 形式で購読。 */
export const useParamsStore = createParamsStore();

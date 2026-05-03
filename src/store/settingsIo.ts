// パラメータ store の保存形式（JSON エクスポート/インポート）。
// 仕様: [現状.md §6 U10] 設定保存・読み込み。
// 規約:
//   - schema version で互換性管理。version 1: P4-41 で導入
//   - エクスポートは params store の現在状態をスナップショット
//   - インポートは setOrbital / setBody / setAtmosphereOcean / setTerrain /
//     set*StepParams を呼び出して反映（reset() で初期化後に各 patch 適用）

import type { ParamsStore } from './params';

/** スナップショットファイル形式（現行 version 1）。 */
export interface ParamsSnapshot {
  readonly version: 1;
  readonly exportedAt: string; // ISO 8601
  readonly app: 'exoclim';
  readonly params: ParamsSnapshotPayload;
}

/** スナップショット内の params 部分。ParamsState の構造を模倣。 */
export interface ParamsSnapshotPayload {
  readonly planet: unknown; // PlanetParams（型詳細は省略）
  readonly itczParams: unknown;
  readonly windBeltParams: unknown;
  readonly oceanCurrentParams: unknown;
  readonly airflowParams: unknown;
  readonly temperatureParams: unknown;
  readonly precipitationParams: unknown;
  readonly climateZoneParams: unknown;
}

/** 現在の params store 状態を JSON snapshot として直列化する。 */
export function serializeParams(
  state: Pick<
    ParamsStore,
    | 'planet'
    | 'itczParams'
    | 'windBeltParams'
    | 'oceanCurrentParams'
    | 'airflowParams'
    | 'temperatureParams'
    | 'precipitationParams'
    | 'climateZoneParams'
  >,
): ParamsSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'exoclim',
    params: {
      planet: state.planet,
      itczParams: state.itczParams,
      windBeltParams: state.windBeltParams,
      oceanCurrentParams: state.oceanCurrentParams,
      airflowParams: state.airflowParams,
      temperatureParams: state.temperatureParams,
      precipitationParams: state.precipitationParams,
      climateZoneParams: state.climateZoneParams,
    },
  };
}

/**
 * パース済み JSON が ParamsSnapshot 形式かを最低限検証する。
 * 厳密な型検証ではなく「app=exoclim かつ version=1 かつ params オブジェクトを持つ」のみチェック。
 * 詳細な型整合性はインポート適用時に各 setter の Partial 受付で吸収する。
 */
export function isValidSnapshot(value: unknown): value is ParamsSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.app !== 'exoclim') return false;
  if (v.version !== 1) return false;
  if (typeof v.params !== 'object' || v.params === null) return false;
  return true;
}

/**
 * インポート: snapshot を params store に適用する。
 *
 * 順序: reset() で初期化 → planet 全体（orbital/body/atmosphereOcean/terrain）と各 step params
 * を Patch で適用。type-safe なフィールドのみ反映し、未知フィールドは無視（前方互換性）。
 */
export function applySnapshot(
  store: { getState: () => ParamsStore } | { setState: (s: unknown) => void; getState: () => ParamsStore },
  snapshot: ParamsSnapshot,
): void {
  const s = (store as { getState: () => ParamsStore }).getState();
  const p = snapshot.params;
  s.reset();
  // planet は orbital/body/atmosphereOcean/terrain の 4 セクション
  const planet = p.planet as
    | {
        orbital?: unknown;
        body?: unknown;
        atmosphereOcean?: unknown;
        terrain?: unknown;
      }
    | undefined;
  if (planet) {
    if (planet.orbital && typeof planet.orbital === 'object') {
      s.setOrbital(planet.orbital as Parameters<typeof s.setOrbital>[0]);
    }
    if (planet.body && typeof planet.body === 'object') {
      s.setBody(planet.body as Parameters<typeof s.setBody>[0]);
    }
    if (planet.atmosphereOcean && typeof planet.atmosphereOcean === 'object') {
      s.setAtmosphereOcean(
        planet.atmosphereOcean as Parameters<typeof s.setAtmosphereOcean>[0],
      );
    }
    if (planet.terrain && typeof planet.terrain === 'object') {
      s.setTerrain(planet.terrain as Parameters<typeof s.setTerrain>[0]);
    }
  }
  if (p.itczParams && typeof p.itczParams === 'object') {
    s.setITCZParams(p.itczParams as Parameters<typeof s.setITCZParams>[0]);
  }
  if (p.windBeltParams && typeof p.windBeltParams === 'object') {
    s.setWindBeltParams(p.windBeltParams as Parameters<typeof s.setWindBeltParams>[0]);
  }
  if (p.oceanCurrentParams && typeof p.oceanCurrentParams === 'object') {
    s.setOceanCurrentParams(
      p.oceanCurrentParams as Parameters<typeof s.setOceanCurrentParams>[0],
    );
  }
  if (p.airflowParams && typeof p.airflowParams === 'object') {
    s.setAirflowParams(p.airflowParams as Parameters<typeof s.setAirflowParams>[0]);
  }
  if (p.temperatureParams && typeof p.temperatureParams === 'object') {
    s.setTemperatureParams(p.temperatureParams as Parameters<typeof s.setTemperatureParams>[0]);
  }
  if (p.precipitationParams && typeof p.precipitationParams === 'object') {
    s.setPrecipitationParams(
      p.precipitationParams as Parameters<typeof s.setPrecipitationParams>[0],
    );
  }
  if (p.climateZoneParams && typeof p.climateZoneParams === 'object') {
    s.setClimateZoneParams(
      p.climateZoneParams as Parameters<typeof s.setClimateZoneParams>[0],
    );
  }
}

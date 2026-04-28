// 利用者が直接与える物理パラメータと地形ソースの型、ならびに地球プリセット定数。
// 仕様: [要件定義書.md §4.2] 物理パラメータ（OrbitalParams / PlanetBodyParams /
//       AtmosphereOceanParams / TerrainSource / PlanetParams）。
// 命名: [開発ガイド.md §2.2.3] 物理量の識別子には単位を含める。
// 規約: [技術方針.md §2.1.1] ドメイン層は副作用を持たず計算ロジックを含めない。
// 数値根拠:
//   - 軌道・本体: NASA Earth Fact Sheet (J2000.0)。
//   - 気温減率 4.46 °C/km・緯度等価 8°/km: [docs/spec/05_気温.md §4.3]（Pasta 値）。
//   - 温室効果・熱輸送: 地球を 1.0 とする無次元相対値（Pasta スライダーに対応）。
//   - 地表アルベドと雲アルベドの分解値は暫定（地球 Bond albedo 0.306 を経験的に分解）。
//     具体値は Phase 4 Step 5 実装時に再点検する（[docs/spec/05_気温.md §7]）。

/**
 * 主星と軌道に関する利用者入力（要件定義書 §2.1.1 / §4.2）。
 * ケプラー第三法則による派生量（年平均放射照度・季節時刻表など）は計算層が導出する。
 */
export interface OrbitalParams {
  /** 主星の光度（太陽光度を 1 とする無次元比）。 */
  readonly starLuminositySolar: number;
  /** 軌道長半径（天文単位、AU）。 */
  readonly semiMajorAxisAU: number;
  /** 公転周期（地球日）。 */
  readonly orbitalPeriodDays: number;
  /** 軌道離心率（無次元、0 ≤ e < 1）。 */
  readonly eccentricity: number;
  /** 近日点引数（度、季節非対称の位相）。 */
  readonly argumentOfPerihelionDeg: number;
}

/**
 * 自転方向（要件定義書 §2.1.2）。
 * 順行（prograde）は地球と同じ向き。逆行（retrograde）は Pasta Part VIc の異常条件で扱う。
 */
export type RotationDirection = 'prograde' | 'retrograde';

/**
 * 惑星本体の物理量に関する利用者入力（要件定義書 §2.1.2 / §4.2）。
 */
export interface PlanetBodyParams {
  /** 平均半径（キロメートル）。 */
  readonly radiusKm: number;
  /** 自転周期（時間、恒星時基準）。 */
  readonly rotationPeriodHours: number;
  /** 地軸傾斜（度、軌道面に対する傾き、範囲 [0, 180]）。 */
  readonly axialTiltDeg: number;
  /** 自転方向（順行 / 逆行）。 */
  readonly rotationDirection: RotationDirection;
  /** 表面重力（m/s^2）。 */
  readonly surfaceGravityMps2: number;
}

/**
 * 大気と海洋のマクロパラメータに関する利用者入力（要件定義書 §2.1.3 / §4.2）。
 *
 * 温室効果強度・南北熱輸送・東西熱輸送は地球を 1.0 とする無次元相対値で扱う。
 * Pasta が提示するスライダー粒度に合わせるため、過細分化と過集約の双方を避ける（§2.1.3 規約）。
 */
export interface AtmosphereOceanParams {
  /** 表面気圧（ヘクトパスカル）。 */
  readonly surfacePressureHpa: number;
  /** 温室効果強度（地球を 1.0 とする無次元相対値）。 */
  readonly greenhouseStrengthRelative: number;
  /** 地表アルベド（無次元、範囲 [0, 1]、雲を含まない）。 */
  readonly surfaceAlbedoFraction: number;
  /** 雲アルベド（無次元、範囲 [0, 1]）。 */
  readonly cloudAlbedoFraction: number;
  /** 気温減率（°C / km）。Pasta 既定 4.46（[docs/spec/05_気温.md §4.3]）。 */
  readonly lapseRateCelsiusPerKm: number;
  /** 南北熱輸送強度（地球を 1.0 とする無次元相対値）。 */
  readonly meridionalHeatTransportRelative: number;
  /** 東西熱輸送強度（地球を 1.0 とする無次元相対値）。 */
  readonly zonalHeatTransportRelative: number;
  /** 海洋混合層深（メートル、海洋熱容量を支配する代表深）。 */
  readonly oceanMixedLayerDepthMeters: number;
  /** 海洋被覆率（無次元、範囲 [0, 1]）。 */
  readonly oceanCoverageFraction: number;
}

/**
 * 地形ソースの三形態（要件定義書 §2.1.4 / §4.2）。tagged union として表現する。
 *
 * 実体データ（標高・陸海・大陸ID マップ）は本識別子を入力にして地形前処理層が解決する。
 * 識別子のみを保持することで設定スナップショット（要件定義書 §4.4 Snapshot）を軽量に保つ。
 */
export type TerrainSource =
  | {
      readonly kind: 'preset';
      /** プリセット識別子（例: "earth"、"idealized_continent_2"）。 */
      readonly presetId: string;
    }
  | {
      readonly kind: 'procedural';
      /** 乱数種子（決定性のため整数）。 */
      readonly seed: number;
      /** 陸地被覆率（無次元、範囲 [0, 1]）。 */
      readonly landFraction: number;
    }
  | {
      readonly kind: 'custom';
      /** 取り込み済み地形データへの参照識別子。実体は別途読み込み層が解決する。 */
      readonly resourceId: string;
    };

/**
 * 利用者が直接与える全入力パラメータの集約（要件定義書 §4.2）。
 * 派生量と中間結果は本型に含めない（[技術方針.md §2.2.1] 入出力契約）。
 */
export interface PlanetParams {
  readonly orbital: OrbitalParams;
  readonly body: PlanetBodyParams;
  readonly atmosphereOcean: AtmosphereOceanParams;
  readonly terrain: TerrainSource;
}

/**
 * 地球の軌道パラメータ（NASA Earth Fact Sheet, J2000.0）。
 * 公転周期は恒星周期 365.256 日。
 */
export const EARTH_ORBITAL_PARAMS: OrbitalParams = {
  starLuminositySolar: 1.0,
  semiMajorAxisAU: 1.0,
  orbitalPeriodDays: 365.256,
  eccentricity: 0.0167,
  argumentOfPerihelionDeg: 102.947,
};

/**
 * 地球の本体パラメータ（NASA Earth Fact Sheet）。
 * 自転周期は恒星時 23.9345 時間、傾斜角は軌道面に対する 23.44°。
 */
export const EARTH_BODY_PARAMS: PlanetBodyParams = {
  radiusKm: 6371,
  rotationPeriodHours: 23.9345,
  axialTiltDeg: 23.44,
  rotationDirection: 'prograde',
  surfaceGravityMps2: 9.80665,
};

/**
 * 地球の大気・海洋パラメータ。
 * - 気温減率 4.46 °C/km は Pasta 値（[docs/spec/05_気温.md §4.3]）。
 * - アルベド分解 0.15 / 0.50 は Bond albedo 0.306 を経験的に分解した暫定値。
 *   Phase 4 Step 5 実装時に Pasta が指定する分解方式と照合して再点検する
 *   （[docs/spec/05_気温.md §7]）。
 * - 温室効果・熱輸送は地球を 1.0 とする無次元相対値で固定。
 */
export const EARTH_ATMOSPHERE_OCEAN_PARAMS: AtmosphereOceanParams = {
  surfacePressureHpa: 1013.25,
  greenhouseStrengthRelative: 1.0,
  surfaceAlbedoFraction: 0.15,
  cloudAlbedoFraction: 0.5,
  lapseRateCelsiusPerKm: 4.46,
  meridionalHeatTransportRelative: 1.0,
  zonalHeatTransportRelative: 1.0,
  oceanMixedLayerDepthMeters: 50,
  oceanCoverageFraction: 0.71,
};

/** 地球の地形ソース（プリセット参照のみ。実体マップは P4-1c 以降の地形前処理層が解決する）。 */
export const EARTH_TERRAIN_SOURCE: TerrainSource = {
  kind: 'preset',
  presetId: 'earth',
};

/**
 * 地球プリセット（要件定義書 §4.2 PlanetParams の地球版）。
 * 数値検証ハーネス（[開発ガイド.md §4.1] 地球パラメータ再現性）の基準入力に使う。
 */
export const EARTH_PLANET_PARAMS: PlanetParams = {
  orbital: EARTH_ORBITAL_PARAMS,
  body: EARTH_BODY_PARAMS,
  atmosphereOcean: EARTH_ATMOSPHERE_OCEAN_PARAMS,
  terrain: EARTH_TERRAIN_SOURCE,
};

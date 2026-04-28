// 各 Step の出力型と統合結果型 SimulationResult。
// 仕様: [要件定義書.md §4.3] シミュレーション結果の構造。
//   Step 1 ITCZ            → ITCZResult            ([docs/spec/01_ITCZ.md] §5)
//   Step 2 風帯            → WindBeltResult        ([docs/spec/02_風帯.md] §5)
//   Step 3 海流            → OceanCurrentResult    ([docs/spec/03_海流.md] §5)
//   Step 4 気流            → AirflowResult         ([docs/spec/04_気流.md] §5)
//   Step 5 気温            → TemperatureResult     ([docs/spec/05_気温.md] §5)
//   Step 6 降水            → PrecipitationResult   ([docs/spec/06_降水.md] §5)
//   Step 7 気候帯          → ClimateZoneResult     ([docs/spec/07_気候帯.md] §5)
//   統合                   → SimulationResult
// 規約: [技術方針.md §2.1.1] ドメイン層は副作用を持たず計算ロジックを含めない。
// 命名: [開発ガイド.md §2.2.3] 物理量の識別子には単位を含める。

import type { GeoPoint, GridMap, LongitudeProfile, Months12, WindVector } from './gridMap';

// ============================================================
// Step 1: ITCZ ([docs/spec/01_ITCZ.md] §5)
// ============================================================

/**
 * ITCZ 中心線と影響帯（ある経度・ある月の 1 区間）。
 * [docs/spec/01_ITCZ.md §4.4] の南北 ±15° 影響帯（西岸広め・亜熱帯高気圧近傍狭め）に対応。
 */
export interface ITCZBand {
  /** 中心緯度（度）。 */
  readonly centerLatitudeDeg: number;
  /** 影響帯南端緯度（度）。 */
  readonly southBoundLatitudeDeg: number;
  /** 影響帯北端緯度（度）。 */
  readonly northBoundLatitudeDeg: number;
}

export interface ITCZResult {
  /** 月別の ITCZ 中心線と影響帯（経度毎）。 */
  readonly monthlyBands: Months12<LongitudeProfile<ITCZBand>>;
  /** 年平均 ITCZ 中心緯度（経度毎、補助表示・検証用）。 */
  readonly annualMeanCenterLatitudeDeg: LongitudeProfile<number>;
}

// ============================================================
// Step 2: 風帯 ([docs/spec/02_風帯.md] §5)
// ============================================================

export interface WindBeltResult {
  /** 月別卓越風ベクトル場（地点別）。 */
  readonly monthlyPrevailingWind: Months12<GridMap<WindVector>>;
  /** 月別地表気圧マップ（hPa）。亜熱帯高気圧・亜寒帯低気圧・大陸季節高低気圧を含む。 */
  readonly monthlySurfacePressureHpa: Months12<GridMap<number>>;
  /** 月別の循環セル境界緯度（南→北の順、度）。 */
  readonly monthlyCellBoundariesDeg: Months12<ReadonlyArray<number>>;
  /** 月別モンスーン領域マスク（風向反転が起こる範囲）。 */
  readonly monthlyMonsoonMask: Months12<GridMap<boolean>>;
  /** 月別沿岸湧昇マスク（湧昇が発生する沿岸セル）。 */
  readonly monthlyCoastalUpwellingMask: Months12<GridMap<boolean>>;
  /**
   * ITCZ 影響帯への調整値（経度毎・月別、度）。
   * 正なら帯を広げ、負なら狭める方向。
   * [docs/spec/02_風帯.md §5] / [docs/spec/01_ITCZ.md §4.4] の Step 1 へのフィードバックに対応。
   */
  readonly itczInfluenceAdjustmentDeg: Months12<LongitudeProfile<number>>;
}

// ============================================================
// Step 3: 海流 ([docs/spec/03_海流.md] §5)
// ============================================================

/** 海流の暖流／寒流／中立分類（[docs/spec/03_海流.md §4.8]）。 */
export type CurrentClassification = 'warm' | 'cold' | 'neutral';

/** 海流の流線（点列で表現）。 */
export interface CurrentStreamline {
  readonly classification: CurrentClassification;
  /** 流線の点列（流れの順序を保つ）。 */
  readonly path: ReadonlyArray<GeoPoint>;
}

/** 海流の衝突点種別（赤道流の沿岸衝突 / 極向き流の極域衝突）。 */
export type CollisionPointType = 'equatorial_current' | 'polar_current';

export interface CollisionPoint {
  readonly type: CollisionPointType;
  readonly position: GeoPoint;
}

export interface OceanCurrentResult {
  /** 月別の海流流線セット（暖流／寒流／中立の分類付き）。 */
  readonly monthlyStreamlines: Months12<ReadonlyArray<CurrentStreamline>>;
  /** 月別海氷マスク（70-80° 基本配置 + 寒流沿い東岸延長、[docs/spec/03_海流.md §4.7]）。 */
  readonly monthlySeaIceMask: Months12<GridMap<boolean>>;
  /**
   * 月別海岸温度補正値（°C）。
   * 暖流 +15 / 寒流 -10 を上限とし、海岸セル以外は 0（[docs/spec/03_海流.md §4.8]）。
   */
  readonly monthlyCoastalTemperatureCorrectionCelsius: Months12<GridMap<number>>;
  /** 月別衝突点。 */
  readonly monthlyCollisionPoints: Months12<ReadonlyArray<CollisionPoint>>;
  /** ENSO ダイポール候補海域マスク（[docs/spec/03_海流.md §4.10]、可視化用）。 */
  readonly ensoDipoleCandidateMask: GridMap<boolean>;
}

// ============================================================
// Step 4: 気流 ([docs/spec/04_気流.md] §5)
// ============================================================

/** 気圧中心の極性。 */
export type PressureCenterType = 'high' | 'low';

export interface PressureCenter {
  readonly type: PressureCenterType;
  readonly position: GeoPoint;
  /** 強度（hPa、|p − 標準気圧| を表現する正の値）。 */
  readonly intensityHpa: number;
}

export interface AirflowResult {
  /** 月別最終地表風ベクトル場（風帯と気圧 anomaly を合成済み）。 */
  readonly monthlyWindField: Months12<GridMap<WindVector>>;
  /** 月別地表気圧 anomaly マップ（hPa、平均からの偏差）。 */
  readonly monthlyPressureAnomalyHpa: Months12<GridMap<number>>;
  /** 月別の高気圧／低気圧中心位置と強度。 */
  readonly monthlyPressureCenters: Months12<ReadonlyArray<PressureCenter>>;
  /** 山脈による風偏向が適用されたセルのフラグ（後段の山岳降水で再利用、[docs/spec/04_気流.md §4.6]）。 */
  readonly mountainDeflectionApplied: GridMap<boolean>;
}

// ============================================================
// Step 5: 気温 ([docs/spec/05_気温.md] §5)
// ============================================================

export interface TemperatureResult {
  /** 月別地表気温マップ（°C）。 */
  readonly monthlyTemperatureCelsius: Months12<GridMap<number>>;
  /** 年平均気温マップ（°C）。 */
  readonly annualMeanTemperatureCelsius: GridMap<number>;
  /** 夏最高気温マップ（°C、半球反転考慮済）。 */
  readonly summerMaxTemperatureCelsius: GridMap<number>;
  /** 冬最低気温マップ（°C、半球反転考慮済）。 */
  readonly winterMinTemperatureCelsius: GridMap<number>;
  /** 雪氷被覆マスク（夏最低気温が 0 °C 以下のセル）。 */
  readonly snowIceMask: GridMap<boolean>;
  /** 月別蒸発散量マップ（mm/月、[docs/spec/07_気候帯.md §4.1.7] が消費）。 */
  readonly monthlyEvapotranspirationMmPerMonth: Months12<GridMap<number>>;
  /** 季節振幅マップ（°C、年内の気温振幅。高離心率時の可視化用）。 */
  readonly seasonalAmplitudeCelsius: GridMap<number>;
  /**
   * 極反転フラグ（地軸傾斜が約 54° を超え、極で年平均日射量が赤道を上回るとき true）。
   * [docs/spec/05_気温.md §4.10.4]。Step 7 で判定経路を切替える根拠となる。
   */
  readonly polarInversion: boolean;
}

// ============================================================
// Step 6: 降水 ([docs/spec/06_降水.md] §5)
// ============================================================

/** 降水ラベル（[docs/spec/06_降水.md §4]）。 */
export type PrecipitationLabel = 'dry' | 'normal' | 'wet' | 'very_wet';

export interface PrecipitationResult {
  /** 月別降水ラベルマップ（4 階調）。 */
  readonly monthlyPrecipitationLabels: Months12<GridMap<PrecipitationLabel>>;
  /** 暖流由来湿潤帯マスク（true なら帯内、[docs/spec/06_降水.md §4.1]）。 */
  readonly warmCurrentHumidBeltMask: GridMap<boolean>;
  /** 暖流由来湿潤帯の海岸からの Fetch 距離（km、上限 2,000 km）。帯外は 0。 */
  readonly warmCurrentFetchKm: GridMap<number>;
  /** 山脈風上マスク（[docs/spec/06_降水.md §4.4]）。 */
  readonly mountainWindwardMask: GridMap<boolean>;
  /** 山脈風下マスク（rainshadow 候補）。 */
  readonly mountainLeewardMask: GridMap<boolean>;
  /** 月別前線通過頻度（無次元、0 以上）。 */
  readonly monthlyFrontPassageFrequency: Months12<GridMap<number>>;
  /** 極前線拡張マスク（冬季、[docs/spec/06_降水.md §4.7]）。 */
  readonly polarFrontExtensionMask: GridMap<boolean>;
  /** 山脈起伏マップ（m、rainshadow しきい値判定の根拠）。 */
  readonly mountainReliefMeters: GridMap<number>;
}

// ============================================================
// Step 7: 気候帯 ([docs/spec/07_気候帯.md] §5)
// ============================================================

/** 採用する気候分類体系（[docs/spec/07_気候帯.md §4]）。 */
export type ClimateClassificationSystem = 'koppen_geiger' | 'pasta_bioclimate';

/**
 * 気候区分コード文字列。
 * - 系統 1（Köppen-Geiger）の例: `Af` / `BWh` / `Cfb` / `Dfc` / `ET` / `EF`
 * - 系統 2（Pasta Bioclimate System）の例: 階層化コード（[docs/spec/07_気候帯.md §4.2]）
 */
export type ClimateZoneCode = string;

/** 気候区分の判定根拠（デバッグビュー表示用、[docs/spec/07_気候帯.md §5]）。 */
export interface ClimateZoneRationale {
  readonly winterMinTemperatureCelsius: number;
  readonly summerMaxTemperatureCelsius: number;
  readonly annualMeanTemperatureCelsius: number;
  readonly annualPrecipitationMm: number;
  readonly wettestMonthPrecipitationMm: number;
  readonly driestMonthPrecipitationMm: number;
}

export interface ClimateZoneResult {
  /** 採用した分類系統。 */
  readonly system: ClimateClassificationSystem;
  /** 各セルの気候区分コード（海洋・未分類セルは null）。 */
  readonly zoneCodes: GridMap<ClimateZoneCode | null>;
  /** 各陸地セルの判定根拠（海洋セルは null）。 */
  readonly rationale: GridMap<ClimateZoneRationale | null>;
}

// ============================================================
// 統合: SimulationResult ([要件定義書.md §4.3])
// ============================================================

export interface SimulationResult {
  readonly itcz: ITCZResult;
  readonly windBelt: WindBeltResult;
  readonly oceanCurrent: OceanCurrentResult;
  readonly airflow: AirflowResult;
  readonly temperature: TemperatureResult;
  readonly precipitation: PrecipitationResult;
  readonly climateZone: ClimateZoneResult;
}

// Step 7: 気候帯（Köppen-Geiger 分類、最小実装は系統 1 のみ）の導出。
// 一次参照: Pasta Part VIb Step 7 Climate Zones。詳細は [docs/spec/07_気候帯.md §4.1] を参照。
//
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/07_気候帯.md §5]。
//
// 範囲（最小実装）:
//   §4.0.1 ラベル → 月別降水量 mm/月（パラメータ化）
//   §4.0.2 季節極値（Step 5 の summer/winter + 月別合計から導出）
//   §4.0.3 海洋セルは null
//   §4.1.1 5 グループ判定（E → B → D → C → A の優先順）
//   §4.1.2 B 群 desert/steppe + Hot/Cold（Pasta 公式しきい値式）
//   §4.1.3 D 群 humid continental / subarctic（4 ヶ月以上 ≥ 10°C）
//   §4.1.4 C 群 Mediterranean / humid subtropical / oceanic
//   §4.1.5 A 群 Af / Am / Aw（Pasta 規則）
//   §4.1.6 第 2 文字（f/s/w/m）+ 第 3 文字（a/b/c/d）
//
// 割愛（後続実装で精緻化）:
//   §4.1.7 蒸発散量 B/D 再調整（動画 #40 の係数未確定、§7.5 未確定論点）
//   §4.1.8 季節調整（ITCZ 移動帯 savanna 拡張等）
//   §4.1.9 Climate clash チェック
//   系統 2 Pasta Bioclimate System（GDD/HDD/Ar/Evr が未計算、§4.2）

import type {
  ClimateClassificationSystem,
  ClimateZoneCode,
  ClimateZoneRationale,
  ClimateZoneResult,
  Grid,
  GridMap,
  PlanetParams,
  PrecipitationLabel,
  PrecipitationResult,
  TemperatureResult,
} from '@/domain';

const MONTHS_PER_YEAR = 12;

/** Polar (E) と Continental (D) の境界（[§4.1.1] 夏 < 10°C → E）。 */
const POLAR_SUMMER_MAX_THRESHOLD_CELSIUS = 10;
/** ET / EF の境界（夏 ≥ 0°C → ET、< 0°C → EF）。 */
const ET_EF_BOUNDARY_CELSIUS = 0;
/** Continental (D) と Temperate (C) の境界（冬 < 0°C → D、≥ 0°C → C）。 */
// [P4-68] お手本（清書版）の Cfb wedge 西岸 30-55° 縦長帯を実現するため、
// Pasta WL#40 厳格版 0°C → 標準 Köppen の -3°C に緩和。 winterMin が
// -3 ≤ < 18°C を C 群とする。Pasta `Worldbuilder's Log #40` でも一部の
// バージョンでは -3°C 採用とあり、両方の妥当性あり。
const D_C_WINTER_BOUNDARY_CELSIUS = -3;
/** Tropical (A) の冬最低気温下限（[§4.1.1] 冬 ≥ 18°C → A）。 */
const TROPICAL_WINTER_MIN_THRESHOLD_CELSIUS = 18;
/** 第 3 文字 'a' の最暖月しきい値（[§4.1.6] ≥ 22°C）。 */
const HOT_SUMMER_MONTH_THRESHOLD_CELSIUS = 22;
/** 第 3 文字 'b' の必要月数（最暖月 < 22°C でも 4 ヶ月以上 ≥ 10°C なら 'b'）。 */
const WARM_MONTH_COUNT_FOR_B_LETTER = 4;
/** 第 3 文字 'd' の冬最低気温しきい値（[§4.1.6] 冬 < -38°C → 'd'）。 */
const SEVERE_WINTER_LETTER_D_THRESHOLD_CELSIUS = -38;
/** D 群 humid continental / subarctic の境界月数（4 ヶ月以上 ≥ 10°C → humid、3 ヶ月以下 → subarctic）。 */
const D_HUMID_CONTINENTAL_WARM_MONTH_THRESHOLD = 4;
/** Mediterranean 判定の比率（最雨冬月 / 最少夏月 ≥ 3）。Pasta 引用に基づく。 */
const MEDITERRANEAN_WET_DRY_RATIO = 3;
/**
 * Mediterranean 判定の最少夏月降水量しきい値（mm/月、Pasta 引用 1 mm/day = 30 mm/月）。
 * 実装上は厳密に 30 ではなくラベル粒度を考慮して 40 mm/月 で運用（dry/normal の境界近傍）。
 */
const MEDITERRANEAN_DRIEST_SUMMER_MAX_MM_PER_MONTH = 40;
/** A 群 monsoon (Am) 判定で使う Pasta 公式: driestMonth >= 100 - annualP/25 mm/月。 */
const AM_DRIEST_MONTH_FORMULA_INTERCEPT = 100;
const AM_DRIEST_MONTH_FORMULA_DIVISOR = 25;
/** A 群 rainforest (Af) 判定: 最少月 ≥ 60 mm/月（Pasta 標準値、Köppen 一般）。 */
const AF_DRIEST_MONTH_THRESHOLD_MM_PER_MONTH = 60;

/** B 群しきい値計算: 6 ヶ月暑い側で雨 70% 超なら +280、30〜70% で +140、未満で 0（[§4.1.2]）。 */
const ARID_THRESHOLD_HIGH_PRECIP_RATIO = 0.70;
const ARID_THRESHOLD_MID_PRECIP_RATIO = 0.30;
const ARID_THRESHOLD_HIGH_BONUS_MM = 280;
const ARID_THRESHOLD_MID_BONUS_MM = 140;
/** B 群温度係数（temp × 20）。 */
const ARID_THRESHOLD_TEMP_COEFFICIENT = 20;

/** Hot/Cold 判定の代替基準（[§4.1.2] 年平均 ≥ 18°C で Hot）。 */
const ARID_HOT_COLD_ANNUAL_MEAN_THRESHOLD_CELSIUS = 18;

/**
 * Pasta が示す precipitation pattern (s/w/f) 判定の補助しきい値:
 *   's' (夏乾燥): 最少夏月 < 30 mm/月 かつ 最雨冬月 / 最少夏月 ≥ 3
 *   'w' (冬乾燥): 最雨夏月 / 最少冬月 ≥ 10 かつ 最雨夏月 ≥ 60 mm/月
 *   それ以外は 'f'
 */
const PATTERN_S_DRIEST_SUMMER_MAX_MM = 30;
const PATTERN_W_WET_DRY_RATIO = 10;
const PATTERN_W_WETTEST_SUMMER_MIN_MM = 60;

/**
 * Step 7 気候帯の利用者調整パラメータ（[docs/spec/07_気候帯.md §6.1]）。
 *
 * 系統 2（Pasta Bioclimate System）は最小実装では未対応。`system` を 'pasta_bioclimate'
 * に設定しても、本実装は系統 1 の規則で判定する（出力の `system` フィールドだけが追従）。
 */
export interface ClimateZoneStepParams {
  /** 採用分類体系。最小実装では 'koppen_geiger' のみ機能する。 */
  readonly system: ClimateClassificationSystem;
  /**
   * ラベル → 月別降水量（mm/月）の対応表（[§4.0.1]、§7.6 未確定論点）。
   * 既定値は地球の Köppen 分布から経験的に決めた暫定値（dry 10 / normal 60 / wet 120 / very_wet 240）。
   */
  readonly precipitationMmByLabel: {
    readonly dry: number;
    readonly normal: number;
    readonly wet: number;
    readonly very_wet: number;
  };
  /**
   * Hot/Cold B 区分の判定方式（[§4.1.2]）:
   *   'monthly': 全月の月平均気温が > 0°C なら Hot、ある月でも < 0°C なら Cold（Pasta 標準）
   *   'annual': 年平均気温 ≥ 18°C なら Hot、< 18°C なら Cold（代替基準）
   */
  readonly aridHotColdCriterion: 'monthly' | 'annual';
  /**
   * §4.1.7 蒸発散量による B → D 再調整を有効化するか（既定 true、Worldbuilder's Log #40）。
   *
   * 寒冷地では蒸発が遅いため低降水量でも乾燥（B）にならず D 気候として扱うべき、
   * という Pasta の補正規則を近似する。動画 #40 の「降水量ポイント × 年平均気温」
   * マトリクスは具体係数が示されていないため、本実装では年平均気温による単一しきい値の
   * 簡略近似を採用する（[docs/spec/07_気候帯.md §7.5]）。
   */
  readonly aridReclassToDEnabled: boolean;
  /**
   * §4.1.7 B → D 再調整の年平均気温しきい値（°C、既定 7°C）。
   *
   * B 候補（年降水量 < arid threshold）かつ D 候補（winterMin < 0°C）が重なるセルで、
   * 年平均気温 ≤ 本値なら B → D に振り戻す。それより暖かければ B のまま。
   * 既定 7°C は地球の北米/ユーラシア大陸の Bsk/BWk と D 群の境界経験値。
   */
  readonly aridReclassToDMaxAnnualTempCelsius: number;
  /**
   * §4.1.5 拡張: 標準 Köppen の A 群条件「最寒月 ≥ 18°C」を緩めて、
   * 「年平均 ≥ X°C かつ winterMin ≥ Y°C」のときは A 群（tropical）として扱う
   * （[現状.md ユーザ指摘 2026-05-03、P4-49]、Pasta `Worldbuilder's Log #40` 由来）。
   *
   * 動機: Step 5 の per-cell winterMin が赤道帯 lowland でも 13-17°C 程度に
   * 留まり（[scripts/diag_temperature_asymmetry.mts] 結果）、標準 Köppen
   * では C 群に流れてしまう。Pasta では「年平均が常時暖かいゾーン」を
   * 保守的に A 群へ引き戻すことで、視覚的な「赤道帯 = A 群」を維持する。
   *
   * 既定 true / annualMean ≥ 22°C / winterMin ≥ 10°C （地球の Aw/Cwa 境界経験値）。
   */
  readonly tropicalExtensionEnabled: boolean;
  /** A 群拡張: 年平均気温の下限（°C）。 */
  readonly tropicalExtensionMinAnnualMeanCelsius: number;
  /** A 群拡張: winterMin の下限（°C）。これより寒い冬を持つセルは拡張対象外。 */
  readonly tropicalExtensionMinWinterMinCelsius: number;
  /**
   * BS リング後処理を有効化するか（[P4-55]、ユーザ FB 2026-05-04）。
   *
   * BW（砂漠）セルに隣接する非 B/E/Cs/Cfb のセルを BS（ステップ）に変換する。
   * Pasta WL#37 / 教科書「砂漠は必ずステップに囲まれる」を実現するため。
   * 既定 true。無効化したい場合は false（A→BW の急変が現れる）。
   */
  readonly bsRingAroundBwEnabled: boolean;
}

export const DEFAULT_CLIMATE_ZONE_STEP_PARAMS: ClimateZoneStepParams = {
  system: 'koppen_geiger',
  precipitationMmByLabel: {
    dry: 10,
    normal: 60,
    wet: 120,
    very_wet: 240,
  },
  aridHotColdCriterion: 'monthly',
  aridReclassToDEnabled: true,
  aridReclassToDMaxAnnualTempCelsius: 7,
  tropicalExtensionEnabled: true,
  tropicalExtensionMinAnnualMeanCelsius: 22,
  tropicalExtensionMinWinterMinCelsius: 10,
  bsRingAroundBwEnabled: true,
};

/** 月別気温・降水量の集約結果。 */
interface MonthlyAggregation {
  readonly monthlyTempCelsius: ReadonlyArray<number>;
  readonly monthlyPrecipMm: ReadonlyArray<number>;
  readonly winterMinCelsius: number;
  readonly summerMaxCelsius: number;
  readonly annualMeanCelsius: number;
  readonly annualPrecipMm: number;
  readonly wettestMonthMm: number;
  readonly driestMonthMm: number;
  /** 暑い 6 ヶ月の月インデックス（昇順）。気温降順で上位 6 を選んでから昇順に並べ直す。 */
  readonly hotHalfMonthIndices: ReadonlyArray<number>;
  /** 冷たい 6 ヶ月の月インデックス（昇順）。 */
  readonly coldHalfMonthIndices: ReadonlyArray<number>;
}

/**
 * セル (i,j) の月別気温・降水量を集約する。
 * Step 5 の月別気温と Step 6 の月別ラベル（→ params のラベル → mm 表で量化）から構築。
 */
function aggregateCellMonthly(
  i: number,
  j: number,
  temperatureResult: TemperatureResult,
  precipitationResult: PrecipitationResult,
  precipitationMmByLabel: ClimateZoneStepParams['precipitationMmByLabel'],
): MonthlyAggregation {
  const monthlyTemp: number[] = new Array(MONTHS_PER_YEAR);
  const monthlyPrecip: number[] = new Array(MONTHS_PER_YEAR);
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    monthlyTemp[m] = temperatureResult.monthlyTemperatureCelsius[m]?.[i]?.[j] ?? 0;
    const label: PrecipitationLabel =
      precipitationResult.monthlyPrecipitationLabels[m]?.[i]?.[j] ?? 'normal';
    monthlyPrecip[m] = precipitationMmByLabel[label];
  }

  // 季節極値は Step 5 の出力をそのまま採用（半球反転考慮済み）
  const winterMin = temperatureResult.winterMinTemperatureCelsius[i]?.[j] ?? 0;
  const summerMax = temperatureResult.summerMaxTemperatureCelsius[i]?.[j] ?? 0;
  const annualMean = temperatureResult.annualMeanTemperatureCelsius[i]?.[j] ?? 0;

  let annualPrecip = 0;
  let wettest = -Infinity;
  let driest = Infinity;
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const p = monthlyPrecip[m]!;
    annualPrecip += p;
    if (p > wettest) wettest = p;
    if (p < driest) driest = p;
  }

  // 暑い・冷たい 6 ヶ月のインデックス
  const indices: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  // 気温降順
  indices.sort((a, b) => (monthlyTemp[b] ?? 0) - (monthlyTemp[a] ?? 0));
  const hotHalf = indices.slice(0, 6).sort((a, b) => a - b);
  const coldHalf = indices.slice(6, 12).sort((a, b) => a - b);

  return {
    monthlyTempCelsius: monthlyTemp,
    monthlyPrecipMm: monthlyPrecip,
    winterMinCelsius: winterMin,
    summerMaxCelsius: summerMax,
    annualMeanCelsius: annualMean,
    annualPrecipMm: annualPrecip,
    wettestMonthMm: wettest,
    driestMonthMm: driest,
    hotHalfMonthIndices: hotHalf,
    coldHalfMonthIndices: coldHalf,
  };
}

/**
 * Pasta の B 群しきい値（[§4.1.2]）:
 *   threshold = annualMean × 20 + bonus
 *   bonus = 280 if hot half 降水比率 > 70%
 *         = 140 if hot half 降水比率 30〜70%
 *         = 0   otherwise
 *
 * 年平均が低い領域では threshold が小さくなり、ほぼ B にならない（極寒地は降水量が
 * 少なくても B 判定されない）。
 */
function computeAridThresholdMm(agg: MonthlyAggregation): number {
  let hotPrecip = 0;
  for (const m of agg.hotHalfMonthIndices) {
    hotPrecip += agg.monthlyPrecipMm[m] ?? 0;
  }
  const ratio = agg.annualPrecipMm > 0 ? hotPrecip / agg.annualPrecipMm : 0;
  let bonus: number;
  if (ratio > ARID_THRESHOLD_HIGH_PRECIP_RATIO) bonus = ARID_THRESHOLD_HIGH_BONUS_MM;
  else if (ratio >= ARID_THRESHOLD_MID_PRECIP_RATIO) bonus = ARID_THRESHOLD_MID_BONUS_MM;
  else bonus = 0;
  return agg.annualMeanCelsius * ARID_THRESHOLD_TEMP_COEFFICIENT + bonus;
}

/** Hot/Cold 判定（[§4.1.2]）。 */
function isAridHot(
  agg: MonthlyAggregation,
  criterion: 'monthly' | 'annual',
): boolean {
  if (criterion === 'annual') {
    return agg.annualMeanCelsius >= ARID_HOT_COLD_ANNUAL_MEAN_THRESHOLD_CELSIUS;
  }
  // 'monthly': すべての月の月平均気温が > 0°C なら Hot
  for (const t of agg.monthlyTempCelsius) {
    if (t <= 0) return false;
  }
  return true;
}

/** 第 3 文字 a/b/c/d（[§4.1.6]、C/D 群で使用）。 */
function thirdLetterFromTemp(agg: MonthlyAggregation): 'a' | 'b' | 'c' | 'd' {
  if (agg.winterMinCelsius < SEVERE_WINTER_LETTER_D_THRESHOLD_CELSIUS) return 'd';
  if (agg.summerMaxCelsius >= HOT_SUMMER_MONTH_THRESHOLD_CELSIUS) return 'a';
  // 'b': 最暖月 < 22°C でも 4 ヶ月以上 ≥ 10°C
  let monthsAbove10 = 0;
  for (const t of agg.monthlyTempCelsius) {
    if (t >= 10) monthsAbove10++;
  }
  if (monthsAbove10 >= WARM_MONTH_COUNT_FOR_B_LETTER) return 'b';
  return 'c';
}

/** 第 2 文字 f/s/w（[§4.1.6]、C/D 群で使用、A 群は別途 m を持つ）。 */
function precipitationPatternLetter(agg: MonthlyAggregation): 'f' | 's' | 'w' {
  let driestSummer = Infinity;
  let wettestSummer = -Infinity;
  let driestWinter = Infinity;
  let wettestWinter = -Infinity;
  for (const m of agg.hotHalfMonthIndices) {
    const p = agg.monthlyPrecipMm[m] ?? 0;
    if (p < driestSummer) driestSummer = p;
    if (p > wettestSummer) wettestSummer = p;
  }
  for (const m of agg.coldHalfMonthIndices) {
    const p = agg.monthlyPrecipMm[m] ?? 0;
    if (p < driestWinter) driestWinter = p;
    if (p > wettestWinter) wettestWinter = p;
  }
  // 's' (夏乾燥): 最少夏月 < しきい値 かつ 最雨冬月 / 最少夏月 ≥ 3
  if (
    driestSummer < PATTERN_S_DRIEST_SUMMER_MAX_MM &&
    wettestWinter >= MEDITERRANEAN_WET_DRY_RATIO * Math.max(driestSummer, 1e-6)
  ) {
    return 's';
  }
  // 'w' (冬乾燥): 最雨夏月 / 最少冬月 ≥ 10 かつ 最雨夏月 ≥ しきい値
  if (
    wettestSummer >= PATTERN_W_WETTEST_SUMMER_MIN_MM &&
    wettestSummer >= PATTERN_W_WET_DRY_RATIO * Math.max(driestWinter, 1e-6)
  ) {
    return 'w';
  }
  return 'f';
}

/** A 群の細分（[§4.1.5]）: Af / Am / Aw（南半球は As 同義）。 */
function classifyTropical(agg: MonthlyAggregation): ClimateZoneCode {
  // Af: 最少月 ≥ 60 mm/月
  if (agg.driestMonthMm >= AF_DRIEST_MONTH_THRESHOLD_MM_PER_MONTH) return 'Af';
  // Am: 最少月 ≥ 100 - annualP/25 mm/月（Pasta 公式）
  const amThreshold = AM_DRIEST_MONTH_FORMULA_INTERCEPT - agg.annualPrecipMm / AM_DRIEST_MONTH_FORMULA_DIVISOR;
  if (agg.driestMonthMm >= amThreshold) return 'Am';
  // それ以外は Aw（夏雨）/ As（冬雨）。乾季が hot half にあれば As、cold half にあれば Aw。
  let driestSummerP = Infinity;
  let driestWinterP = Infinity;
  for (const m of agg.hotHalfMonthIndices) {
    const p = agg.monthlyPrecipMm[m] ?? 0;
    if (p < driestSummerP) driestSummerP = p;
  }
  for (const m of agg.coldHalfMonthIndices) {
    const p = agg.monthlyPrecipMm[m] ?? 0;
    if (p < driestWinterP) driestWinterP = p;
  }
  // 一般に乾季は冬（cold half）にある熱帯モンスーンが多いので Aw が既定。
  // 乾季が夏（hot half）にあれば As（赤道近傍では稀だがあり得る）。
  if (driestSummerP < driestWinterP) return 'As';
  return 'Aw';
}

/** C 群の細分（[§4.1.4]）: Mediterranean / humid subtropical / oceanic。 */
function classifyTemperate(agg: MonthlyAggregation): ClimateZoneCode {
  const pattern = precipitationPatternLetter(agg);
  const third = thirdLetterFromTemp(agg);
  // Mediterranean は 's' パターンで、Pasta 引用「最少夏月 < 1 mm/day = 30 mm/月」を満たす場合に該当
  let driestSummer = Infinity;
  for (const m of agg.hotHalfMonthIndices) {
    const p = agg.monthlyPrecipMm[m] ?? 0;
    if (p < driestSummer) driestSummer = p;
  }
  if (pattern === 's' && driestSummer < MEDITERRANEAN_DRIEST_SUMMER_MAX_MM_PER_MONTH) {
    return `Cs${third}` as ClimateZoneCode;
  }
  return `C${pattern}${third}` as ClimateZoneCode;
}

/** D 群の細分（[§4.1.3]）: humid continental / subarctic + 第 2/3 文字。 */
function classifyContinental(agg: MonthlyAggregation): ClimateZoneCode {
  const pattern = precipitationPatternLetter(agg);
  let monthsAbove10 = 0;
  for (const t of agg.monthlyTempCelsius) {
    if (t >= 10) monthsAbove10++;
  }
  const isSubarctic = monthsAbove10 < D_HUMID_CONTINENTAL_WARM_MONTH_THRESHOLD;
  // Subarctic は第 3 文字 c（または冬最低 < -38°C で d）
  // Humid continental は a/b による細分
  if (isSubarctic) {
    const third = agg.winterMinCelsius < SEVERE_WINTER_LETTER_D_THRESHOLD_CELSIUS ? 'd' : 'c';
    return `D${pattern}${third}` as ClimateZoneCode;
  }
  const third = thirdLetterFromTemp(agg);
  // humid continental は a/b のみ（c/d を持つのは subarctic 側）
  const finalThird = third === 'c' || third === 'd' ? 'b' : third;
  return `D${pattern}${finalThird}` as ClimateZoneCode;
}

/** B 群の細分（[§4.1.2]）: desert (BW*) / steppe (BS*) + h/k。 */
function classifyArid(
  agg: MonthlyAggregation,
  thresholdMm: number,
  hotColdCriterion: 'monthly' | 'annual',
): ClimateZoneCode {
  const isDesert = agg.annualPrecipMm < thresholdMm / 2;
  const isHot = isAridHot(agg, hotColdCriterion);
  const main = isDesert ? 'BW' : 'BS';
  const suffix = isHot ? 'h' : 'k';
  return `${main}${suffix}` as ClimateZoneCode;
}

/** Polar 群の判定（[§4.1.1]）: ET（夏 ≥ 0°C）/ EF（夏 < 0°C）。 */
function classifyPolar(agg: MonthlyAggregation): ClimateZoneCode {
  return agg.summerMaxCelsius >= ET_EF_BOUNDARY_CELSIUS ? 'ET' : 'EF';
}

/**
 * 単一陸地セルの気候区分コードと判定根拠を導出する（[§4.1.1] 適用順序）。
 *
 * 優先順序:
 *   1. E (Polar):       summerMax < 10°C
 *   2. B (Arid):        年降水量 < しきい値
 *   3. D (Continental): winterMin < 0°C
 *   4. C (Temperate):   winterMin in [0, 18°C)
 *   5. A (Tropical):    winterMin ≥ 18°C
 */
function classifyCell(
  agg: MonthlyAggregation,
  params: ClimateZoneStepParams,
): { readonly code: ClimateZoneCode; readonly rationale: ClimateZoneRationale } {
  let code: ClimateZoneCode;
  if (agg.summerMaxCelsius < POLAR_SUMMER_MAX_THRESHOLD_CELSIUS) {
    code = classifyPolar(agg);
  } else {
    const aridThreshold = computeAridThresholdMm(agg);
    const isAridCandidate = agg.annualPrecipMm < aridThreshold;
    // §4.1.7: 寒冷地での B → D 振り戻し（[docs/spec/07_気候帯.md §4.1.7 / §7.5]、Worldbuilder's Log #40）
    // 「寒冷地では蒸発が遅いため低降水量でも乾燥にならず D 気候として残る」ルールの近似。
    // B 候補かつ D 候補（winterMin < 0°C）かつ年平均気温 ≤ しきい値で B → D に振り戻す。
    const isDCandidate = agg.winterMinCelsius < D_C_WINTER_BOUNDARY_CELSIUS;
    const isCold =
      params.aridReclassToDEnabled && agg.annualMeanCelsius <= params.aridReclassToDMaxAnnualTempCelsius;
    if (isAridCandidate && !(isDCandidate && isCold)) {
      code = classifyArid(agg, aridThreshold, params.aridHotColdCriterion);
    } else if (agg.winterMinCelsius < D_C_WINTER_BOUNDARY_CELSIUS) {
      code = classifyContinental(agg);
    } else {
      // §4.1.5 A 群拡張（[P4-49]）: 標準では winterMin ≥ 18°C で A 群だが、
      // Step 5 の per-cell winterMin が低めに出るため、年平均が十分暖かい
      // ゾーンを救済して A 群へ振り分ける。Pasta `Worldbuilder's Log #40` 風。
      const isTropicalExtension =
        params.tropicalExtensionEnabled &&
        agg.annualMeanCelsius >= params.tropicalExtensionMinAnnualMeanCelsius &&
        agg.winterMinCelsius >= params.tropicalExtensionMinWinterMinCelsius;
      if (
        agg.winterMinCelsius < TROPICAL_WINTER_MIN_THRESHOLD_CELSIUS &&
        !isTropicalExtension
      ) {
        code = classifyTemperate(agg);
      } else {
        code = classifyTropical(agg);
      }
    }
  }
  const rationale: ClimateZoneRationale = {
    winterMinTemperatureCelsius: agg.winterMinCelsius,
    summerMaxTemperatureCelsius: agg.summerMaxCelsius,
    annualMeanTemperatureCelsius: agg.annualMeanCelsius,
    annualPrecipitationMm: agg.annualPrecipMm,
    wettestMonthPrecipitationMm: agg.wettestMonthMm,
    driestMonthPrecipitationMm: agg.driestMonthMm,
  };
  return { code, rationale };
}

/**
 * Step 7 気候帯 純粋関数。
 *
 * 入力契約: PlanetParams + Grid + PrecipitationResult + TemperatureResult + params。
 * 出力契約: ClimateZoneResult（[docs/spec/07_気候帯.md §5]）。海洋セルは null。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。
 */
export function computeClimateZone(
  // PlanetParams は最小実装では使わない（Step 5 / Step 6 が消費済みの月別気温・降水を直接読む）が、
  // 系統 2 で日射量・GDD を必要とするため契約として受け取る。
  _planet: PlanetParams,
  grid: Grid,
  precipitationResult: PrecipitationResult,
  temperatureResult: TemperatureResult,
  params: ClimateZoneStepParams = DEFAULT_CLIMATE_ZONE_STEP_PARAMS,
): ClimateZoneResult {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const zoneCodes: (ClimateZoneCode | null)[][] = new Array(rows);
  const rationale: (ClimateZoneRationale | null)[][] = new Array(rows);

  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    const codeRow: (ClimateZoneCode | null)[] = new Array(cols).fill(null);
    const ratRow: (ClimateZoneRationale | null)[] = new Array(cols).fill(null);
    if (!cellRow) {
      zoneCodes[i] = codeRow;
      rationale[i] = ratRow;
      continue;
    }
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (!cell || !cell.isLand) continue;
      const agg = aggregateCellMonthly(
        i,
        j,
        temperatureResult,
        precipitationResult,
        params.precipitationMmByLabel,
      );
      const result = classifyCell(agg, params);
      codeRow[j] = result.code;
      ratRow[j] = result.rationale;
    }
    zoneCodes[i] = codeRow;
    rationale[i] = ratRow;
  }

  // §4.x [P4-55] BS リング後処理: BW セルに隣接する非 B/E ゾーン（A/C/D）を
  // BS に置換してステップ気候の遷移帯を生成。Pasta WL#37 / 教科書的に
  // 「砂漠は必ずステップに囲まれる」ためで、ring がないと A → BW の急変が
  // 不自然（[現状.md ユーザ FB 2026-05-04]）。Cs / Cfb は protected。
  if (params.bsRingAroundBwEnabled) {
    applyBsRingAroundBw(zoneCodes);
  }

  return {
    system: params.system,
    zoneCodes: zoneCodes as GridMap<ClimateZoneCode | null>,
    rationale: rationale as GridMap<ClimateZoneRationale | null>,
  };
}

/**
 * BW セルに隣接する非 B/E/Cs/Cfb の land cell を BS に変換する 4 近傍 ring 処理。
 * 入力 `zoneCodes` を in-place 改変する。
 * - hot 隣接（A 群 / Cwa / Cfa） → BSh
 * - cold 隣接（D 群） → BSk
 * 既に BS のセルは ring 起点に含めない（無限拡大を防ぐ単一 pass 設計）
 */
function applyBsRingAroundBw(zoneCodes: (ClimateZoneCode | null)[][]): void {
  const rows = zoneCodes.length;
  const cols = zoneCodes[0]?.length ?? 0;
  const protectedTargets = new Set<string>(['Csa', 'Csb', 'Csc', 'Cfb', 'Cfc']);
  const snapshot: (ClimateZoneCode | null)[][] = zoneCodes.map((row) => [...row]);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const z = snapshot[i]![j];
      if (!z || !z.startsWith('BW')) continue;
      const neighbors: ReadonlyArray<readonly [number, number]> = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      for (const [di, dj] of neighbors) {
        const ni = i + di;
        if (ni < 0 || ni >= rows) continue;
        const nj = ((j + dj) % cols + cols) % cols;
        const nz = snapshot[ni]![nj];
        if (!nz) continue;
        if (nz.startsWith('B')) continue;
        if (nz.startsWith('E')) continue;
        if (protectedTargets.has(nz)) continue;
        const targetIsHot = nz.startsWith('A') || nz === 'Cwa' || nz === 'Cfa';
        zoneCodes[ni]![nj] = targetIsHot ? 'BSh' : 'BSk';
      }
    }
  }
}

/**
 * 内部ヘルパの公開（テスト用）。
 * 戻り値のクランプ・分岐の境界を直接検証するためのみ使う（[要件定義書.md §3.2] 決定性の保証）。
 */
export const __internals = {
  aggregateCellMonthly,
  classifyCell,
  classifyArid,
  classifyContinental,
  classifyTemperate,
  classifyTropical,
  classifyPolar,
  computeAridThresholdMm,
  isAridHot,
  precipitationPatternLetter,
  thirdLetterFromTemp,
};

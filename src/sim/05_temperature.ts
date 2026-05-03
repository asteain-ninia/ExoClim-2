// Step 5: 気温（月別地表気温・夏冬極値・雪氷被覆・蒸発散量）の導出。
// 一次参照: Pasta Part VIb Step 2 Simulating Temperature。詳細は [docs/spec/05_気温.md §4] を参照。
//
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/05_気温.md §5]。
//
// 範囲（最小実装）:
//   §4.1 軌道幾何による日射量 → 緯度・月別の daily insolation factor
//   §4.2 緯度ベース基底温度    → 日射 + 温室効果 + 南北熱輸送（緯度方向の平滑化）で決定
//   §4.3 標高補正              → lapseRateCelsiusPerKm × 標高 km
//   §4.4 高地高原キャップ      → 標高 > 4 km の陸地を 10 °C 以下にクランプ
//   §4.5 海陸対比               → 内陸ほど seasonal amplitude を増幅
//   §4.6 海流による海岸補正    → Step 3 の monthlyCoastalTemperatureCorrectionCelsius を加算
//   §4.7 風移流補正            → Step 4 の最終風で 1 セル風上方向の温度を弱く混合
//   §4.8 雪氷アルベドフィードバック → 反復計算（既定 2 回）で雪氷セルに追加冷却を適用
//   §4.9 季節極値              → 各セルの年内 max（夏）/ min（冬）を抽出
//   §4.10.4 極反転             → axialTilt > 54° で polarInversion=true（Step 7 が利用）
//   §4.11 蒸発散量             → 温度ベースの簡易式（Pasta §7.5 未確定論点、暫定実装）

import type {
  AirflowResult,
  GeoPoint,
  Grid,
  GridMap,
  IsothermLine,
  IsothermSegment,
  ITCZResult,
  Months12,
  OceanCurrentResult,
  PlanetParams,
  TemperatureResult,
  WindBeltResult,
  WindVector,
} from '@/domain';

import { solarDeclinationDeg } from './01_itcz';

const MONTHS_PER_YEAR = 12;
const DEG_TO_RAD = Math.PI / 180;

/**
 * 地球で 1951–1980 全球平均気温が約 15 °C となる基準（[docs/spec/05_気温.md §4.2]）。
 * 温室効果 + アルベド + 日射の組み合わせを 1 つの基準点に集約しているため、利用者は
 * `globalMeanBaselineCelsius` で全球平均をそのまま指定できる。
 */
const EARTH_REFERENCE_GLOBAL_MEAN_CELSIUS = 15;

/**
 * 年平均日射偏差を温度差に変換する係数（°C / 規格化日射）。
 *
 * 単純な線形変換は Stefan-Boltzmann の T⁴ 関係を再現できないため、年平均と季節振幅を
 * 別スケールで扱う 2 段階モデルを採用する。本値は **年平均** 日射の緯度依存を強く効かせ、
 * 「赤道 +27°C / 極 -22°C」相当の年平均緯度勾配を出すよう経験的に校正した。
 * Pasta は本値を直接指定しないため、Phase 4 検証フィクスチャ（[開発ガイド.md §4.1]）で
 * 地球の Köppen 分布が再現できることを確認したうえで固定する。
 */
const ANNUAL_INSOLATION_TO_TEMPERATURE_SCALE_CELSIUS = 350;

/**
 * 季節日射偏差（月別 - 年平均）を温度差に変換する係数（°C / 規格化日射）。
 *
 * 高緯度で polar day の日射係数が赤道夏より高くなる現象に対し、線形スケールだとそのまま
 * 「polar day = 真夏並み温度」となり破綻する（実際は雪氷の融解潜熱・低水蒸気で +0〜+5°C 程度）。
 * 年平均スケールより小さい係数で「季節振幅は中緯度でほどほど、極で抑制」を表現する。
 */
const SEASONAL_INSOLATION_TO_TEMPERATURE_SCALE_CELSIUS = 80;

/** 球面平均日射係数（球面で daily insolation factor を積分した平均、≈ 0.25）。基準点として使う。 */
const GLOBAL_MEAN_INSOLATION_FACTOR = 0.25;

/** 地球の代表的な惑星アルベド（雲含む Bond albedo）。日射偏差の基準計算に使う。 */
const EARTH_REFERENCE_PLANETARY_ALBEDO = 0.30;

/**
 * 高地高原キャップ（[docs/spec/05_気温.md §4.4]）の判定しきい値（メートル）と
 * クランプ上限気温（°C）。Pasta 引用そのまま。
 */
const PLATEAU_ELEVATION_THRESHOLD_METERS = 4000;
const PLATEAU_TEMPERATURE_CAP_CELSIUS = 10;

/** 極反転判定の地軸傾斜（[docs/spec/05_気温.md §4.10.4]、Pasta は約 54° と指定）。 */
const POLAR_INVERSION_AXIAL_TILT_DEG = 54;

/** 雪氷判定（夏最高気温が 0 °C 以下のセルを雪氷被覆とみなす、[docs/spec/05_気温.md §5]）。 */
const SNOW_ICE_SUMMER_MAX_THRESHOLD_CELSIUS = 0;

/**
 * 雪氷被覆セルに加算する追加冷却（°C、アルベド 0.30 → 0.60 相当を経験的に変換）。
 * 反復ループで段階的に氷帯が広がるよう、地球並みの極冠が再現できる強度に固定。
 */
const SNOW_ICE_ADDITIONAL_COOLING_CELSIUS = 5;

/** 海岸距離計算で「内陸」と判定するセル数。これ以上海から離れた陸地で continentality 最大。 */
const CONTINENTAL_INTERIOR_CELL_THRESHOLD = 10;

/** 風移流補正の参照風速（m/s）。風速がこれと一致するときに混合率 = strength。 */
const WIND_ADVECTION_REFERENCE_SPEED_MPS = 5;

/**
 * Step 5 気温の利用者調整パラメータ（[docs/spec/05_気温.md §6.1]）。
 *
 * §4.2 の温室効果プリセットは `globalMeanBaselineCelsius` を介して直接指定できる
 * （Earth=15、Cretaceous=24.5、LGM=10）。他のスケーリングは本ステップ固有の経験係数。
 */
export interface TemperatureStepParams {
  /**
   * 全球平均気温の基準値（°C）。Pasta の温室効果プリセットを直接表現する
   * （Earth 1951–1980 = 15、Cretaceous = 24.5、Last Glacial Max = 10）。
   * 本値が緯度別気温の zero point となる（[docs/spec/05_気温.md §4.2]）。
   */
  readonly globalMeanBaselineCelsius: number;
  /**
   * 大陸性（continentality）の振幅増幅係数（無次元）。1 で標準、0 で無効化。
   * 内陸ほど夏が暑く冬が寒くなる効果（[docs/spec/05_気温.md §4.5]）の強度。
   */
  readonly continentalityStrength: number;
  /**
   * 風移流補正の強度（0–1、0 で無効）。
   * Step 4 の最終風ベクトルから 1 セル風上方向の温度を弱く混合する
   * （[docs/spec/05_気温.md §4.7]）。
   */
  readonly windAdvectionStrength: number;
  /**
   * 雪氷アルベドフィードバックの反復回数（0–3 整数、[技術方針.md §2.2.2]）。
   * 0 でフィードバック無効。各回で雪氷セルに追加冷却を適用してから再判定する。
   */
  readonly snowIceFeedbackIterations: number;
  /**
   * 蒸発散量の係数（mm/月/°C）。Pasta §7.5 未確定論点。
   * 温度ベースの簡易式 ET = max(0, T) × this を使う暫定実装。
   * Phase 4 検証で Penman-Monteith 簡略版に置き換える可能性あり。
   */
  readonly evapotranspirationCoefficientMmPerCelsius: number;
  /**
   * 等温線（isotherm contour）の刻み幅（°C）。0 で生成抑制。
   * 月別および年平均の温度マップから marching squares で等値線を抽出する
   * （[docs/spec/05_気温.md §4.12]）。10°C 既定。
   */
  readonly isothermIntervalCelsius: number;
  /**
   * 海岸補正の内陸到達距離（セル単位、[現状.md ユーザ指摘 2026-05-03、P4-50]）。
   *
   * 旧来は陸セルの coastal correction が常に 0 となり、同緯度東西で気温が
   * 一致する症状（→ Step 7 で同色気候帯）が発生していた。本値を増やすと
   * 隣接海セルの correction が線形減衰で陸地内まで伝播する（reach=0 で旧挙動）。
   *
   * 既定 5 セル（解像度 1° で約 5°/550km、Pasta WL#28 の「数百 km 内陸まで」記述に整合）。
   */
  readonly coastalCorrectionInlandReachCells: number;
}

export const DEFAULT_TEMPERATURE_STEP_PARAMS: TemperatureStepParams = {
  globalMeanBaselineCelsius: 15,
  continentalityStrength: 1,
  windAdvectionStrength: 0.3,
  snowIceFeedbackIterations: 2,
  evapotranspirationCoefficientMmPerCelsius: 5,
  isothermIntervalCelsius: 10,
  // [P4-57] 5 → 7 に増加。Pasta WL#28 の「数百 km 内陸まで」記述を 700-800 km
  // (= 7-8°) でカバー。Cfb wedge が西岸 50°N で 1-2 セルしか出ない問題を緩和。
  coastalCorrectionInlandReachCells: 7,
};

/**
 * 緯度・宣赤緯から日射係数（球面平均で約 0.25 になる規格化値）を返す。
 *
 * 標準的な daily insolation 公式（Berger 1978）:
 *   Q(lat, dec) = (1/π) × [h₀ sin(lat) sin(dec) + cos(lat) cos(dec) sin(h₀)]
 *   h₀ = arccos(-tan(lat) tan(dec))
 *
 * 極夜（h₀ → 0）と極昼（h₀ → π）は分岐で処理する。
 */
function dailyInsolationFactor(latitudeDeg: number, declinationDeg: number): number {
  const lat = latitudeDeg * DEG_TO_RAD;
  const dec = declinationDeg * DEG_TO_RAD;
  const arg = -Math.tan(lat) * Math.tan(dec);
  let h0: number;
  if (arg <= -1) {
    h0 = Math.PI; // 極昼
  } else if (arg >= 1) {
    h0 = 0; // 極夜
  } else {
    h0 = Math.acos(arg);
  }
  const factor =
    (h0 * Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.sin(h0)) /
    Math.PI;
  // 数値誤差で僅かに負になることがあるので 0 でクランプ
  return Math.max(0, factor);
}

/**
 * 軌道距離係数（無次元、a を 1 として正規化された 1/r² で、平均が 1 に近づく値）。
 * 簡略 Kepler: 真近点角を月相で近似する。離心率 0.0167（地球）で約 ±3.4% の振幅。
 *
 * 真の Kepler 解（離心近点角からの変換）はもっと複雑だが、e ≪ 1 の通常惑星では
 * 線形近似で十分（[docs/spec/05_気温.md §4.10.3] 高離心率時のみ精度問題）。
 */
function distanceFactorByMonth(
  monthIndex: number,
  eccentricity: number,
  perihelionDeg: number,
): number {
  if (eccentricity <= 0) return 1;
  const phase = (2 * Math.PI * (monthIndex + 0.5)) / MONTHS_PER_YEAR;
  const peri = perihelionDeg * DEG_TO_RAD;
  // 線形近似: r/a = 1 - e × cos(phase - perihelion)
  const r = 1 - eccentricity * Math.cos(phase - peri);
  return 1 / Math.max(0.001, r * r);
}

/**
 * 緯度ごとの年平均日射係数（12 ヶ月分の dailyInsolationFactor の単純平均）。
 *
 * 軌道距離係数 `orbitalDistanceFactorPerMonth` を反映するために、月ごとの距離係数も渡す。
 * 偏平な離心率では月によって距離が変わり、これを年平均に取り込む。
 */
function annualMeanInsolationFactor(
  latitudeDeg: number,
  axialTiltDeg: number,
  orbitalDistanceFactorPerMonth: ReadonlyArray<number>,
): number {
  let sum = 0;
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const decl = solarDeclinationDeg(m, axialTiltDeg);
    const f = dailyInsolationFactor(latitudeDeg, decl);
    sum += f * (orbitalDistanceFactorPerMonth[m] ?? 1);
  }
  return sum / MONTHS_PER_YEAR;
}

/**
 * 緯度別の月別ベース気温（°C）を計算する（2 段階スケール）。
 *
 * 構造:
 *   Q_annual(lat) = mean_m { dailyInsolationFactor(lat, decl(m)) × distanceFactor(m) }
 *   Q_month(lat, m) = dailyInsolationFactor(lat, decl(m)) × distanceFactor(m)
 *   T_annual = baseline + (Q_annual × stellarFactor × (1-A) - Q̄ × (1-A_earth)) × ANNUAL_SCALE
 *   T_month = T_annual + (Q_month - Q_annual) × stellarFactor × (1-A) × SEASONAL_SCALE
 *
 * ANNUAL_SCALE が大きい（350）ことで緯度勾配を再現し、SEASONAL_SCALE が小さい（80）ことで
 * 高緯度の polar day での過剰な夏温度上昇を抑制する。
 *
 * `stellarFactor = L / a²` は (距離係数 distanceFactor とは別に) 軌道半径による光度減衰のみを表す。
 */
function computeLatitudeBaseTemperatureCelsius(
  latitudeDeg: number,
  monthIndex: number,
  axialTiltDeg: number,
  stellarFactor: number,
  orbitalDistanceFactorPerMonth: ReadonlyArray<number>,
  baselineCelsius: number,
  greenhouseStrengthRelative: number,
  surfaceAlbedo: number,
  cloudAlbedo: number,
): number {
  const decl = solarDeclinationDeg(monthIndex, axialTiltDeg);
  const monthFactor =
    dailyInsolationFactor(latitudeDeg, decl) * (orbitalDistanceFactorPerMonth[monthIndex] ?? 1);
  const annualFactor = annualMeanInsolationFactor(
    latitudeDeg,
    axialTiltDeg,
    orbitalDistanceFactorPerMonth,
  );
  // [P4-52 fix] planetary albedo = 50/50 雲被覆混合の重み付き平均
  // 旧式 `surface + cloud*0.5` だと surface 0.15 + cloud 0.5 で planetary = 0.40 と
  // なり実 Earth (0.30) より 10pt 高く、equator annualMean が 16°C と異常に低かった。
  // 新式は「天空の 50% を雲、50% を表面が占める」物理直感に従う加重平均で
  // 0.5*0.5 + 0.5*0.15 = 0.325 ≈ Earth 0.30。
  const planetaryAlbedo = Math.min(0.95, 0.5 * cloudAlbedo + 0.5 * surfaceAlbedo);
  const absorbedFraction = 1 - planetaryAlbedo;
  const earthAbsorbedFraction = 1 - EARTH_REFERENCE_PLANETARY_ALBEDO;

  // 温室効果スケーリング: baseline は global mean に追従する量
  const greenhouseAdjustedBaseline =
    baselineCelsius - EARTH_REFERENCE_GLOBAL_MEAN_CELSIUS +
    EARTH_REFERENCE_GLOBAL_MEAN_CELSIUS * greenhouseStrengthRelative;

  // 年平均温度（強い緯度勾配を担当）
  const annualAnomaly =
    annualFactor * stellarFactor * absorbedFraction -
    GLOBAL_MEAN_INSOLATION_FACTOR * earthAbsorbedFraction;
  const annualTemp =
    greenhouseAdjustedBaseline +
    annualAnomaly * ANNUAL_INSOLATION_TO_TEMPERATURE_SCALE_CELSIUS;

  // 季節振幅（小さなスケールで polar day の暴走を抑制）
  const seasonalAnomaly = (monthFactor - annualFactor) * stellarFactor * absorbedFraction;
  const seasonalDelta =
    seasonalAnomaly * SEASONAL_INSOLATION_TO_TEMPERATURE_SCALE_CELSIUS;

  return annualTemp + seasonalDelta;
}

/**
 * 緯度方向に温度マップを平滑化（南北熱輸送）。
 *
 * 重み付き隣接平均で、係数 = `meridionalRelative × 0.10`
 * （地球比 1.0 で隣接 10% を mix）。複数月を同じ強度で平滑化する。
 */
function applyMeridionalSmoothing(
  latByMonth: number[][],
  meridionalRelative: number,
): void {
  if (meridionalRelative <= 0) return;
  const rows = latByMonth.length;
  if (rows === 0) return;
  const months = latByMonth[0]?.length ?? 0;
  const weight = Math.min(0.4, meridionalRelative * 0.1);
  // 1 パス（過剰平滑化を避けるため）
  for (let m = 0; m < months; m++) {
    const before: number[] = new Array(rows);
    for (let i = 0; i < rows; i++) before[i] = latByMonth[i]?.[m] ?? 0;
    for (let i = 0; i < rows; i++) {
      const center = before[i] ?? 0;
      const north = before[Math.min(rows - 1, i + 1)] ?? center;
      const south = before[Math.max(0, i - 1)] ?? center;
      const smoothed = center * (1 - weight) + ((north + south) / 2) * weight;
      const row = latByMonth[i];
      if (row) row[m] = smoothed;
    }
  }
}

/**
 * 各陸地セルから最寄り海洋セルまでの距離（セル数）を BFS で求める。
 * 海洋セルは 0、陸地セルは正の整数。距離 = 4 近傍 BFS。
 * 経度方向は wrap、緯度方向はクランプ。
 */
function computeDistanceToOcean(grid: Grid): number[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const dist: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) dist[i] = new Array<number>(cols).fill(Infinity);

  // 海洋セルを 0 で初期化、それ以外は Infinity
  const queue: Array<[number, number]> = [];
  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    const distRow = dist[i];
    if (!cellRow || !distRow) continue;
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (cell && !cell.isLand) {
        distRow[j] = 0;
        queue.push([i, j]);
      }
    }
  }

  // BFS
  let head = 0;
  while (head < queue.length) {
    const popped = queue[head++]!;
    const i = popped[0];
    const j = popped[1];
    const d = dist[i]?.[j] ?? Infinity;
    const next = d + 1;
    const neighbors: Array<[number, number]> = [
      [i + 1, j],
      [i - 1, j],
      [i, (j + 1) % cols],
      [i, (j - 1 + cols) % cols],
    ];
    for (const [ni, nj] of neighbors) {
      if (ni < 0 || ni >= rows) continue;
      const row = dist[ni];
      if (!row) continue;
      if (row[nj]! > next) {
        row[nj] = next;
        queue.push([ni, nj]);
      }
    }
  }

  return dist;
}

/**
 * 海セルの coastal correction を陸セルへ伝播させる（[現状.md ユーザ指摘 2026-05-03、P4-50]）。
 *
 * 旧来は陸セルの correction = 0 → 同緯度の land 温度が一致 → 気候帯が東西対称になる
 * 症状の主因の 1 つ。Pasta `Worldbuilder's Log #28` で「暖流/寒流は数百 km 内陸の
 * 気温に効く」と説明される現象を、最寄り海セルからの線形減衰で近似する。
 *
 * アルゴリズム: 各陸セルから (2*reach+1)^2 の窓を Chebyshev 距離で走査し、
 * 窓内の海セルの correction × decay の中で **絶対値最大** の符号付き値を採用する。
 * 経度はラップ、緯度はクランプ。
 *
 * 海セルは元の correction を保持。reach=0 なら何もしない。
 */
function propagateCoastalCorrectionInland(
  grid: Grid,
  oceanCorrection: ReadonlyArray<ReadonlyArray<number>>,
  reachCells: number,
): number[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const out: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const sourceRow = oceanCorrection[i];
    out[i] = sourceRow ? Array.from(sourceRow) : new Array<number>(cols).fill(0);
  }
  if (reachCells <= 0) return out;
  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    if (!cellRow) continue;
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (!cell || !cell.isLand) continue; // 海はそのまま
      // (2*reach+1)^2 窓走査
      let bestAbs = 0;
      let bestSigned = 0;
      for (let di = -reachCells; di <= reachCells; di++) {
        const ni = i + di;
        if (ni < 0 || ni >= rows) continue;
        const nRow = grid.cells[ni];
        if (!nRow) continue;
        const corrRow = oceanCorrection[ni];
        if (!corrRow) continue;
        for (let dj = -reachCells; dj <= reachCells; dj++) {
          const nj = ((j + dj) % cols + cols) % cols;
          const nCell = nRow[nj];
          if (!nCell || nCell.isLand) continue; // 陸は source 不可
          const sourceCorr = corrRow[nj] ?? 0;
          if (sourceCorr === 0) continue;
          const cheb = Math.max(Math.abs(di), Math.abs(dj));
          if (cheb > reachCells) continue;
          const decay = Math.max(0, 1 - cheb / (reachCells + 1));
          const weighted = sourceCorr * decay;
          const absVal = Math.abs(weighted);
          if (absVal > bestAbs) {
            bestAbs = absVal;
            bestSigned = weighted;
          }
        }
      }
      out[i]![j] = bestSigned;
    }
  }
  return out;
}

/**
 * 全セル × 全月の温度を「lapse rate + plateau cap + 海岸補正 + continentality」で初期化する。
 *
 * - 標高補正（[§4.3]）: 陸地で `lapseRate × elevationKm` を引く。海洋は基準面なので無補正。
 * - 高地高原キャップ（[§4.4]）: 標高 > 4 km の陸地は 10 °C を超えないようクランプ。
 * - 海岸補正（[§4.6]）: Step 3 の `monthlyCoastalTemperatureCorrectionCelsius` を加算。
 * - 大陸性（[§4.5]）: 陸地で「年平均からの偏差」を `1 + continentality × landAmpFactor` 倍する。
 *   landAmpFactor は内陸セル（海から CONTINENTAL_INTERIOR_CELL_THRESHOLD セル以上離れた陸地）で 1.0、
 *   海岸セルで 0.0、線形補間。
 */
function buildInitialMonthlyTemperatureCelsius(
  latByMonthBase: number[][],
  grid: Grid,
  lapseRateCelsiusPerKm: number,
  oceanCurrent: OceanCurrentResult,
  distToOcean: number[][],
  continentalityStrength: number,
  coastalCorrectionInlandReachCells: number,
): number[][][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const monthly: number[][][] = new Array(MONTHS_PER_YEAR);

  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const monthMap: number[][] = new Array(rows);
    const coastalCorrection = oceanCurrent.monthlyCoastalTemperatureCorrectionCelsius[m];
    // 月別: ocean cell の coastal correction を陸セルへ「最寄り海セルから線形減衰」で
    // 伝播させた拡張マップ（[現状.md ユーザ指摘 2026-05-03、P4-50]）。
    // 旧来は陸セルの correction が常に 0 → 同緯度で東西温度差が無く、Step 7 で
    // 同色の気候帯ラベルになる症状の主因の 1 つだった。
    const extendedCorrection = coastalCorrection
      ? propagateCoastalCorrectionInland(
          grid,
          coastalCorrection,
          coastalCorrectionInlandReachCells,
        )
      : null;
    for (let i = 0; i < rows; i++) {
      const cellRow = grid.cells[i];
      const base = latByMonthBase[i]?.[m] ?? 0;
      const correctionRow = extendedCorrection?.[i] ?? coastalCorrection?.[i];
      const row: number[] = new Array(cols);
      for (let j = 0; j < cols; j++) {
        const cell = cellRow?.[j];
        if (!cell) {
          row[j] = base;
          continue;
        }
        let t = base;
        if (cell.isLand) {
          const elevKm = cell.elevationMeters / 1000;
          t -= lapseRateCelsiusPerKm * elevKm;
        }
        const correction = correctionRow?.[j] ?? 0;
        t += correction;
        // 高地高原キャップ ([§4.4]) は coastal correction 適用後にも残るよう
        // ここで再適用する（propagation で陸内陸の高地に warm correction が乗り、
        // キャップを超える事例があるため [P4-50]）。
        if (cell?.isLand && cell.elevationMeters > PLATEAU_ELEVATION_THRESHOLD_METERS) {
          t = Math.min(t, PLATEAU_TEMPERATURE_CAP_CELSIUS);
        }
        row[j] = t;
      }
      monthMap[i] = row;
    }
    monthly[m] = monthMap;
  }

  if (continentalityStrength > 0) {
    // 各セルの年平均（continentality 増幅の中心）
    const annualMeanByCell: number[][] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const meanRow: number[] = new Array(cols);
      for (let j = 0; j < cols; j++) {
        let sum = 0;
        for (let m = 0; m < MONTHS_PER_YEAR; m++) sum += monthly[m]?.[i]?.[j] ?? 0;
        meanRow[j] = sum / MONTHS_PER_YEAR;
      }
      annualMeanByCell[i] = meanRow;
    }
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      for (let i = 0; i < rows; i++) {
        const cellRow = grid.cells[i];
        const distRow = distToOcean[i];
        const meanRow = annualMeanByCell[i];
        const monthRow = monthly[m]?.[i];
        if (!cellRow || !monthRow || !meanRow) continue;
        for (let j = 0; j < cols; j++) {
          const cell = cellRow[j];
          if (!cell || !cell.isLand) continue;
          const dist = distRow?.[j] ?? 0;
          const landAmp = Math.min(1, dist / CONTINENTAL_INTERIOR_CELL_THRESHOLD);
          const factor = 1 + continentalityStrength * landAmp;
          const mean = meanRow[j] ?? 0;
          const orig = monthRow[j] ?? mean;
          monthRow[j] = mean + (orig - mean) * factor;
        }
      }
    }
  }

  return monthly;
}

/**
 * 1 ヶ月分の温度マップに風移流補正を適用する（[docs/spec/05_気温.md §4.7]）。
 *
 * 各セルで風上 1 セル（u<0 なら東隣、v<0 なら南隣）の温度を、wind speed と
 * `strength` で決まる比率で混合する。風速 5 m/s で混合率 = strength。
 * 経度方向は wrap、緯度方向はクランプ。
 */
function applyWindAdvection(
  tempMap: number[][],
  windMap: GridMap<WindVector>,
  strength: number,
): number[][] {
  const rows = tempMap.length;
  if (rows === 0) return tempMap;
  const cols = tempMap[0]?.length ?? 0;
  const out: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const tempRow = tempMap[i];
    const windRow = windMap[i];
    const newRow: number[] = new Array(cols);
    if (!tempRow) {
      out[i] = new Array<number>(cols).fill(0);
      continue;
    }
    for (let j = 0; j < cols; j++) {
      const t = tempRow[j] ?? 0;
      const w = windRow?.[j];
      if (!w) {
        newRow[j] = t;
        continue;
      }
      // 風上方向の隣接セル
      const upJ = w.uMps >= 0 ? (j - 1 + cols) % cols : (j + 1) % cols;
      const upI = w.vMps >= 0 ? Math.max(0, i - 1) : Math.min(rows - 1, i + 1);
      const upTemp = tempMap[upI]?.[upJ] ?? t;
      const speed = Math.sqrt(w.uMps * w.uMps + w.vMps * w.vMps);
      const blendRatio = Math.min(0.5, strength * (speed / WIND_ADVECTION_REFERENCE_SPEED_MPS));
      newRow[j] = t * (1 - blendRatio) + upTemp * blendRatio;
    }
    out[i] = newRow;
  }
  return out;
}

/**
 * 各セルの夏最高気温・冬最低気温・年平均・年振幅を抽出する。
 *
 * 半球反転は値生成側（基底気温）が既に処理しているため、ここでは単純な月別 max / min を返す。
 * 極反転ケースでも `summerMax` / `winterMin` は「年内 max / 年内 min」なので矛盾なく動く。
 */
function extractSeasonalExtremes(
  monthlyTemp: number[][][],
  rows: number,
  cols: number,
): {
  readonly summerMax: number[][];
  readonly winterMin: number[][];
  readonly annualMean: number[][];
  readonly amplitude: number[][];
} {
  const summerMax: number[][] = new Array(rows);
  const winterMin: number[][] = new Array(rows);
  const annualMean: number[][] = new Array(rows);
  const amplitude: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const sRow: number[] = new Array(cols);
    const wRow: number[] = new Array(cols);
    const aRow: number[] = new Array(cols);
    const ampRow: number[] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      let max = -Infinity;
      let min = Infinity;
      let sum = 0;
      for (let m = 0; m < MONTHS_PER_YEAR; m++) {
        const t = monthlyTemp[m]?.[i]?.[j] ?? 0;
        if (t > max) max = t;
        if (t < min) min = t;
        sum += t;
      }
      sRow[j] = max;
      wRow[j] = min;
      aRow[j] = sum / MONTHS_PER_YEAR;
      ampRow[j] = max - min;
    }
    summerMax[i] = sRow;
    winterMin[i] = wRow;
    annualMean[i] = aRow;
    amplitude[i] = ampRow;
  }
  return { summerMax, winterMin, annualMean, amplitude };
}

/**
 * Marching Squares で温度マップから等温線を抽出する（[docs/spec/05_気温.md §4.12]）。
 *
 * 各セルの 4 隅（実際は 4 隣接セルの中心）の温度を読み、`level` を境にした case
 * （0〜15 の 4 ビットインデックス）でセグメント端点を決定する。隣接セルとの中心の
 * 経度経度を線形補間して交点を出す。
 *
 * 経度方向は wraparound するが、可視化用としては「セル間の補間が経度をまたぐと
 * 見栄えが悪い」ため wrap セグメントは生成しない（西端と東端をつなぐ補間は省略）。
 * 緯度方向はクランプ（南北端は補間なし）。
 *
 * 返すセグメント列は順序を保証せず、UI 側でストロークするときに線分集合として描く。
 */
function extractIsothermSegmentsAtLevel(
  tempMap: GridMap<number>,
  grid: Grid,
  level: number,
): IsothermSegment[] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const segments: IsothermSegment[] = [];

  // セル中心の緯度経度を求めるヘルパ
  const latAt = (i: number): number => -90 + (i + 0.5) * grid.resolutionDeg;
  const lonAt = (j: number): number => -180 + (j + 0.5) * grid.resolutionDeg;

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      // 4 隅: BL=(i,j), BR=(i,j+1), TL=(i+1,j), TR=(i+1,j+1)
      const v00 = tempMap[i]?.[j];
      const v01 = tempMap[i]?.[j + 1];
      const v10 = tempMap[i + 1]?.[j];
      const v11 = tempMap[i + 1]?.[j + 1];
      if (v00 === undefined || v01 === undefined || v10 === undefined || v11 === undefined) {
        continue;
      }
      // ビット: BL=1, BR=2, TR=4, TL=8（標準 marching squares）
      let caseIndex = 0;
      if (v00 >= level) caseIndex |= 1;
      if (v01 >= level) caseIndex |= 2;
      if (v11 >= level) caseIndex |= 4;
      if (v10 >= level) caseIndex |= 8;
      if (caseIndex === 0 || caseIndex === 15) continue;

      // 隣接 2 値の間で level に到達する位置を線形補間
      const interp = (a: number, b: number): number => {
        const denom = b - a;
        if (Math.abs(denom) < 1e-12) return 0.5;
        return (level - a) / denom;
      };

      const lat0 = latAt(i);
      const lat1 = latAt(i + 1);
      const lon0 = lonAt(j);
      const lon1 = lonAt(j + 1);

      // 各エッジの交点を計算（ある場合のみ）
      // 下辺 BL-BR: 経度方向、緯度 = lat0
      const bottom: GeoPoint = {
        latitudeDeg: lat0,
        longitudeDeg: lon0 + (lon1 - lon0) * interp(v00, v01),
      };
      // 右辺 BR-TR: 緯度方向、経度 = lon1
      const right: GeoPoint = {
        latitudeDeg: lat0 + (lat1 - lat0) * interp(v01, v11),
        longitudeDeg: lon1,
      };
      // 上辺 TL-TR: 経度方向、緯度 = lat1
      const top: GeoPoint = {
        latitudeDeg: lat1,
        longitudeDeg: lon0 + (lon1 - lon0) * interp(v10, v11),
      };
      // 左辺 BL-TL: 緯度方向、経度 = lon0
      const left: GeoPoint = {
        latitudeDeg: lat0 + (lat1 - lat0) * interp(v00, v10),
        longitudeDeg: lon0,
      };

      // 各 case でセグメントを追加（ambiguous case 5/10 はそのまま 2 線分扱い）
      switch (caseIndex) {
        case 1:
        case 14:
          segments.push({ start: left, end: bottom });
          break;
        case 2:
        case 13:
          segments.push({ start: bottom, end: right });
          break;
        case 3:
        case 12:
          segments.push({ start: left, end: right });
          break;
        case 4:
        case 11:
          segments.push({ start: top, end: right });
          break;
        case 6:
        case 9:
          segments.push({ start: bottom, end: top });
          break;
        case 7:
        case 8:
          segments.push({ start: left, end: top });
          break;
        case 5:
          segments.push({ start: left, end: top });
          segments.push({ start: bottom, end: right });
          break;
        case 10:
          segments.push({ start: left, end: bottom });
          segments.push({ start: top, end: right });
          break;
        default:
          break;
      }
    }
  }

  return segments;
}

/**
 * 温度マップ全体から、刻み幅 `intervalCelsius` で並ぶすべての等温線を抽出する。
 * 全マップの min / max を取り、`floor(min / interval) * interval` から
 * `ceil(max / interval) * interval` まで `interval` 刻みでレベルを決定する。
 *
 * intervalCelsius ≤ 0 の場合は空配列を返す（生成抑制）。
 */
function extractIsotherms(
  tempMap: GridMap<number>,
  grid: Grid,
  intervalCelsius: number,
): IsothermLine[] {
  if (intervalCelsius <= 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const row of tempMap) {
    for (const v of row) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const startLevel = Math.ceil(min / intervalCelsius) * intervalCelsius;
  const endLevel = Math.floor(max / intervalCelsius) * intervalCelsius;
  const lines: IsothermLine[] = [];
  // ループ回数の安全上限（暴走防止）
  const MAX_LEVELS = 200;
  let count = 0;
  for (
    let level = startLevel;
    level <= endLevel + 1e-9 && count < MAX_LEVELS;
    level += intervalCelsius, count++
  ) {
    const segments = extractIsothermSegmentsAtLevel(tempMap, grid, level);
    if (segments.length > 0) {
      lines.push({ temperatureCelsius: level, segments });
    }
  }
  return lines;
}

/**
 * Step 5 気温 純粋関数。
 *
 * 入力契約: PlanetParams + Grid + ITCZ/WindBelt/OceanCurrent/Airflow Result + params。
 * 出力契約: TemperatureResult（[docs/spec/05_気温.md §5]）。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。
 */
export function computeTemperature(
  planet: PlanetParams,
  grid: Grid,
  // ITCZ / WindBelt は本最小実装では使用しないが、後続の月別補正（モンスーン期の
  // 雲量変化など）で参照される予定なので契約として受け取る。
  _itczResult: ITCZResult,
  _windBeltResult: WindBeltResult,
  oceanCurrentResult: OceanCurrentResult,
  airflowResult: AirflowResult,
  params: TemperatureStepParams = DEFAULT_TEMPERATURE_STEP_PARAMS,
): TemperatureResult {
  const { axialTiltDeg } = planet.body;
  const { eccentricity, argumentOfPerihelionDeg, starLuminositySolar, semiMajorAxisAU } =
    planet.orbital;
  const {
    surfaceAlbedoFraction,
    cloudAlbedoFraction,
    lapseRateCelsiusPerKm,
    meridionalHeatTransportRelative,
    greenhouseStrengthRelative,
  } = planet.atmosphereOcean;
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const polarInversion = axialTiltDeg > POLAR_INVERSION_AXIAL_TILT_DEG;

  // 1. 月別距離係数（離心率による振幅）と恒星因子（光度 / a²）
  const orbitalDistanceFactorPerMonth: number[] = new Array(MONTHS_PER_YEAR);
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    orbitalDistanceFactorPerMonth[m] = distanceFactorByMonth(
      m,
      eccentricity,
      argumentOfPerihelionDeg,
    );
  }
  const semiMajorAxisAUClamped = Math.max(0.01, semiMajorAxisAU);
  const stellarFactorBase =
    starLuminositySolar / (semiMajorAxisAUClamped * semiMajorAxisAUClamped);

  // 2. 緯度 × 月別ベース温度（年平均 + 季節振幅の 2 段階スケール）
  const latByMonthBase: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    const latDeg = cellRow?.[0]?.latitudeDeg ?? -90 + (i + 0.5) * grid.resolutionDeg;
    const monthRow: number[] = new Array(MONTHS_PER_YEAR);
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      monthRow[m] = computeLatitudeBaseTemperatureCelsius(
        latDeg,
        m,
        axialTiltDeg,
        stellarFactorBase,
        orbitalDistanceFactorPerMonth,
        params.globalMeanBaselineCelsius,
        greenhouseStrengthRelative,
        surfaceAlbedoFraction,
        cloudAlbedoFraction,
      );
    }
    latByMonthBase[i] = monthRow;
  }

  // 3. 南北熱輸送（緯度方向の平滑化）
  applyMeridionalSmoothing(latByMonthBase, meridionalHeatTransportRelative);

  // 4. 海岸距離マップ（continentality 用）
  const distToOcean = computeDistanceToOcean(grid);

  // 5. 初期 2D 温度マップ（lapse + plateau cap + coastal + continentality）
  const monthlyTemp = buildInitialMonthlyTemperatureCelsius(
    latByMonthBase,
    grid,
    lapseRateCelsiusPerKm,
    oceanCurrentResult,
    distToOcean,
    params.continentalityStrength,
    params.coastalCorrectionInlandReachCells,
  );

  // 6. 風移流補正（月別）
  if (params.windAdvectionStrength > 0) {
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      const wm = airflowResult.monthlyWindField[m];
      const tm = monthlyTemp[m];
      if (!wm || !tm) continue;
      monthlyTemp[m] = applyWindAdvection(tm, wm, params.windAdvectionStrength);
    }
    // 風移流後に高地高原キャップを再適用（[§4.4]）。
    // advection が暖い隣接セルから熱を運び込むと plateau cap を超えるため
    // ([P4-50] で coastal correction inland propagation 強化により顕在化)。
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      const tm = monthlyTemp[m];
      if (!tm) continue;
      for (let i = 0; i < rows; i++) {
        const cellRow = grid.cells[i];
        const tRow = tm[i];
        if (!cellRow || !tRow) continue;
        for (let j = 0; j < cols; j++) {
          const cell = cellRow[j];
          if (
            cell?.isLand &&
            cell.elevationMeters > PLATEAU_ELEVATION_THRESHOLD_METERS &&
            tRow[j]! > PLATEAU_TEMPERATURE_CAP_CELSIUS
          ) {
            tRow[j] = PLATEAU_TEMPERATURE_CAP_CELSIUS;
          }
        }
      }
    }
  }

  // 7. 雪氷アルベドフィードバック（反復）
  // 累積雪氷マスク。各反復で「summerMax ≤ 0 だが累積マスクには未登録」のセルを抽出し、
  // それらにのみ追加冷却を適用する。既登録セルは冷却済みなので二重冷却を避ける。
  const snowIceMask: boolean[][] = new Array(rows);
  for (let i = 0; i < rows; i++) snowIceMask[i] = new Array<boolean>(cols).fill(false);

  const iterations = Math.max(0, Math.min(3, Math.round(params.snowIceFeedbackIterations)));
  // フィードバック有無に関わらず、初回判定で累積マスクを埋める
  {
    const { summerMax } = extractSeasonalExtremes(monthlyTemp, rows, cols);
    for (let i = 0; i < rows; i++) {
      const sRow = summerMax[i];
      const maskRow = snowIceMask[i];
      if (!maskRow) continue;
      for (let j = 0; j < cols; j++) {
        if ((sRow?.[j] ?? Infinity) <= SNOW_ICE_SUMMER_MAX_THRESHOLD_CELSIUS) {
          maskRow[j] = true;
        }
      }
    }
  }
  for (let it = 0; it < iterations; it++) {
    // 直前ラウンドで判定された ice セル（または初回はすべての ice セル）に冷却を適用
    const newlyIcedThisRound: boolean[][] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const sRow = it === 0
        ? snowIceMask[i] // 初回は累積マスク全体を冷却対象とする
        : null;
      newlyIcedThisRound[i] = sRow ? [...sRow] : new Array<boolean>(cols).fill(false);
    }
    if (it > 0) {
      // 2 回目以降は「summerMax ≤ 0 かつ累積マスクに未登録」のセルを新規判定
      const { summerMax } = extractSeasonalExtremes(monthlyTemp, rows, cols);
      for (let i = 0; i < rows; i++) {
        const sRow = summerMax[i];
        const maskRow = snowIceMask[i];
        const newRow = newlyIcedThisRound[i];
        if (!maskRow || !newRow) continue;
        for (let j = 0; j < cols; j++) {
          if (
            (sRow?.[j] ?? Infinity) <= SNOW_ICE_SUMMER_MAX_THRESHOLD_CELSIUS &&
            !maskRow[j]
          ) {
            newRow[j] = true;
            maskRow[j] = true;
          }
        }
      }
    }
    let anyNew = false;
    for (const row of newlyIcedThisRound) {
      for (const v of row) {
        if (v) {
          anyNew = true;
          break;
        }
      }
      if (anyNew) break;
    }
    if (!anyNew) break;
    // 冷却適用
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      const monthMap = monthlyTemp[m];
      if (!monthMap) continue;
      for (let i = 0; i < rows; i++) {
        const tRow = monthMap[i];
        const iceRow = newlyIcedThisRound[i];
        if (!tRow || !iceRow) continue;
        for (let j = 0; j < cols; j++) {
          if (iceRow[j]) tRow[j] = (tRow[j] ?? 0) - SNOW_ICE_ADDITIONAL_COOLING_CELSIUS;
        }
      }
    }
  }

  // 8. 季節極値・年平均・振幅
  const { summerMax, winterMin, annualMean, amplitude } = extractSeasonalExtremes(
    monthlyTemp,
    rows,
    cols,
  );

  // 9. 蒸発散量（暫定: max(0, T) × 係数、月別、Pasta §7.5 未確定）
  const monthlyET: number[][][] = new Array(MONTHS_PER_YEAR);
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const tMap = monthlyTemp[m];
    const etMap: number[][] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      const tRow = tMap?.[i];
      const etRow: number[] = new Array(cols);
      for (let j = 0; j < cols; j++) {
        const t = tRow?.[j] ?? 0;
        etRow[j] = Math.max(0, t) * params.evapotranspirationCoefficientMmPerCelsius;
      }
      etMap[i] = etRow;
    }
    monthlyET[m] = etMap;
  }

  // 10. Months12 タプル化
  const monthlyTemperatureCelsius: Months12<GridMap<number>> = [
    monthlyTemp[0]!, monthlyTemp[1]!, monthlyTemp[2]!, monthlyTemp[3]!,
    monthlyTemp[4]!, monthlyTemp[5]!, monthlyTemp[6]!, monthlyTemp[7]!,
    monthlyTemp[8]!, monthlyTemp[9]!, monthlyTemp[10]!, monthlyTemp[11]!,
  ];
  const monthlyEvapotranspirationMmPerMonth: Months12<GridMap<number>> = [
    monthlyET[0]!, monthlyET[1]!, monthlyET[2]!, monthlyET[3]!,
    monthlyET[4]!, monthlyET[5]!, monthlyET[6]!, monthlyET[7]!,
    monthlyET[8]!, monthlyET[9]!, monthlyET[10]!, monthlyET[11]!,
  ];

  // 11. 等温線（[docs/spec/05_気温.md §4.12]）
  // 月別と年平均の双方を抽出する。intervalCelsius=0 で抑制（空配列）。
  const interval = params.isothermIntervalCelsius;
  const monthlyIsothermsArr: IsothermLine[][] = monthlyTemperatureCelsius.map((m) =>
    extractIsotherms(m, grid, interval),
  );
  const monthlyIsotherms: Months12<ReadonlyArray<IsothermLine>> = [
    monthlyIsothermsArr[0]!, monthlyIsothermsArr[1]!, monthlyIsothermsArr[2]!, monthlyIsothermsArr[3]!,
    monthlyIsothermsArr[4]!, monthlyIsothermsArr[5]!, monthlyIsothermsArr[6]!, monthlyIsothermsArr[7]!,
    monthlyIsothermsArr[8]!, monthlyIsothermsArr[9]!, monthlyIsothermsArr[10]!, monthlyIsothermsArr[11]!,
  ];
  const annualIsotherms: ReadonlyArray<IsothermLine> = extractIsotherms(
    annualMean as GridMap<number>,
    grid,
    interval,
  );

  return {
    monthlyTemperatureCelsius,
    annualMeanTemperatureCelsius: annualMean as GridMap<number>,
    summerMaxTemperatureCelsius: summerMax as GridMap<number>,
    winterMinTemperatureCelsius: winterMin as GridMap<number>,
    snowIceMask: snowIceMask as GridMap<boolean>,
    monthlyEvapotranspirationMmPerMonth,
    seasonalAmplitudeCelsius: amplitude as GridMap<number>,
    polarInversion,
    monthlyIsotherms,
    annualIsotherms,
  };
}

/**
 * 内部ヘルパの公開（テスト用）。
 * 戻り値のクランプ・分岐の境界を直接検証するためのみ使う（[要件定義書.md §3.2] 決定性の保証）。
 */
export const __internals = {
  dailyInsolationFactor,
  distanceFactorByMonth,
  computeDistanceToOcean,
  extractIsotherms,
  extractIsothermSegmentsAtLevel,
  propagateCoastalCorrectionInland,
};

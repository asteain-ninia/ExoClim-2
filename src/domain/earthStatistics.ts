// 地球の hypsometric statistics（緯度別の陸地割合と標高分布）。
// 出典:
//   - 旧 ExoClim `services/geography.ts` の EARTH_STATS テーブル（[実装済み.md §旧 ExoClim] 参照）。
//   - 元データは NASA / GTOPO30 系の標高グリッドを 5° 緯度帯 × 5 標高ビンで集計したもの。
// 用途: 地形生成（[src/domain/terrain.ts]）で「各緯度の陸地割合・標高分布を実地球に整合させる」拘束に使う。
// 規約: 値は [0, 1] の小数（その緯度帯における対応標高ビンへの割合）。
//   合計（5 ビンの和） = その緯度帯の陸地割合。海洋割合は 1 − 陸地割合。

/** 標高ビン（メートル）の境界。陸地のみを 5 階級に分割する。 */
export interface ElevationBinMeters {
  readonly minMeters: number;
  readonly maxMeters: number;
}

export const ELEVATION_BINS_METERS: readonly ElevationBinMeters[] = [
  { minMeters: 0, maxMeters: 200 },
  { minMeters: 200, maxMeters: 500 },
  { minMeters: 500, maxMeters: 1000 },
  { minMeters: 1000, maxMeters: 2000 },
  { minMeters: 2000, maxMeters: 6000 },
];

/** 5° 緯度帯の hypsometric 統計エントリ。 */
export interface EarthLatitudeStat {
  /** 緯度帯の中心（度）。-87.5 から +87.5 まで 5° 刻み。 */
  readonly latitudeDeg: number;
  /** 5 標高ビンの占有率（陸地割合に占める各ビンの割合ではなく、緯度帯の総セルに占める割合）。 */
  readonly bins: readonly [number, number, number, number, number];
}

/** 緯度帯ごとの hypsometric 統計（南極側から北極側へ）。 */
export const EARTH_LATITUDE_STATISTICS: readonly EarthLatitudeStat[] = [
  { latitudeDeg: -87.5, bins: [0.009136, 0.005815, 0.010033, 0.116746, 0.858269] },
  { latitudeDeg: -82.5, bins: [0.182381, 0.0544, 0.074232, 0.194747, 0.492565] },
  { latitudeDeg: -77.5, bins: [0.105328, 0.030922, 0.064255, 0.167538, 0.478696] },
  { latitudeDeg: -72.5, bins: [0.066211, 0.026735, 0.041187, 0.105193, 0.35121] },
  { latitudeDeg: -67.5, bins: [0.031472, 0.012559, 0.02872, 0.079115, 0.056712] },
  { latitudeDeg: -62.5, bins: [0.001042, 0.000928, 0.000742, 0.000542, 0.000014] },
  { latitudeDeg: -57.5, bins: [0.000577, 0.000235, 0.000088, 0.000001, 0.0] },
  { latitudeDeg: -52.5, bins: [0.0085, 0.005344, 0.001909, 0.000576, 0.000029] },
  { latitudeDeg: -47.5, bins: [0.00672, 0.007734, 0.008397, 0.003197, 0.00009] },
  { latitudeDeg: -42.5, bins: [0.009831, 0.008563, 0.010758, 0.008184, 0.000046] },
  { latitudeDeg: -37.5, bins: [0.032157, 0.018558, 0.008091, 0.006136, 0.001342] },
  { latitudeDeg: -32.5, bins: [0.075449, 0.043259, 0.019907, 0.015779, 0.004317] },
  { latitudeDeg: -27.5, bins: [0.065395, 0.069657, 0.037809, 0.033558, 0.009961] },
  { latitudeDeg: -22.5, bins: [0.04905, 0.094212, 0.051427, 0.0389, 0.012486] },
  { latitudeDeg: -17.5, bins: [0.051153, 0.066741, 0.055849, 0.049413, 0.014746] },
  { latitudeDeg: -12.5, bins: [0.037755, 0.066506, 0.034395, 0.055945, 0.010383] },
  { latitudeDeg: -7.5, bins: [0.077269, 0.067036, 0.04839, 0.033348, 0.006208] },
  { latitudeDeg: -2.5, bins: [0.127284, 0.05537, 0.02812, 0.026203, 0.005908] },
  { latitudeDeg: 2.5, bins: [0.069399, 0.066868, 0.05408, 0.019938, 0.003743] },
  { latitudeDeg: 7.5, bins: [0.076775, 0.078565, 0.056015, 0.024192, 0.007546] },
  { latitudeDeg: 12.5, bins: [0.051216, 0.11423, 0.0511, 0.014747, 0.004682] },
  { latitudeDeg: 17.5, bins: [0.058799, 0.134731, 0.071279, 0.020531, 0.005816] },
  { latitudeDeg: 22.5, bins: [0.081182, 0.126006, 0.0952, 0.038894, 0.009185] },
  { latitudeDeg: 27.5, bins: [0.098845, 0.127138, 0.084591, 0.052514, 0.039378] },
  { latitudeDeg: 32.5, bins: [0.111337, 0.061413, 0.077413, 0.073114, 0.098636] },
  { latitudeDeg: 37.5, bins: [0.069925, 0.075435, 0.060837, 0.119961, 0.097831] },
  { latitudeDeg: 42.5, bins: [0.089671, 0.1125, 0.090149, 0.138303, 0.040349] },
  { latitudeDeg: 47.5, bins: [0.147069, 0.167387, 0.111808, 0.088747, 0.024053] },
  { latitudeDeg: 52.5, bins: [0.195211, 0.187629, 0.134505, 0.06431, 0.011058] },
  { latitudeDeg: 57.5, bins: [0.230437, 0.169657, 0.101665, 0.045804, 0.000871] },
  { latitudeDeg: 62.5, bins: [0.280279, 0.231287, 0.104468, 0.072484, 0.011983] },
  { latitudeDeg: 67.5, bins: [0.29878, 0.229438, 0.121484, 0.046157, 0.028845] },
  { latitudeDeg: 72.5, bins: [0.20198, 0.057586, 0.020519, 0.019809, 0.057262] },
  { latitudeDeg: 77.5, bins: [0.062937, 0.035822, 0.028418, 0.044103, 0.067972] },
  { latitudeDeg: 82.5, bins: [0.023247, 0.030204, 0.042001, 0.038523, 0.00293] },
  { latitudeDeg: 87.5, bins: [0.0, 0.0, 0.0, 0.0, 0.0] },
];

/**
 * 地球全体の陸地割合（おおよそ 0.29、海洋 0.71）。
 * 緯度帯統計の cos(lat) 重み付き積分で推定。地形生成の `procedural` バリアントで
 * 利用者指定 landFraction を地球比でスケーリングする際の基準値とする。
 */
export const EARTH_GLOBAL_LAND_FRACTION = 0.29;

/** 指定緯度（度）における陸地割合とビン分布を、近隣統計帯から線形補間して返す。 */
export function getEarthStatisticsAt(latitudeDeg: number): {
  readonly landFraction: number;
  readonly bins: readonly [number, number, number, number, number];
} {
  const stats = EARTH_LATITUDE_STATISTICS;
  // 線形検索で latitudeDeg 直前のエントリを見つける
  let i = 0;
  while (i < stats.length - 1 && stats[i + 1]!.latitudeDeg < latitudeDeg) {
    i++;
  }
  const p1 = stats[i]!;
  const p2 = stats[Math.min(i + 1, stats.length - 1)]!;

  let t = 0;
  if (p2.latitudeDeg !== p1.latitudeDeg) {
    t = (latitudeDeg - p1.latitudeDeg) / (p2.latitudeDeg - p1.latitudeDeg);
  }
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  const interpolatedBins: [number, number, number, number, number] = [
    p1.bins[0] * (1 - t) + p2.bins[0] * t,
    p1.bins[1] * (1 - t) + p2.bins[1] * t,
    p1.bins[2] * (1 - t) + p2.bins[2] * t,
    p1.bins[3] * (1 - t) + p2.bins[3] * t,
    p1.bins[4] * (1 - t) + p2.bins[4] * t,
  ];
  const landFraction =
    interpolatedBins[0] + interpolatedBins[1] + interpolatedBins[2] + interpolatedBins[3] + interpolatedBins[4];
  return { landFraction, bins: interpolatedBins };
}

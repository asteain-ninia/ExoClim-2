import { describe, expect, it } from 'vitest';
import type {
  AirflowResult,
  ClimateClassificationSystem,
  ClimateZoneResult,
  CollisionPointType,
  CurrentClassification,
  GridMap,
  ITCZResult,
  Months12,
  OceanCurrentResult,
  PrecipitationLabel,
  PrecipitationResult,
  PressureCenterType,
  SimulationResult,
  TemperatureResult,
  WindBeltResult,
  WindVector,
} from '@/domain';

/** 同値で長さ 12 のタプル（テスト用ヘルパ）。 */
function months12<T>(value: T): Months12<T> {
  return [value, value, value, value, value, value, value, value, value, value, value, value];
}

/** N×M の同値 GridMap（テスト用ヘルパ）。 */
function makeGridMap<T>(latCount: number, lonCount: number, value: T): GridMap<T> {
  return Array.from({ length: latCount }, () =>
    Array.from({ length: lonCount }, () => value),
  );
}

describe('domain/stepResults: Step 結果型と SimulationResult', () => {
  describe('共通 primitive（要件定義書 §4.3）', () => {
    it('Months12 は長さ 12 のタプル', () => {
      const m: Months12<number> = months12(0);
      expect(m.length).toBe(12);
    });

    it('GridMap は二次元配列で latitudeCount × longitudeCount の形を取る', () => {
      const g: GridMap<number> = makeGridMap(180, 360, 0);
      expect(g.length).toBe(180);
      expect(g[0]?.length).toBe(360);
    });

    it('WindVector は U/V 成分を持つ', () => {
      const w: WindVector = { uMps: 5, vMps: -2 };
      expect(w.uMps).toBe(5);
      expect(w.vMps).toBe(-2);
    });
  });

  describe('Step 1 ITCZResult（docs/spec/01 §5）', () => {
    it('月別 ITCZ 中心線と影響帯 + 年平均線を保持できる', () => {
      const result: ITCZResult = {
        monthlyBands: months12([
          { centerLatitudeDeg: 0, southBoundLatitudeDeg: -15, northBoundLatitudeDeg: 15 },
        ]),
        annualMeanCenterLatitudeDeg: [0],
      };
      expect(result.monthlyBands.length).toBe(12);
      expect(result.monthlyBands[0]?.[0]?.northBoundLatitudeDeg).toBe(15);
      expect(result.annualMeanCenterLatitudeDeg.length).toBe(1);
    });
  });

  describe('Step 2 WindBeltResult（docs/spec/02 §5）', () => {
    it('卓越風・気圧マップ・セル境界・モンスーン・湧昇・ITCZ 調整を保持できる', () => {
      const grid: GridMap<WindVector> = makeGridMap(2, 2, { uMps: 0, vMps: 0 });
      const pressureGrid: GridMap<number> = makeGridMap(2, 2, 1013.25);
      const boolGrid: GridMap<boolean> = makeGridMap(2, 2, false);
      const result: WindBeltResult = {
        monthlyPrevailingWind: months12(grid),
        monthlySurfacePressureHpa: months12(pressureGrid),
        monthlyCellBoundariesDeg: months12([-60, -30, 0, 30, 60]),
        monthlyMonsoonMask: months12(boolGrid),
        monthlyCoastalUpwellingMask: months12(boolGrid),
        itczInfluenceAdjustmentDeg: months12([0, 0]),
      };
      expect(result.monthlyCellBoundariesDeg[0]?.length).toBe(5);
    });
  });

  describe('Step 3 OceanCurrentResult（docs/spec/03 §5）', () => {
    it('CurrentClassification と CollisionPointType の網羅性が型レベルで担保される', () => {
      const classify = (c: CurrentClassification): string => {
        switch (c) {
          case 'warm':
            return 'W';
          case 'cold':
            return 'C';
          case 'neutral':
            return 'N';
        }
      };
      const collisionLabel = (t: CollisionPointType): string => {
        switch (t) {
          case 'equatorial_current':
            return 'eq';
          case 'polar_current':
            return 'po';
        }
      };
      expect(classify('warm')).toBe('W');
      expect(collisionLabel('polar_current')).toBe('po');
    });

    it('海流結果は流線・海氷・海岸補正・衝突点・ENSO ダイポールを保持できる', () => {
      const boolGrid: GridMap<boolean> = makeGridMap(2, 2, false);
      const numGrid: GridMap<number> = makeGridMap(2, 2, 0);
      const result: OceanCurrentResult = {
        monthlyStreamlines: months12([
          {
            classification: 'warm',
            path: [
              { latitudeDeg: 0, longitudeDeg: 0 },
              { latitudeDeg: 5, longitudeDeg: 5 },
            ],
          },
        ]),
        monthlySeaIceMask: months12(boolGrid),
        monthlyCoastalTemperatureCorrectionCelsius: months12(numGrid),
        monthlyCollisionPoints: months12([
          {
            type: 'equatorial_current',
            position: { latitudeDeg: 0, longitudeDeg: 30 },
          },
        ]),
        ensoDipoleCandidateMask: boolGrid,
      };
      expect(result.monthlyStreamlines[0]?.[0]?.classification).toBe('warm');
      expect(result.monthlyCollisionPoints[0]?.[0]?.type).toBe('equatorial_current');
    });
  });

  describe('Step 4 AirflowResult（docs/spec/04 §5）', () => {
    it('PressureCenterType の網羅性が型レベルで担保される', () => {
      const polarity = (t: PressureCenterType): -1 | 1 => (t === 'high' ? 1 : -1);
      expect(polarity('high')).toBe(1);
      expect(polarity('low')).toBe(-1);
    });

    it('風ベクトル場・気圧 anomaly・気圧中心・山脈偏向フラグを保持できる', () => {
      const windGrid: GridMap<WindVector> = makeGridMap(2, 2, { uMps: 0, vMps: 0 });
      const numGrid: GridMap<number> = makeGridMap(2, 2, 0);
      const boolGrid: GridMap<boolean> = makeGridMap(2, 2, false);
      const result: AirflowResult = {
        monthlyWindField: months12(windGrid),
        monthlyPressureAnomalyHpa: months12(numGrid),
        monthlyPressureCenters: months12([
          {
            type: 'high',
            position: { latitudeDeg: 30, longitudeDeg: -30 },
            intensityHpa: 8,
          },
        ]),
        mountainDeflectionApplied: boolGrid,
      };
      expect(result.monthlyPressureCenters[0]?.[0]?.intensityHpa).toBe(8);
    });
  });

  describe('Step 5 TemperatureResult（docs/spec/05 §5）', () => {
    it('月別気温・年平均・季節極値・雪氷・蒸発散・季節振幅・極反転を保持できる', () => {
      const numGrid: GridMap<number> = makeGridMap(2, 2, 15);
      const boolGrid: GridMap<boolean> = makeGridMap(2, 2, false);
      const result: TemperatureResult = {
        monthlyTemperatureCelsius: months12(numGrid),
        annualMeanTemperatureCelsius: numGrid,
        summerMaxTemperatureCelsius: numGrid,
        winterMinTemperatureCelsius: numGrid,
        snowIceMask: boolGrid,
        monthlyEvapotranspirationMmPerMonth: months12(numGrid),
        seasonalAmplitudeCelsius: numGrid,
        polarInversion: false,
        monthlyIsotherms: months12([]),
        annualIsotherms: [],
      };
      expect(result.polarInversion).toBe(false);
      expect(result.monthlyTemperatureCelsius.length).toBe(12);
      expect(result.annualIsotherms.length).toBe(0);
    });
  });

  describe('Step 6 PrecipitationResult（docs/spec/06 §5）', () => {
    it('PrecipitationLabel の 4 階調が型レベルで担保される', () => {
      const score = (label: PrecipitationLabel): 0 | 1 | 2 | 3 => {
        switch (label) {
          case 'dry':
            return 0;
          case 'normal':
            return 1;
          case 'wet':
            return 2;
          case 'very_wet':
            return 3;
        }
      };
      expect(score('dry')).toBe(0);
      expect(score('very_wet')).toBe(3);
    });

    it('降水ラベル・湿潤帯・山脈マスク・前線・極前線・起伏を保持できる', () => {
      const labelGrid: GridMap<PrecipitationLabel> = makeGridMap(2, 2, 'normal');
      const boolGrid: GridMap<boolean> = makeGridMap(2, 2, false);
      const numGrid: GridMap<number> = makeGridMap(2, 2, 0);
      const result: PrecipitationResult = {
        monthlyPrecipitationLabels: months12(labelGrid),
        warmCurrentHumidBeltMask: boolGrid,
        warmCurrentFetchKm: numGrid,
        mountainWindwardMask: boolGrid,
        mountainLeewardMask: boolGrid,
        monthlyFrontPassageFrequency: months12(numGrid),
        polarFrontExtensionMask: boolGrid,
        mountainReliefMeters: numGrid,
      };
      expect(result.monthlyPrecipitationLabels[0]?.[0]?.[0]).toBe('normal');
    });
  });

  describe('Step 7 ClimateZoneResult（docs/spec/07 §5）', () => {
    it('ClimateClassificationSystem の網羅性が型レベルで担保される', () => {
      const label = (s: ClimateClassificationSystem): string => {
        switch (s) {
          case 'koppen_geiger':
            return 'KG';
          case 'pasta_bioclimate':
            return 'PB';
        }
      };
      expect(label('koppen_geiger')).toBe('KG');
      expect(label('pasta_bioclimate')).toBe('PB');
    });

    it('系統選択・気候区分コード・判定根拠（海洋セル null）を保持できる', () => {
      const codeGrid: GridMap<string | null> = [
        ['Af', null],
        [null, 'Cfb'],
      ];
      const rationaleGrid: GridMap<{
        readonly winterMinTemperatureCelsius: number;
        readonly summerMaxTemperatureCelsius: number;
        readonly annualMeanTemperatureCelsius: number;
        readonly annualPrecipitationMm: number;
        readonly wettestMonthPrecipitationMm: number;
        readonly driestMonthPrecipitationMm: number;
      } | null> = [
        [
          {
            winterMinTemperatureCelsius: 18,
            summerMaxTemperatureCelsius: 30,
            annualMeanTemperatureCelsius: 25,
            annualPrecipitationMm: 2000,
            wettestMonthPrecipitationMm: 250,
            driestMonthPrecipitationMm: 100,
          },
          null,
        ],
        [
          null,
          {
            winterMinTemperatureCelsius: 2,
            summerMaxTemperatureCelsius: 18,
            annualMeanTemperatureCelsius: 10,
            annualPrecipitationMm: 1200,
            wettestMonthPrecipitationMm: 150,
            driestMonthPrecipitationMm: 50,
          },
        ],
      ];
      const result: ClimateZoneResult = {
        system: 'koppen_geiger',
        zoneCodes: codeGrid,
        rationale: rationaleGrid,
      };
      expect(result.zoneCodes[0]?.[0]).toBe('Af');
      expect(result.zoneCodes[0]?.[1]).toBeNull();
      expect(result.rationale[1]?.[1]?.annualPrecipitationMm).toBe(1200);
    });
  });

  describe('SimulationResult（要件定義書 §4.3）', () => {
    it('7 つの Step 結果型を全て含む統合構造体である', () => {
      const numGrid: GridMap<number> = makeGridMap(1, 1, 0);
      const boolGrid: GridMap<boolean> = makeGridMap(1, 1, false);
      const wind = months12<GridMap<WindVector>>(makeGridMap(1, 1, { uMps: 0, vMps: 0 }));
      const result: SimulationResult = {
        itcz: {
          monthlyBands: months12([
            { centerLatitudeDeg: 0, southBoundLatitudeDeg: -15, northBoundLatitudeDeg: 15 },
          ]),
          annualMeanCenterLatitudeDeg: [0],
        },
        windBelt: {
          monthlyPrevailingWind: wind,
          monthlySurfacePressureHpa: months12(numGrid),
          monthlyCellBoundariesDeg: months12([-60, -30, 0, 30, 60]),
          monthlyMonsoonMask: months12(boolGrid),
          monthlyCoastalUpwellingMask: months12(boolGrid),
          itczInfluenceAdjustmentDeg: months12([0]),
        },
        oceanCurrent: {
          monthlyStreamlines: months12([]),
          monthlySeaIceMask: months12(boolGrid),
          monthlyCoastalTemperatureCorrectionCelsius: months12(numGrid),
          monthlyCollisionPoints: months12([]),
          ensoDipoleCandidateMask: boolGrid,
        },
        airflow: {
          monthlyWindField: wind,
          monthlyPressureAnomalyHpa: months12(numGrid),
          monthlyPressureCenters: months12([]),
          mountainDeflectionApplied: boolGrid,
        },
        temperature: {
          monthlyTemperatureCelsius: months12(numGrid),
          annualMeanTemperatureCelsius: numGrid,
          summerMaxTemperatureCelsius: numGrid,
          winterMinTemperatureCelsius: numGrid,
          snowIceMask: boolGrid,
          monthlyEvapotranspirationMmPerMonth: months12(numGrid),
          seasonalAmplitudeCelsius: numGrid,
          polarInversion: false,
          monthlyIsotherms: months12([]),
          annualIsotherms: [],
        },
        precipitation: {
          monthlyPrecipitationLabels: months12<GridMap<PrecipitationLabel>>(
            makeGridMap(1, 1, 'normal'),
          ),
          warmCurrentHumidBeltMask: boolGrid,
          warmCurrentFetchKm: numGrid,
          mountainWindwardMask: boolGrid,
          mountainLeewardMask: boolGrid,
          monthlyFrontPassageFrequency: months12(numGrid),
          polarFrontExtensionMask: boolGrid,
          mountainReliefMeters: numGrid,
        },
        climateZone: {
          system: 'koppen_geiger',
          zoneCodes: [[null]],
          rationale: [[null]],
        },
      };
      const keys = Object.keys(result).sort();
      expect(keys).toEqual([
        'airflow',
        'climateZone',
        'itcz',
        'oceanCurrent',
        'precipitation',
        'temperature',
        'windBelt',
      ]);
    });
  });
});

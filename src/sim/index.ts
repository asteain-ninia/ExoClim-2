// 計算層エントリポイント。
// 各 Step（ITCZ・風帯・海流・気流・気温・降水・気候帯）を純粋関数として実装する
// （[技術方針.md §1.5.1] [§2.1.2]）。

export type { ITCZStepParams } from './01_itcz';
export { DEFAULT_ITCZ_STEP_PARAMS, computeITCZ, solarDeclinationDeg } from './01_itcz';

export type { WindBeltStepParams } from './02_wind_belt';
export { DEFAULT_WIND_BELT_STEP_PARAMS, computeWindBelt } from './02_wind_belt';

export type { OceanCurrentStepParams } from './03_ocean_current';
export {
  DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
  classificationFromCorrection,
  computeOceanCurrent,
} from './03_ocean_current';

export type { AirflowStepParams } from './04_airflow';
export { DEFAULT_AIRFLOW_STEP_PARAMS, computeAirflow } from './04_airflow';

export type { TemperatureStepParams } from './05_temperature';
export { DEFAULT_TEMPERATURE_STEP_PARAMS, computeTemperature } from './05_temperature';

export type { PrecipitationStepParams } from './06_precipitation';
export { DEFAULT_PRECIPITATION_STEP_PARAMS, computePrecipitation } from './06_precipitation';

export type { ClimateZoneStepParams } from './07_climate_zone';
export { DEFAULT_CLIMATE_ZONE_STEP_PARAMS, computeClimateZone } from './07_climate_zone';

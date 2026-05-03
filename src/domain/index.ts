// ドメイン層エントリポイント。
// 型定義・物理定数・地形データの読み込みを集約する（[技術方針.md §2.1.1]）。

export type { Cell, Grid, GridResolutionDeg } from './grid';
export { DEFAULT_GRID_RESOLUTION_DEG, createGrid } from './grid';

export {
  EARTH_RADIUS_KM,
  KM_PER_DEG_LAT,
  cellsToKm,
  degLatToKm,
  degLonToKm,
  kmToChebCells,
  kmToLatCells,
  kmToLonCells,
} from './distance';

export type { EarthLatitudeStat, ElevationBinMeters } from './earthStatistics';
export {
  EARTH_GLOBAL_LAND_FRACTION,
  EARTH_LATITUDE_STATISTICS,
  ELEVATION_BINS_METERS,
  getEarthStatisticsAt,
} from './earthStatistics';

export { fbmSphere, hash33, noise3D, ridgeSphere } from './noise';

export { buildTerrainGrid } from './terrain';

export type {
  AtmosphereOceanParams,
  OrbitalParams,
  PlanetBodyParams,
  PlanetParams,
  RotationDirection,
  TerrainSource,
} from './planetParams';
export {
  EARTH_ATMOSPHERE_OCEAN_PARAMS,
  EARTH_BODY_PARAMS,
  EARTH_ORBITAL_PARAMS,
  EARTH_PLANET_PARAMS,
  EARTH_TERRAIN_SOURCE,
} from './planetParams';

export type { GeoPoint, GridMap, LongitudeProfile, Months12, WindVector } from './gridMap';

export type {
  AirflowResult,
  ClimateClassificationSystem,
  ClimateZoneCode,
  ClimateZoneRationale,
  ClimateZoneResult,
  CollisionPoint,
  CollisionPointType,
  CurrentClassification,
  CurrentStreamline,
  IsothermLine,
  IsothermSegment,
  ITCZBand,
  ITCZResult,
  OceanCurrentResult,
  PrecipitationLabel,
  PrecipitationResult,
  PressureCenter,
  PressureCenterType,
  SimulationResult,
  TemperatureResult,
  WindBeltResult,
} from './stepResults';

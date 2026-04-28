// ドメイン層エントリポイント。
// 型定義・物理定数・地形データの読み込みを集約する（[技術方針.md §2.1.1]）。

export type { Cell, Grid, GridResolutionDeg } from './grid';
export { DEFAULT_GRID_RESOLUTION_DEG, createGrid } from './grid';

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

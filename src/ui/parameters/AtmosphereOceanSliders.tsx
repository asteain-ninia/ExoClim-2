// 大気・海洋パラメータ調整 UI（[要件定義書.md §2.1.3] / [§4.2] AtmosphereOceanParams）。
// 規約: ドメイン層の `EARTH_ATMOSPHERE_OCEAN_PARAMS` を地球プリセット復帰値として使う。
//   状態層 params store の `setAtmosphereOcean` で部分更新する。

import { EARTH_ATMOSPHERE_OCEAN_PARAMS } from '@/domain';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function AtmosphereOceanSliders() {
  const atmosphereOcean = useParamsStore((s) => s.planet.atmosphereOcean);
  const setAtmosphereOcean = useParamsStore((s) => s.setAtmosphereOcean);

  return (
    <fieldset className="param-group" data-testid="param-group-atmosphere-ocean">
      <legend>大気と海洋</legend>
      <Slider
        id="atm-pressure"
        label="表面気圧"
        unit="hPa"
        min={0}
        max={3000}
        step={1}
        precision={0}
        value={atmosphereOcean.surfacePressureHpa}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.surfacePressureHpa}
        onChange={(v) => setAtmosphereOcean({ surfacePressureHpa: v })}
      />
      <Slider
        id="atm-greenhouse"
        label="温室効果強度"
        unit="×地球"
        min={0}
        max={3}
        step={0.05}
        precision={2}
        value={atmosphereOcean.greenhouseStrengthRelative}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.greenhouseStrengthRelative}
        onChange={(v) => setAtmosphereOcean({ greenhouseStrengthRelative: v })}
      />
      <Slider
        id="atm-surface-albedo"
        label="地表アルベド"
        min={0}
        max={0.6}
        step={0.01}
        precision={2}
        value={atmosphereOcean.surfaceAlbedoFraction}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.surfaceAlbedoFraction}
        onChange={(v) => setAtmosphereOcean({ surfaceAlbedoFraction: v })}
      />
      <Slider
        id="atm-cloud-albedo"
        label="雲アルベド"
        min={0}
        max={0.9}
        step={0.01}
        precision={2}
        value={atmosphereOcean.cloudAlbedoFraction}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.cloudAlbedoFraction}
        onChange={(v) => setAtmosphereOcean({ cloudAlbedoFraction: v })}
      />
      <Slider
        id="atm-lapse-rate"
        label="気温減率"
        unit="°C/km"
        min={0}
        max={15}
        step={0.1}
        precision={2}
        value={atmosphereOcean.lapseRateCelsiusPerKm}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.lapseRateCelsiusPerKm}
        onChange={(v) => setAtmosphereOcean({ lapseRateCelsiusPerKm: v })}
      />
      <Slider
        id="atm-meridional-transport"
        label="南北熱輸送"
        unit="×地球"
        min={0}
        max={3}
        step={0.05}
        precision={2}
        value={atmosphereOcean.meridionalHeatTransportRelative}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.meridionalHeatTransportRelative}
        onChange={(v) => setAtmosphereOcean({ meridionalHeatTransportRelative: v })}
      />
      <Slider
        id="atm-zonal-transport"
        label="東西熱輸送"
        unit="×地球"
        min={0}
        max={3}
        step={0.05}
        precision={2}
        value={atmosphereOcean.zonalHeatTransportRelative}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.zonalHeatTransportRelative}
        onChange={(v) => setAtmosphereOcean({ zonalHeatTransportRelative: v })}
      />
      <Slider
        id="atm-ocean-depth"
        label="海洋混合層深"
        unit="m"
        min={0}
        max={300}
        step={5}
        precision={0}
        value={atmosphereOcean.oceanMixedLayerDepthMeters}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.oceanMixedLayerDepthMeters}
        onChange={(v) => setAtmosphereOcean({ oceanMixedLayerDepthMeters: v })}
      />
      <Slider
        id="atm-ocean-coverage"
        label="海洋被覆率"
        min={0}
        max={1}
        step={0.01}
        precision={2}
        value={atmosphereOcean.oceanCoverageFraction}
        defaultValue={EARTH_ATMOSPHERE_OCEAN_PARAMS.oceanCoverageFraction}
        onChange={(v) => setAtmosphereOcean({ oceanCoverageFraction: v })}
      />
    </fieldset>
  );
}

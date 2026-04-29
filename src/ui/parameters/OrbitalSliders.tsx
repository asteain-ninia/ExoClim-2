// 主星と軌道に関する利用者入力 UI（[要件定義書.md §2.1.1] / [§4.2] OrbitalParams）。
// 規約: ドメイン層の `EARTH_ORBITAL_PARAMS` を地球プリセット復帰値として使う。
//   状態層 params store の `setOrbital` で部分更新する。

import { EARTH_ORBITAL_PARAMS } from '@/domain';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function OrbitalSliders() {
  const orbital = useParamsStore((s) => s.planet.orbital);
  const setOrbital = useParamsStore((s) => s.setOrbital);

  return (
    <fieldset className="param-group" data-testid="param-group-orbital">
      <legend>主星と軌道</legend>
      <Slider
        id="orbital-luminosity"
        label="主星光度"
        unit="L☉"
        min={0.5}
        max={5}
        step={0.01}
        precision={2}
        value={orbital.starLuminositySolar}
        defaultValue={EARTH_ORBITAL_PARAMS.starLuminositySolar}
        onChange={(v) => setOrbital({ starLuminositySolar: v })}
      />
      <Slider
        id="orbital-semimajor"
        label="軌道長半径"
        unit="AU"
        min={0.3}
        max={5}
        step={0.01}
        precision={2}
        value={orbital.semiMajorAxisAU}
        defaultValue={EARTH_ORBITAL_PARAMS.semiMajorAxisAU}
        onChange={(v) => setOrbital({ semiMajorAxisAU: v })}
      />
      <Slider
        id="orbital-period"
        label="公転周期"
        unit="日"
        min={30}
        max={2000}
        step={1}
        precision={0}
        value={orbital.orbitalPeriodDays}
        defaultValue={EARTH_ORBITAL_PARAMS.orbitalPeriodDays}
        onChange={(v) => setOrbital({ orbitalPeriodDays: v })}
      />
      <Slider
        id="orbital-eccentricity"
        label="軌道離心率"
        min={0}
        max={0.5}
        step={0.001}
        precision={3}
        value={orbital.eccentricity}
        defaultValue={EARTH_ORBITAL_PARAMS.eccentricity}
        onChange={(v) => setOrbital({ eccentricity: v })}
      />
      <Slider
        id="orbital-perihelion"
        label="近日点引数"
        unit="°"
        min={0}
        max={360}
        step={1}
        precision={0}
        value={orbital.argumentOfPerihelionDeg}
        defaultValue={EARTH_ORBITAL_PARAMS.argumentOfPerihelionDeg}
        onChange={(v) => setOrbital({ argumentOfPerihelionDeg: v })}
      />
    </fieldset>
  );
}

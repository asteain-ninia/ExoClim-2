// Step 3 海流チューニングパラメータ調整 UI（[docs/spec/03_海流.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_OCEAN_CURRENT_STEP_PARAMS`（[src/sim/03_ocean_current.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setOceanCurrentParams` で部分更新する。

import { DEFAULT_OCEAN_CURRENT_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function OceanCurrentStepParamsSliders() {
  const oceanCurrentParams = useParamsStore((s) => s.oceanCurrentParams);
  const setOceanCurrentParams = useParamsStore((s) => s.setOceanCurrentParams);

  return (
    <fieldset className="param-group" data-testid="param-group-ocean-current">
      <legend>海流 調整（Step 3）</legend>
      <Slider
        id="ocean-warm-rise"
        label="暖流 最大昇温"
        unit="°C"
        min={0}
        max={30}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.warmCurrentMaxRiseCelsius}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.warmCurrentMaxRiseCelsius}
        onChange={(v) => setOceanCurrentParams({ warmCurrentMaxRiseCelsius: v })}
      />
      <Slider
        id="ocean-cold-drop"
        label="寒流 最大降温"
        unit="°C"
        min={0}
        max={20}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.coldCurrentMaxDropCelsius}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.coldCurrentMaxDropCelsius}
        onChange={(v) => setOceanCurrentParams({ coldCurrentMaxDropCelsius: v })}
      />
      <Slider
        id="ocean-influence-range"
        label="海岸 影響保持距離"
        unit="°"
        min={1}
        max={30}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.coastalInfluenceRangeDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.coastalInfluenceRangeDeg}
        onChange={(v) => setOceanCurrentParams({ coastalInfluenceRangeDeg: v })}
      />
      <Slider
        id="ocean-sea-ice-lat"
        label="海氷形成 緯度しきい値"
        unit="°"
        min={50}
        max={89}
        step={1}
        precision={0}
        value={oceanCurrentParams.seaIceLatitudeThresholdDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.seaIceLatitudeThresholdDeg}
        onChange={(v) => setOceanCurrentParams({ seaIceLatitudeThresholdDeg: v })}
      />
      <Slider
        id="ocean-basin-neutral-width"
        label="basin 中央 中立帯幅"
        unit="°"
        min={0}
        max={30}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.basinCenterNeutralWidthDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.basinCenterNeutralWidthDeg}
        onChange={(v) => setOceanCurrentParams({ basinCenterNeutralWidthDeg: v })}
      />
    </fieldset>
  );
}

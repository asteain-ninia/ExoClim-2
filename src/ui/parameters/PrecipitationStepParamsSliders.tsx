// Step 6 降水チューニングパラメータ調整 UI（[docs/spec/06_降水.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_PRECIPITATION_STEP_PARAMS`（[src/sim/06_precipitation.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setPrecipitationParams` で部分更新する。

import { DEFAULT_PRECIPITATION_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function PrecipitationStepParamsSliders() {
  const precipitationParams = useParamsStore((s) => s.precipitationParams);
  const setPrecipitationParams = useParamsStore((s) => s.setPrecipitationParams);

  return (
    <fieldset className="param-group" data-testid="param-group-precipitation">
      <legend>降水 調整（Step 6）</legend>
      <Slider
        id="precipitation-max-wet-extension"
        label="暖流 wet 帯 最大延伸"
        unit="km"
        min={0}
        max={5000}
        step={100}
        precision={0}
        value={precipitationParams.maxWetExtensionKm}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.maxWetExtensionKm}
        onChange={(v) => setPrecipitationParams({ maxWetExtensionKm: v })}
      />
      <Slider
        id="precipitation-rainshadow-relief"
        label="rainshadow desert 起伏"
        unit="m"
        min={500}
        max={5000}
        step={100}
        precision={0}
        value={precipitationParams.rainshadowDesertReliefMeters}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.rainshadowDesertReliefMeters}
        onChange={(v) => setPrecipitationParams({ rainshadowDesertReliefMeters: v })}
      />
      <Slider
        id="precipitation-high-elevation-dry"
        label="高地乾燥 標高しきい値"
        unit="m"
        min={2000}
        max={6000}
        step={100}
        precision={0}
        value={precipitationParams.highElevationDryThresholdMeters}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.highElevationDryThresholdMeters}
        onChange={(v) => setPrecipitationParams({ highElevationDryThresholdMeters: v })}
      />
      <Slider
        id="precipitation-windward-min-relief"
        label="風上 wet 化 最低起伏"
        unit="m"
        min={300}
        max={3000}
        step={100}
        precision={0}
        value={precipitationParams.windwardWetMinReliefMeters}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.windwardWetMinReliefMeters}
        onChange={(v) => setPrecipitationParams({ windwardWetMinReliefMeters: v })}
      />
      <Slider
        id="precipitation-itcz-half-width"
        label="ITCZ 影響帯 半幅"
        unit="°"
        min={5}
        max={30}
        step={1}
        precision={0}
        value={precipitationParams.itczInfluenceHalfWidthDeg}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.itczInfluenceHalfWidthDeg}
        onChange={(v) => setPrecipitationParams({ itczInfluenceHalfWidthDeg: v })}
      />
    </fieldset>
  );
}

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
        label="暖流海岸 湿潤帯 最大延伸"
        unit="km"
        min={0}
        max={5000}
        step={100}
        precision={0}
        value={precipitationParams.maxWetExtensionKm}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.maxWetExtensionKm}
        helpText="暖流が運ぶ湿気が大陸内陸まで届く最大距離（地球 ≈ 2,000 km）。西岸海洋性気候の幅を決める。"
        onChange={(v) => setPrecipitationParams({ maxWetExtensionKm: v })}
      />
      <Slider
        id="precipitation-rainshadow-relief"
        label="雨陰砂漠 起伏しきい値"
        unit="m"
        min={500}
        max={5000}
        step={100}
        precision={0}
        value={precipitationParams.rainshadowDesertReliefMeters}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.rainshadowDesertReliefMeters}
        helpText="風上斜面でこの起伏を超える山脈の風下に乾燥地帯を生成（既定 2,000 m）。低くすると砂漠が増える。"
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
        helpText="この標高を超えるセルは乾燥扱い（既定 4,000 m、チベット高原・アンデス内陸を想定）。"
        onChange={(v) => setPrecipitationParams({ highElevationDryThresholdMeters: v })}
      />
      <Slider
        id="precipitation-windward-min-relief"
        label="風上斜面 湿潤化 最低起伏"
        unit="m"
        min={300}
        max={3000}
        step={100}
        precision={0}
        value={precipitationParams.windwardWetMinReliefMeters}
        defaultValue={DEFAULT_PRECIPITATION_STEP_PARAMS.windwardWetMinReliefMeters}
        helpText="風上斜面でこの起伏を超えると地形性降水で湿潤化（既定 1,000 m）。"
        advanced
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
        helpText="降水評価における ITCZ 中心線±この度の帯を強雨域とする。表示用とは独立に設定可能（Step 6 専用）。"
        onChange={(v) => setPrecipitationParams({ itczInfluenceHalfWidthDeg: v })}
      />
    </fieldset>
  );
}

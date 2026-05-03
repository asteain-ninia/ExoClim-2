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
      <div className="param-toggle">
        <span className="param-toggle__label">寒流沿い東岸 海氷延長（冬季）</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              oceanCurrentParams.seaIceColdCurrentExtensionEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setOceanCurrentParams({ seaIceColdCurrentExtensionEnabled: true })}
            data-testid="ocean-cold-extension-on"
          >
            有効
          </button>
          <button
            type="button"
            className={
              !oceanCurrentParams.seaIceColdCurrentExtensionEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setOceanCurrentParams({ seaIceColdCurrentExtensionEnabled: false })}
            data-testid="ocean-cold-extension-off"
          >
            無効
          </button>
        </div>
      </div>
      <Slider
        id="ocean-cold-extension-min-lat"
        label="寒流海氷延長 赤道側下限緯度"
        unit="°"
        min={30}
        max={70}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.seaIceColdCurrentExtensionMinLatDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.seaIceColdCurrentExtensionMinLatDeg}
        onChange={(v) => setOceanCurrentParams({ seaIceColdCurrentExtensionMinLatDeg: v })}
      />
      <Slider
        id="ocean-cold-extension-proximity"
        label="寒流海氷延長 沿岸近接距離"
        unit="°"
        min={1}
        max={30}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.seaIceColdCurrentExtensionCoastalProximityDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.seaIceColdCurrentExtensionCoastalProximityDeg}
        onChange={(v) => setOceanCurrentParams({ seaIceColdCurrentExtensionCoastalProximityDeg: v })}
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
      <Slider
        id="ocean-streamline-basin-min-width"
        label="ストリームライン 盆 最小経度幅"
        unit="°"
        min={5}
        max={120}
        step={1}
        precision={0}
        value={oceanCurrentParams.streamlineBasinMinWidthDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineBasinMinWidthDeg}
        onChange={(v) => setOceanCurrentParams({ streamlineBasinMinWidthDeg: v })}
      />
      <Slider
        id="ocean-streamline-equatorial-lat"
        label="亜熱帯ジャイヤ 赤道側緯度"
        unit="°"
        min={3}
        max={20}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.streamlineEquatorialLatDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineEquatorialLatDeg}
        onChange={(v) => setOceanCurrentParams({ streamlineEquatorialLatDeg: v })}
      />
      <Slider
        id="ocean-streamline-mid-lat"
        label="亜熱帯ジャイヤ 中緯度反転緯度"
        unit="°"
        min={20}
        max={50}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.streamlineMidLatitudeDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineMidLatitudeDeg}
        onChange={(v) => setOceanCurrentParams({ streamlineMidLatitudeDeg: v })}
      />
      <Slider
        id="ocean-streamline-polar-lat"
        label="極ジャイヤ 極帯反転緯度"
        unit="°"
        min={60}
        max={89}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.streamlinePolarLatitudeDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlinePolarLatitudeDeg}
        onChange={(v) => setOceanCurrentParams({ streamlinePolarLatitudeDeg: v })}
      />
      <Slider
        id="ocean-streamline-samples-per-edge"
        label="ストリームライン 各エッジ サンプル点数"
        unit="点"
        min={4}
        max={60}
        step={1}
        precision={0}
        value={oceanCurrentParams.streamlineSamplesPerEdge}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineSamplesPerEdge}
        onChange={(v) => setOceanCurrentParams({ streamlineSamplesPerEdge: v })}
      />
      <Slider
        id="ocean-streamline-curvature"
        label="ストリームライン 曲げ量（中間点）"
        unit="°"
        min={0}
        max={15}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.streamlineCurvatureDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineCurvatureDeg}
        onChange={(v) => setOceanCurrentParams({ streamlineCurvatureDeg: v })}
      />
      <Slider
        id="ocean-streamline-deflection-range"
        label="陸地反発 影響半径（セル）"
        unit="セル"
        min={0}
        max={15}
        step={1}
        precision={0}
        value={oceanCurrentParams.streamlineDeflectionRangeCells}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineDeflectionRangeCells}
        onChange={(v) => setOceanCurrentParams({ streamlineDeflectionRangeCells: v })}
      />
      <Slider
        id="ocean-streamline-deflection-max"
        label="陸地反発 最大変位量"
        unit="°"
        min={0}
        max={10}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.streamlineMaxDeflectionDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.streamlineMaxDeflectionDeg}
        onChange={(v) => setOceanCurrentParams({ streamlineMaxDeflectionDeg: v })}
      />
      <div className="param-toggle">
        <span className="param-toggle__label">agent-tracing（赤道反流のみ、実験段階）</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              oceanCurrentParams.agentTracingEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setOceanCurrentParams({ agentTracingEnabled: true })}
            data-testid="ocean-agent-tracing-on"
          >
            有効
          </button>
          <button
            type="button"
            className={
              !oceanCurrentParams.agentTracingEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setOceanCurrentParams({ agentTracingEnabled: false })}
            data-testid="ocean-agent-tracing-off"
          >
            無効
          </button>
        </div>
      </div>
      <Slider
        id="ocean-agent-base-speed"
        label="agent 基本速度"
        unit="°/step"
        min={0.1}
        max={2}
        step={0.1}
        precision={1}
        value={oceanCurrentParams.agentBaseSpeedDegPerStep}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.agentBaseSpeedDegPerStep}
        onChange={(v) => setOceanCurrentParams({ agentBaseSpeedDegPerStep: v })}
      />
      <div className="param-toggle">
        <span className="param-toggle__label">ENSO 候補マスク（[§4.10]）</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              oceanCurrentParams.ensoEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setOceanCurrentParams({ ensoEnabled: true })}
            data-testid="ocean-enso-on"
          >
            有効
          </button>
          <button
            type="button"
            className={
              !oceanCurrentParams.ensoEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setOceanCurrentParams({ ensoEnabled: false })}
            data-testid="ocean-enso-off"
          >
            無効
          </button>
        </div>
      </div>
      <Slider
        id="ocean-enso-lat-range"
        label="ENSO 候補 赤道緯度範囲"
        unit="°"
        min={3}
        max={20}
        step={0.5}
        precision={1}
        value={oceanCurrentParams.ensoLatitudeRangeDeg}
        defaultValue={DEFAULT_OCEAN_CURRENT_STEP_PARAMS.ensoLatitudeRangeDeg}
        onChange={(v) => setOceanCurrentParams({ ensoLatitudeRangeDeg: v })}
      />
    </fieldset>
  );
}

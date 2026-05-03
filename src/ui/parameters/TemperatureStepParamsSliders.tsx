// Step 5 気温チューニングパラメータ調整 UI（[docs/spec/05_気温.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_TEMPERATURE_STEP_PARAMS`（[src/sim/05_temperature.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setTemperatureParams` で部分更新する。

import { DEFAULT_TEMPERATURE_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function TemperatureStepParamsSliders() {
  const temperatureParams = useParamsStore((s) => s.temperatureParams);
  const setTemperatureParams = useParamsStore((s) => s.setTemperatureParams);

  return (
    <fieldset className="param-group" data-testid="param-group-temperature">
      <legend>気温 調整（Step 5）</legend>
      <Slider
        id="temperature-baseline"
        label="全球平均気温"
        unit="°C"
        min={-10}
        max={35}
        step={0.5}
        precision={1}
        value={temperatureParams.globalMeanBaselineCelsius}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.globalMeanBaselineCelsius}
        helpText="ベースライン全球平均気温（地球 ≈ 14°C）。日射・温室効果と独立に最終的な気温を底上げ/引き下げ。"
        onChange={(v) => setTemperatureParams({ globalMeanBaselineCelsius: v })}
      />
      <Slider
        id="temperature-continentality"
        label="大陸性気候 強度"
        unit="×"
        min={0}
        max={2}
        step={0.05}
        precision={2}
        value={temperatureParams.continentalityStrength}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.continentalityStrength}
        helpText="内陸での季節振幅増幅（地球 = 1.0）。高いと内陸の夏冬差が拡大、海岸性気候は変わらず。"
        onChange={(v) => setTemperatureParams({ continentalityStrength: v })}
      />
      <Slider
        id="temperature-wind-advection"
        label="風による熱移流 強度"
        unit="×"
        min={0}
        max={1}
        step={0.05}
        precision={2}
        value={temperatureParams.windAdvectionStrength}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.windAdvectionStrength}
        helpText="風が運ぶ熱量補正の強度（既定 0.5）。風上海域から沿岸への暖気流入や、内陸→風下海岸への熱搬送に効く。"
        onChange={(v) => setTemperatureParams({ windAdvectionStrength: v })}
      />
      <Slider
        id="temperature-snow-ice-iterations"
        label="雪氷フィードバック 反復回数"
        unit="回"
        min={0}
        max={3}
        step={1}
        precision={0}
        value={temperatureParams.snowIceFeedbackIterations}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.snowIceFeedbackIterations}
        helpText="新規雪氷面（高アルベド）→ 冷却 → さらに雪氷拡大、を繰り返す回数（既定 2）。多いほど極氷帯が拡張。"
        onChange={(v) => setTemperatureParams({ snowIceFeedbackIterations: v })}
      />
      <Slider
        id="temperature-evapotranspiration-coef"
        label="蒸発散量 係数（暫定線形）"
        unit="mm/月/°C"
        min={0}
        max={20}
        step={0.5}
        precision={1}
        value={temperatureParams.evapotranspirationCoefficientMmPerCelsius}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.evapotranspirationCoefficientMmPerCelsius}
        helpText="蒸発散量 ≈ max(0, T) × 係数 の暫定線形式。Step 7 気候帯の B/D 判定で消費。Penman-Monteith 簡略版への置換は将来検討。"
        onChange={(v) =>
          setTemperatureParams({ evapotranspirationCoefficientMmPerCelsius: v })
        }
      />
      <Slider
        id="temperature-isotherm-interval"
        label="等温線 刻み幅"
        unit="°C"
        min={0}
        max={30}
        step={1}
        precision={0}
        value={temperatureParams.isothermIntervalCelsius}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.isothermIntervalCelsius}
        helpText="等温線描画の刻み幅（既定 10°C）。0 で等温線非表示。小さいと線が密、大きいと粗くなる。"
        onChange={(v) => setTemperatureParams({ isothermIntervalCelsius: v })}
      />
      <Slider
        id="temperature-coastal-inland-reach"
        label="海流補正の内陸到達距離"
        unit="セル"
        min={0}
        max={15}
        step={1}
        precision={0}
        value={temperatureParams.coastalCorrectionInlandReachCells}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.coastalCorrectionInlandReachCells}
        helpText="暖流/寒流の温度補正が陸内何セルまで届くか（既定 5）。0 で旧挙動（陸セル補正 0）。Pasta WL#28 由来、東岸湿潤亜熱帯/西岸乾燥の主因。"
        onChange={(v) => setTemperatureParams({ coastalCorrectionInlandReachCells: v })}
      />
    </fieldset>
  );
}

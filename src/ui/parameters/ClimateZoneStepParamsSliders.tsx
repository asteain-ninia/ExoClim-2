// Step 7 気候帯チューニングパラメータ調整 UI（[docs/spec/07_気候帯.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_CLIMATE_ZONE_STEP_PARAMS`（[src/sim/07_climate_zone.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setClimateZoneParams` で部分更新する。

import { DEFAULT_CLIMATE_ZONE_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function ClimateZoneStepParamsSliders() {
  const climateZoneParams = useParamsStore((s) => s.climateZoneParams);
  const setClimateZoneParams = useParamsStore((s) => s.setClimateZoneParams);

  return (
    <fieldset className="param-group" data-testid="param-group-climate-zone">
      <legend>気候帯 調整（Step 7）</legend>
      <p className="param-note">
        Pasta 標準 Köppen-Geiger 系統で分類。降水ラベル → 月別降水量
        （mm/月）の対応表が分類しきい値に直接効きます。
      </p>
      <Slider
        id="climate-zone-precip-dry"
        label="ラベル『dry』降水量"
        unit="mm/月"
        min={0}
        max={60}
        step={1}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.dry}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.dry}
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { dry: v } })}
      />
      <Slider
        id="climate-zone-precip-normal"
        label="ラベル『normal』降水量"
        unit="mm/月"
        min={20}
        max={150}
        step={5}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.normal}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.normal}
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { normal: v } })}
      />
      <Slider
        id="climate-zone-precip-wet"
        label="ラベル『wet』降水量"
        unit="mm/月"
        min={60}
        max={300}
        step={10}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.wet}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.wet}
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { wet: v } })}
      />
      <Slider
        id="climate-zone-precip-verywet"
        label="ラベル『very_wet』降水量"
        unit="mm/月"
        min={120}
        max={500}
        step={10}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.very_wet}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.very_wet}
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { very_wet: v } })}
      />
      <div className="param-toggle">
        <span className="param-toggle__label">乾燥帯 Hot/Cold 判定</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              climateZoneParams.aridHotColdCriterion === 'monthly'
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridHotColdCriterion: 'monthly' })}
            data-testid="climate-zone-criterion-monthly"
          >
            月平均（標準）
          </button>
          <button
            type="button"
            className={
              climateZoneParams.aridHotColdCriterion === 'annual'
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridHotColdCriterion: 'annual' })}
            data-testid="climate-zone-criterion-annual"
          >
            年平均 ≥ 18°C
          </button>
        </div>
      </div>
      <div className="param-toggle">
        <span className="param-toggle__label">B → D 振り戻し（[§4.1.7]）</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              climateZoneParams.aridReclassToDEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridReclassToDEnabled: true })}
            data-testid="climate-zone-reclass-on"
          >
            有効
          </button>
          <button
            type="button"
            className={
              !climateZoneParams.aridReclassToDEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridReclassToDEnabled: false })}
            data-testid="climate-zone-reclass-off"
          >
            無効
          </button>
        </div>
      </div>
      <Slider
        id="climate-zone-reclass-max-temp"
        label="B → D 振り戻し 年平均気温しきい値"
        unit="°C"
        min={-5}
        max={20}
        step={0.5}
        precision={1}
        value={climateZoneParams.aridReclassToDMaxAnnualTempCelsius}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.aridReclassToDMaxAnnualTempCelsius}
        onChange={(v) => setClimateZoneParams({ aridReclassToDMaxAnnualTempCelsius: v })}
      />
    </fieldset>
  );
}

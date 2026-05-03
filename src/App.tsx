// ExoClim アプリのトップレベルコンポーネント。
// 仕様: [要件定義書.md §1.2] 三層構成（入力・シミュレーション・表示）の表示層エントリ。
// 規約: 状態層 store と Worker bridge を接続し、UI 層コンポーネントを配置する。

import { useEffect } from 'react';
import {
  connectStoresToBridge,
  useNotificationsStore,
  useParamsStore,
  useResultsStore,
  useUIStore,
} from '@/store';
import {
  AirflowStepParamsSliders,
  AtmosphereOceanSliders,
  CellInspector,
  ClimateZoneStepParamsSliders,
  CollapsibleSection,
  Footer,
  ITCZStepParamsSliders,
  Legend,
  LoadingIndicator,
  MapCanvas,
  OceanCurrentStepParamsSliders,
  OrbitalSliders,
  PlanetBodySliders,
  PrecipitationStepParamsSliders,
  ResetButton,
  SeasonSelector,
  TemperatureStepParamsSliders,
  TerrainSourceSelector,
  Toast,
  WindBeltStepParamsSliders,
} from '@/ui';
import { createWorkerPipelineBridge } from '@/worker';

export function App() {
  useEffect(() => {
    const bridge = createWorkerPipelineBridge();
    const { dispose } = connectStoresToBridge(useParamsStore, useResultsStore, bridge, {
      notificationsStore: useNotificationsStore,
      uiStore: useUIStore,
    });
    return () => {
      dispose();
      bridge.dispose();
    };
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <div className="app__header-text">
            <h1>ExoClim</h1>
            <p>
              Worldbuilding Pasta 準拠の惑星気候設計ツール — 全 7 Step
              (ITCZ → 風帯 → 海流 → 気流 → 気温 → 降水 → 気候帯) 連結済
            </p>
          </div>
          <div className="app__header-actions">
            <LoadingIndicator />
            <ResetButton />
          </div>
        </div>
      </header>
      <main className="app__main">
        <section className="map-section">
          <MapCanvas />
          <SeasonSelector />
        </section>
        <section className="controls-section">
          <CollapsibleSection title="表示トグル" testId="section-legend">
            <Legend />
          </CollapsibleSection>
          <CollapsibleSection title="セル情報" testId="section-cell-inspector">
            <CellInspector />
          </CollapsibleSection>
          <CollapsibleSection title="軌道パラメータ" testId="section-orbital">
            <OrbitalSliders />
          </CollapsibleSection>
          <CollapsibleSection title="惑星本体" testId="section-planet-body">
            <PlanetBodySliders />
          </CollapsibleSection>
          <CollapsibleSection title="大気・海洋" testId="section-atmosphere-ocean">
            <AtmosphereOceanSliders />
          </CollapsibleSection>
          <CollapsibleSection title="地形" testId="section-terrain">
            <TerrainSourceSelector />
          </CollapsibleSection>
          <CollapsibleSection title="Step 1 ITCZ 調整" testId="section-itcz">
            <ITCZStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection title="Step 2 風帯 調整" testId="section-wind-belt">
            <WindBeltStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection title="Step 3 海流 調整" testId="section-ocean-current">
            <OceanCurrentStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection title="Step 4 気流 調整" testId="section-airflow">
            <AirflowStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection title="Step 5 気温 調整" testId="section-temperature">
            <TemperatureStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection title="Step 6 降水 調整" testId="section-precipitation">
            <PrecipitationStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection title="Step 7 気候帯 調整" testId="section-climate-zone">
            <ClimateZoneStepParamsSliders />
          </CollapsibleSection>
        </section>
      </main>
      <Footer />
      <Toast />
    </div>
  );
}

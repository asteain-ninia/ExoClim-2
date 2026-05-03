// ExoClim アプリのトップレベルコンポーネント。
// 仕様: [要件定義書.md §1.2] 三層構成（入力・シミュレーション・表示）の表示層エントリ。
// 規約: 状態層 store と Worker bridge を接続し、UI 層コンポーネントを配置する。

import { useEffect } from 'react';
import {
  connectStoresToBridge,
  useParamsStore,
  useResultsStore,
} from '@/store';
import {
  AirflowStepParamsSliders,
  AtmosphereOceanSliders,
  CellInspector,
  ClimateZoneStepParamsSliders,
  ITCZStepParamsSliders,
  Legend,
  MapCanvas,
  OceanCurrentStepParamsSliders,
  OrbitalSliders,
  PlanetBodySliders,
  PrecipitationStepParamsSliders,
  SeasonSelector,
  TemperatureStepParamsSliders,
  TerrainSourceSelector,
  WindBeltStepParamsSliders,
} from '@/ui';
import { createWorkerPipelineBridge } from '@/worker';

export function App() {
  useEffect(() => {
    const bridge = createWorkerPipelineBridge();
    const { dispose } = connectStoresToBridge(useParamsStore, useResultsStore, bridge);
    return () => {
      dispose();
      bridge.dispose();
    };
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1>ExoClim</h1>
        <p>
          Worldbuilding Pasta 準拠の惑星気候設計ツール — 全 7 Step
          (ITCZ → 風帯 → 海流 → 気流 → 気温 → 降水 → 気候帯) 連結済
        </p>
      </header>
      <main className="app__main">
        <section className="map-section">
          <MapCanvas />
          <SeasonSelector />
        </section>
        <section className="controls-section">
          <Legend />
          <CellInspector />
          <OrbitalSliders />
          <PlanetBodySliders />
          <AtmosphereOceanSliders />
          <TerrainSourceSelector />
          <ITCZStepParamsSliders />
          <WindBeltStepParamsSliders />
          <OceanCurrentStepParamsSliders />
          <AirflowStepParamsSliders />
          <TemperatureStepParamsSliders />
          <PrecipitationStepParamsSliders />
          <ClimateZoneStepParamsSliders />
        </section>
      </main>
    </div>
  );
}

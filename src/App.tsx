// ExoClim アプリのトップレベルコンポーネント。
// 仕様: [要件定義書.md §1.2] 三層構成（入力・シミュレーション・表示）の表示層エントリ。
// 規約: 状態層 store と Worker bridge を接続し、UI 層コンポーネントを配置する。

import { useEffect } from 'react';
import {
  connectStoresToBridge,
  useParamsStore,
  useResultsStore,
} from '@/store';
import { Legend, MapCanvas, OrbitalSliders, PlanetBodySliders, SeasonSelector } from '@/ui';
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
        <p>Worldbuilding Pasta 準拠の惑星気候設計ツール — Step 1 ITCZ 表示中</p>
      </header>
      <main className="app__main">
        <section className="map-section">
          <MapCanvas />
          <SeasonSelector />
        </section>
        <aside className="app__aside">
          <Legend />
          <OrbitalSliders />
          <PlanetBodySliders />
        </aside>
      </main>
    </div>
  );
}

// ExoClim アプリのトップレベルコンポーネント。
// 仕様: [要件定義書.md §1.2] 三層構成（入力・シミュレーション・表示）の表示層エントリ。
// 規約: 状態層 store と Worker bridge を接続し、UI 層コンポーネントを配置する。

import { useEffect, useRef } from 'react';
import {
  applySnapshot,
  connectStoresToBridge,
  isValidSnapshot,
  loadParamsFromLocalStorage,
  saveParamsToLocalStorage,
  serializeParams,
  useNotificationsStore,
  useParamsStore,
  useResultsStore,
  useUIStore,
} from '@/store';
import {
  AdvancedModeToggle,
  AirflowStepParamsSliders,
  AtmosphereOceanSliders,
  CellInspector,
  ClimateZoneStepParamsSliders,
  CollapsibleSection,
  ColorLegend,
  ExportPngButton,
  Footer,
  HelpButton,
  ITCZStepParamsSliders,
  KeyboardShortcuts,
  Legend,
  LoadingIndicator,
  MapCanvas,
  OceanCurrentStepParamsSliders,
  OnboardingModal,
  OrbitalSliders,
  PlanetBodySliders,
  PrecipitationStepParamsSliders,
  ResetButton,
  SeasonSelector,
  SettingsIoButtons,
  TemperatureStepParamsSliders,
  TerrainSourceSelector,
  ThemeToggle,
  Toast,
  WindBeltStepParamsSliders,
} from '@/ui';
import { createWorkerPipelineBridge } from '@/worker';

const THEME_KEY = 'exoclim-theme';

export function App() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const hasRestored = useRef(false);

  // 起動時に localStorage から復元 → 以降の theme 変更で <html data-theme> + LS 同期。
  // 復元前に LS を書き込むと初期値（dark）で上書きされてしまうので、
  // hasRestored フラグで「復元 effect が完了してから」のみ書き込む。
  useEffect(() => {
    if (!hasRestored.current) {
      try {
        const saved = window.localStorage.getItem(THEME_KEY);
        if (saved === 'light' || saved === 'dark') setTheme(saved);
      } catch {
        // localStorage 不可
      }
      hasRestored.current = true;
      return; // この pass では DOM 反映だけスキップ（次の theme 更新で適用）
    }
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme, setTheme]);

  // 初回マウント時に DOM だけは同期（restore 完了前なので LS 書き込みは行わない）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // [P4-64] U10 localStorage 自動保存:
  // (1) 起動時に保存済み snapshot があれば復元
  // (2) params 変更を debounce 1s で localStorage に保存
  useEffect(() => {
    const saved = loadParamsFromLocalStorage();
    if (saved && isValidSnapshot(saved)) {
      try {
        applySnapshot(useParamsStore, saved);
      } catch {
        // 形式不正で reject されたら無視（既定値で起動）
      }
    }
    // 永続化監視: params の変更 1s debounce で保存
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useParamsStore.subscribe((state) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveParamsToLocalStorage(serializeParams(state));
      }, 1000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
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
            <ThemeToggle />
            <AdvancedModeToggle />
            <HelpButton />
            <ExportPngButton />
            <SettingsIoButtons />
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
          <CollapsibleSection title="表示トグル" testId="section-legend" initiallyOpen>
            <Legend />
          </CollapsibleSection>
          <CollapsibleSection
            title="色凡例"
            testId="section-color-legend"
            initiallyOpen={false}
          >
            <ColorLegend />
          </CollapsibleSection>
          <CollapsibleSection
            title="セル情報"
            testId="section-cell-inspector"
            initiallyOpen
          >
            <CellInspector />
          </CollapsibleSection>
          <CollapsibleSection title="地形" testId="section-terrain" initiallyOpen>
            <TerrainSourceSelector />
          </CollapsibleSection>
          <CollapsibleSection
            title="軌道パラメータ"
            testId="section-orbital"
            initiallyOpen={false}
          >
            <OrbitalSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="惑星本体"
            testId="section-planet-body"
            initiallyOpen={false}
          >
            <PlanetBodySliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="大気・海洋"
            testId="section-atmosphere-ocean"
            initiallyOpen={false}
          >
            <AtmosphereOceanSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 1 ITCZ 調整"
            testId="section-itcz"
            initiallyOpen={false}
          >
            <ITCZStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 2 風帯 調整"
            testId="section-wind-belt"
            initiallyOpen={false}
          >
            <WindBeltStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 3 海流 調整"
            testId="section-ocean-current"
            initiallyOpen={false}
          >
            <OceanCurrentStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 4 気流 調整"
            testId="section-airflow"
            initiallyOpen={false}
          >
            <AirflowStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 5 気温 調整"
            testId="section-temperature"
            initiallyOpen={false}
          >
            <TemperatureStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 6 降水 調整"
            testId="section-precipitation"
            initiallyOpen={false}
          >
            <PrecipitationStepParamsSliders />
          </CollapsibleSection>
          <CollapsibleSection
            title="Step 7 気候帯 調整"
            testId="section-climate-zone"
            initiallyOpen={false}
          >
            <ClimateZoneStepParamsSliders />
          </CollapsibleSection>
        </section>
      </main>
      <Footer />
      <Toast />
      <KeyboardShortcuts />
      <OnboardingModal />
    </div>
  );
}

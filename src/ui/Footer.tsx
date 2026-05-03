// アプリケーション Footer。バージョン / ビルド日時 / 一次参照リンクを表示。
// 仕様: [現状.md §6 U16] アプリメタ情報（バージョン・ビルド日時 footer）。
// 規約:
//   - vite.config.ts の define で `__APP_VERSION__` / `__BUILD_DATE__` を埋め込む
//   - 一次参照は Worldbuilding Pasta（[docs/INTENT.md]）

export function Footer() {
  return (
    <footer className="app__footer" data-testid="app-footer">
      <span className="app__footer-item">
        ExoClim <code>v{__APP_VERSION__}</code>
      </span>
      <span className="app__footer-sep">·</span>
      <span className="app__footer-item">
        build <code>{__BUILD_DATE__}</code>
      </span>
      <span className="app__footer-sep">·</span>
      <span className="app__footer-item">
        準拠:{' '}
        <a
          href="https://worldbuildingpasta.blogspot.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="app__footer-link"
        >
          Worldbuilding Pasta
        </a>
      </span>
      <span className="app__footer-sep">·</span>
      <span className="app__footer-item">
        キー: <code>0</code>=年平均 <code>1</code>=1月 <code>2</code>=4月{' '}
        <code>3</code>=7月 <code>4</code>=10月{' '}
        <code>←→</code>=pan（Shift で高速）
      </span>
    </footer>
  );
}

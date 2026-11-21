# 筋トレ管理（Workout Tracker）

筋トレの記録・履歴・推移を管理する、スマホ向けの Web アプリです。データは**端末のブラウザ内（IndexedDB）にだけ**保存され、外部には送信しません。オフラインでも使えます（PWA）。

仕様駆動で開発しています。仕様は [`specs/workout-tracker/`](./specs/workout-tracker/) にあります。

| 文書 | 内容 |
| --- | --- |
| [requirements.md](./specs/workout-tracker/requirements.md) | 要件（何を作るか） |
| [design.md](./specs/workout-tracker/design.md) | 設計（どう作るか） |
| [tasks.md](./specs/workout-tracker/tasks.md) | 実装タスクと進捗、確認結果 |

## 開発

Node.js 22.13 以上が必要です（`.nvmrc` 参照）。

```sh
npm ci
npm run dev                 # 開発サーバー
npm test                    # テスト
npm run lint                # ESLint
npm run typecheck           # 型チェック
npm run build               # 本番ビルド（dist/）
npm run check:requirements  # 要件 ID とテストの対応を確認
```

性能の計測（500 ワークアウト / 15,000 セット）は `scripts/measure-performance.cjs` を参照してください。

## 公開（GitHub Pages）

`.github/workflows/deploy.yml` が、`main` への反映時に検証（型・lint・テスト・要件の対応・ビルド）を行い、成功すると GitHub Pages に公開します。`main` 以外のブランチと PR では、検証だけを行い、公開はしません。

初回だけ、リポジトリの設定が必要です。

1. GitHub のリポジトリで **Settings → Pages** を開く。
2. **Build and deployment → Source** を **GitHub Actions** にする。
3. 作業ブランチ（`feature/workout-tracker`）を `main` にマージする。
4. **Actions** タブで「検証と公開」が成功したことを確認する。
5. 公開 URL は `https://<ユーザー名>.github.io/claude-spec-driven/` です。

ホーム画面への追加（スマホ）:

- iPhone（Safari）: 共有ボタン → 「ホーム画面に追加」
- Android（Chrome）: メニュー → 「アプリをインストール」または「ホーム画面に追加」

> データは端末ごとに別々に保存されます。機種変更やブラウザのデータ削除に備えて、設定画面から JSON をエクスポートして保管してください。

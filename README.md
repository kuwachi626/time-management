# Time Management

CSV で読み込んだスケジュールをもとに、「今どの枠か」「残り時間」「次の枠」を大きく表示するタイマーアプリです。
走行会やレースのタイムテーブル運営など、離れた場所からでも残り時間が読めることを想定しています。

公開先: https://kuwachi626.github.io/time-management/ （GitHub Pages）

## 機能

- 現在時刻に一致する枠を自動で判定し、残り時間をカウントダウン表示
- 次の枠の名前・時間帯・所要時間をフッターに表示
- 右上のメニューからスケジュール全体を一覧表示
- 読み込んだスケジュールはブラウザの localStorage に保存され、リロード後も保持
- PWA 対応（ホーム画面に追加・オフラインでも起動可能）

## CSV フォーマット

1 行目はヘッダーとして読み飛ばされます。2 行目以降は以下の 6 列（カンマ区切り）です。

```csv
現在の回数,回数,クラス,開始,終了,走行時間
1,1(5),RMC,9:00,9:15,0:15
2,1(5),RMB,9:20,9:35,0:15
```

| 列 | 内容 | 例 |
| --- | --- | --- |
| 現在の回数 | 通し番号 | `1` |
| 回数 | クラス内での回数 | `1(5)` |
| クラス | 表示名 | `RMC` |
| 開始 | 開始時刻（`H:mm`） | `9:00` |
| 終了 | 終了時刻（`H:mm`） | `9:15` |
| 走行時間 | 所要時間（表示用） | `0:15` |

サンプルは [test.csv](./test.csv) を参照してください。

## 開発

```bash
pnpm install
pnpm dev
```

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバーを起動 |
| `pnpm build` | 型チェックと本番ビルド（`dist/`） |
| `pnpm preview` | ビルド結果をローカルで確認 |
| `pnpm lint` | ESLint を実行 |

Service Worker は本番ビルドのみ登録されます（開発時は HMR と干渉するため無効）。

## デプロイ

`main` ブランチへ push すると GitHub Actions（[deploy.yml](./.github/workflows/deploy.yml)）が
ビルドして GitHub Pages に公開します。公開パスは `vite.config.ts` の `base` と
`public/manifest.json` の `start_url` / `scope` で `/time-management/` に揃えています。

## 技術スタック

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4

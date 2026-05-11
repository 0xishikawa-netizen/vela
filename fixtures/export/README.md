# Export 回帰・配布前確認（インデックス）

## CI（Linux・GPU 不要）

GitHub Actions の **Export fixture regression**（`.github/workflows/phase-a-export-fixtures.yml`）では主に次を実行します。

- **`npm run check:export-encoder`** — HW エンコーダ解決の純粋 assert（**実エンコード・GPU は使わない**）
- **`npm run check:export-presets`**
- **`npm run check:export-diagnostics`**
- **`npm run check:export-platform-smoke-doc`** — 配布前スモーク手順ドキュメントの必須セクション検証
- **`npm run check:subtitles`** — SRT/VTT パース・シリアライズの純粋チェック（Phase E-1）
- **`npm run fixture:phase-a:verify`** / **`npm run fixture:phase-b:verify`** — 実 FFmpeg 書き出し〜尺・オーディオ緩検査

**HW エンコードの実機検証は CI では行いません。** macOS / Windows / Linux ごとの配布前確認は **`docs/export-platform-smoke.md`** のチェックリストに従ってください。

## 実機スモーク（配布前）

| ドキュメント | 内容 |
|--------------|------|
| [`docs/export-platform-smoke.md`](../../docs/export-platform-smoke.md) | Phase D-5: **プラットフォーム別・共通**の書き出しスモーク、失敗時ログ、`+faststart`、プリセット、フォールバック **1 回** など |

## フェーズ別 fixture README

| ディレクトリ | 内容 |
|--------------|------|
| [phase-a/README.md](./phase-a/README.md) | テロップ ASS、xfade、overlay、音声尺、Effects 書き出し |
| [phase-b/README.md](./phase-b/README.md) | クリップ音量・パン・フェード・マスター等 |
| [phase-c/README.md](./phase-c/README.md) | LUT / カラー export・preview 周辺 |

## 方針メモ

- **Linux VAAPI**: 未実装。Linux の **自動** はソフトエンコード。
- **HW 失敗時のフォールバック**: **ソフトウェアへの再試行は 1 回のみ**（`electron/ffmpeg.ts`）。

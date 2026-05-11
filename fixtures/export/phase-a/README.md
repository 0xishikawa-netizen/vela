# Phase A export regression fixtures

配布前の export 全体索引・実機スモーク: [fixtures/export/README.md](../README.md)（`docs/export-platform-smoke.md` を参照）。

## 目的

短尺プロジェクトで **実 FFmpeg 書き出し**（テロップ ASS、音声尺、xfade、overlay、Effects）の回帰を確認する。

## 通常フロー（8/8 が通ることを期待）

リポジトリルートで次を実行すると、**media → prepare → build → export → 尺チェック**まで一括で走ります。

```bash
npm run fixture:phase-a:verify
```

期待: **8 fixture すべて**が export 成功し、`fixture:phase-a:check-all` で PASS。

**`fixture:phase-a:verify`** は **GitHub Actions（Linux）** の **Export fixture regression** ワークフローで PR / `main` push 時にも実行される（実装: `.github/workflows/phase-a-export-fixtures.yml`）。続けて **`npm run fixture:phase-b:verify`**（オーディオクリップ回帰）も同じ job で実行する。**`fixture:phase-a:verify:relaxed` は CI では使わない**。

**CI が落ちたとき:** Actions の **Artifacts** から `export-fixtures-debug-<run_id>` を取得する。Phase A は `fixtures/export/phase-a/verify-ci.log`、`out/`、`prepared/`、`media/`。Phase B は `fixtures/export/phase-b/verify-ci.log`、`out/`、`prepared/`（パスごと収集・失敗タイミングにより空あり）。詳細は `fixtures/export/phase-b/README.md`。

### `npm scripts` の意味

| script | 役割 |
|--------|------|
| `fixture:phase-a:verify` | 上記一括（本番想定の回帰） |
| `fixture:phase-a:verify:relaxed` | **`verify` と同じコマンドチェーン**を起動するだけ（後方互換用）。**telop 等を恒久スキップしない**。古い「relaxed = スキップ」という意味は廃止済み。 |

単体ステップや `check` だけ使う場合は従来どおり `fixture:phase-a:media` / `prepare` / `export` / `check-all` を参照。

## `ass` と `subtitles`（再発防止）

Vela の **ASS テロップ書き出し**は FFmpeg の **`ass` フィルタ**で焼く。文字列は **`subtitles` 用と流用しない**。

| | **OK** | **NG** |
|---|---------|--------|
| **ASS → `ass` フィルタ** | `ass='/abs/path.ass'` または本リポでは `electron/ffmpeg.ts` の **`buildAssBurnInFilter`** 経由 | `ass=file='/abs/path.ass'`（`subtitles` の `file=` と混同。**FFmpeg static で SIGSEGV することがある**） |
| **`subtitles`（将来 SRT 等）** | ドキュメントに従い `subtitles=file='…'` 等、**そのフィルタの仕様どおり** | ASS 向けに組んだ **`ass=` 断片をそのまま流用** |

インプリの単一ソース: `electron/ffmpeg.ts` の **`buildAssBurnInFilter`**（前後の `format=yuv420p` と `shaping=0` もここに集約）。

## 概要

書き出し実体は **`electron/ffmpeg.ts` の `exportVideo`**。アプリは IPC `export:start`、Phase A の CLI は `npm run build` 後の **`out/main/chunks/ffmpeg-*.js`** を import して同関数を実行。

確認対象の詳細は次のとおり。

- テロップ ASS（`src/lib/telopAss.ts` / `telopExportGeometry` / `telopRenderer`）
- 音声尺・`amix` / `atrim` / `apad` / `-t`（`electron/ffmpeg.ts`）
- xfade（非重なり）／overlay（重なり）の排替
- Effects / LUT / colorGrade の書き出し反映（`buildClipVideoFilterParts`）
- プロジェクト形は `src/lib/types.ts` の `Project`

### CLI で段階実行

```bash
npm run fixture:phase-a:media
npm run fixture:phase-a:prepare
npm run build
npm run fixture:phase-a:export
npm run fixture:phase-a:check-all
```

- `phase-a-xfade` 系は export 側で **`crossfadeAdjacent: true`**（0.35s）。`check-all` の期待尺はそれに合わせている。
- `out/` と `prepared/` のメディアは **Git 管理外**（ルート規約）。

## ffprobe

```bash
ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 output.mp4
```

一括チェックは `npm run fixture:phase-a:check-all`（`phase-a-*.mp4` のみ対象）。

## フィクスチャ一覧（目安）

| ファイル | 確認内容 | 期待（目安） |
|----------|-----------|------------------|
| `phase-a-basic-telop.json` | 日本語・改行、fade/slide/zoom、位置 | 成功・`duration` ≈ **8s** |
| `phase-a-audio-shorter-than-video.json` | 映像 10s・音声 2s | ≈ **10s**、無音パッド |
| `phase-a-audio-longer-timeline.json` | 長尺 WAV を 8s に | ≈ **8s** |
| `phase-a-multi-audio.json` | 2 音声・遅延 | ≈ **10s** |
| `phase-a-xfade.json` | 隣接 xfade | xfade ON 時 ≈ **8 − 0.35s** |
| `phase-a-xfade-no-clip-transition.json` | 境界 transition none | 同上 |
| `phase-a-overlay.json` | 時間重複 | overlay・xfade 無・≈ **8s** |
| `phase-a-effects-export.json` | vivid + colorGrade + LUT | 成功・≈ **6s** |

## トラブルシュート

### 詳細ログ（再現用 `argv`）

`exportVideo` は次の環境変数でデバッグ出力（stderr）を有効化する。

- **`VELA_PHASE_A_DEBUG=1`**
- **`VELA_EXPORT_DEBUG=1`**（どちらも同様の詳細ログ）

出力例: `ffmpeg` パス、version 先頭、`filter_complex` 全文、**`argv` の JSON（手動 `spawn` 再実行用）**、生成 ASS の先頭。

```bash
npm run build
VELA_PHASE_A_DEBUG=1 npm run fixture:phase-a:export
```

**デバッグ時は一時 `.ass` を削除しない**（`out/` に `.vela-telop-*.ass` が残ることがある）。

### 別バイナリで比較

**`FFMPEG_BIN`** に実行ファイルを指定すると `resolveFfmpegBinary()` がそれを使う（`electron/paths.ts`）。

### 誤った `ass=file=` の最小再現（参考）

```bash
# NG 例
-filter_complex "[0:v]fps=30[v];[v]ass=file='/abs/telop.ass'[out]"
```

### 手動 bisection（参考）

- `-vf subtitles=…` や `filter_complex` 単体の `subtitles` で切り分けする場合、`fixtures/export/phase-a/media/video-a.mp4` と、`VELA_PHASE_A_DEBUG=1` で残した `.ass` を使える。
- ASS チェーンでの本番コードは **`ass` + `buildAssBurnInFilter`** に合わせること。

### その他

- **`phase-a-multi-audio` と pan**: フィクスチャは **`pan: 0`**（モノラル + stereotools が古い ffmpeg で不安定になりうるため）。
- 単一ファイルの尺チェック:  
  `npm run fixture:phase-a:check -- ./out.mp4 --from-project fixtures/export/phase-a/prepared/phase-a-basic-telop.json --epsilon 0.6`

## 既知の制約

- プレビュー映像にはルック／LUT／colorGrade は未反映（EffectsPanel / ExportModal のとおり）。
- overlay 経路では xfade は無効。
- bounce / glitch 等のリッチアニメは ASS 未再現。
- フォントは libass 環境依存。複行の縦位置は Canvas と差が残ることがある。

## プロジェクト JSON

- `fixtures/export/` のテンプレは **`<REPO_ROOT>`**（`prepare` で絶対パス化）。
- `prepared/` と生成メディア・`out/*.mp4` は **Git 管理外**。

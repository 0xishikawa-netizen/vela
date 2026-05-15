# Whisper local 手動スモーク（ユーザー指定 binary / model）

Vela の **Whisper local** は `electron/ipc/whisperLocal.ts` で whisper.cpp 系 CLI を `spawn` し、成果物を **`outBase.json` → `outBase.srt` → `outBase.vtt`**（`outBase` は拡張子なし）の順で読み取ってパースします。`buildWhisperLocalArgs` は **`-of` に拡張子なし**を渡します（`whisper-cli` が `.json` 等を付与。`-of …/out.json` だと二重拡張子になり read 失敗しうる）。ここでは **実バイナリ・モデルを同梱しない** 前提で、ユーザー環境での確認手順を固定します。

## 前提

- **binary**: ユーザーがビルドまたは配布物から用意した whisper.cpp 系実行ファイル（パスを設定 UI で指定）。
- **model**: `.gguf` / `.bin` 等、CLI が受け付けるモデルファイル。
- **CI**: 実 whisper binary / model は要求しません（本ドキュメントは人手用）。

## 推奨初期確認

1. 短い **wav** または **mp4**（数秒〜数十秒）を用意する。
2. プロジェクトを開き、タイムラインにそのメディアを載せる（またはソースパスを直接入力）。
3. **字幕**パネル → **Whisper local 設定**で **binary** / **model** を指定し、検証が通ることを確認。
4. エンジンで **Whisper local（実験的）** を選び、**mock ではなく** `whisper-local` でジョブを実行。

## 実行後に確認すること

- **job status**: キュー → 実行中 → **完了** または **失敗**。
- **progress event**: `whisperLocal:progress` 由来の進捗（現状は **粗い** 仮値。stderr の厳密 parse は未実装）。
- **output raw kind**: 成功時 IPC 結果に **`json` / `srt` / `vtt`** のどれで読み取ったか（実ファイルの存在順に依存）。
- **subtitleTracks 追加**: ジョブが **完了** かつセグメントがある場合、「結果を字幕トラックへ追加」でキューが増えること。
- **diagnostics / console**: 失敗時は DevTools の **Console** と、必要なら書き出し診断ログ保存フロー（本ドキュメントの主眼外）を参照。

## 失敗時に見ること

- **binary path**: 実行権限・パス誤り・別 OS 用バイナリ。
- **model path**: 拡張子・破損・CLI と不一致。
- **stderr tail**: main が収集する stderr の末尾（ジョブ失敗メッセージに要約が載る場合あり）。
- **exit code**: 非 0 のとき **終了コード** と stderr をセットで確認。
- **`outBase.json` / `outBase.srt` / `outBase.vtt` の有無**: 一時ディレクトリ `app.getPath('temp')/vela-whisper-{runId}/out` をベースに CLI が生成。プロセス終了直後に作業ディレクトリは削除されるため、再現時は短い素材で繰り返すか、必要なら main にデバッグ用の保持を検討（未実装）。

## 既知の未対応（ロードマップ Remaining 参照）

- **progress parse** は粗い（stderr 行ベースの実進捗はこれから）。
- **CLI flag compatibility**（`-of` の解釈、`verbose_json` 等）はビルドごとに差があり得る。`buildWhisperLocalArgs` のコメントとコードを参照（**実測メモ**参照）。
- **chunking**（長尺分割）は未実装。
- **GPU option**（`preferGpu` → argv）は未接続。
- **bundled binary** 方針は未確定。

## 実測メモ（Phase E-10）

実施日: 2026-05-12。実施環境: **macOS**（darwin arm64、Apple M1）。**Electron UI 経由の 1 本は未操作**；`whisper-cli` を **`buildWhisperLocalArgs` と同一方針の argv** で起動し、成果物と **exit code** / **stderr** を確認した。

| 項目 | 値 |
|------|-----|
| **binaryPath** | `/tmp/vela-whisper-e10/repo/build/bin/whisper-cli`（ソースタグ **v1.8.4** / ggml-org `whisper.cpp` を CMake Release ビルド） |
| **modelPath** | `/tmp/vela-whisper-e10/repo/models/ggml-tiny.bin`（`models/download-ggml-model.sh tiny`） |
| **sourceMediaPath** | リポジトリ内 `fixtures/export/phase-a/media/audio-1s.wav`（約 1 秒） |
| **成功 / 失敗** | **成功**（初回のみ `-of` に `.json` を含めた argv で **失敗**＝`out.json.json` のみ生成・Vela の `out.json` 探索と不一致。コードを **`-of` 拡張子なし**に修正後は成功） |
| **output raw kind** | **json**（`-oj`）。同一バイナリで **srt** / **vtt** も `-osrt` / `-ovtt` + `-of <dir>/out` で `out.srt` / `out.vtt` が生成されることを確認 |
| **job status / progress** | CLI のみのため UI の job は未計測。**stderr** に Metal 初期化・`whisper_print_timings` 等。**progress** はアプリ側は stderr チャンク数ベースの粗い仮進捗のまま |
| **subtitleTracks** | 生成 JSON はルート **`transcription`** 配列（`timestamps.from` / `to`）で、`parseWhisperJsonOrSrtOutput` がセグメント 1 件を返すことを確認。**アプリ上で「結果を字幕トラックへ追加」**は、IPC が `ok: true` でセグメント返却すれば既存導線で可能（本メモでは UI 未操作） |
| **stderr tail（例）** | `ggml_metal_init: found device: Apple M1` … `output_json: saving output to '…/out.json'`（成功時） |
| **exit code** | **0** |

**CLI flag 差分（実測）:** `whisper-cli` v1.8.4 は **`-of` にファイルベースパス（拡張子なし）**を期待し、出力は `<path>.json` / `.srt` / `.vtt`。Vela はこれに合わせて argv を生成する。

## 実測メモ（Phase E-11）

実施日: 2026-05-12。実施環境: **macOS**（darwin arm64）。

### A. Electron main と `whisperLocal:start` の同一経路（自動）

レンダラの `ipcRenderer.invoke('whisperLocal:start')` は main 側で **`invokeWhisperLocalStart`** を呼ぶ実装と同一。UI 操作なしで検証するには:

1. `npm run build`
2. （E-10 と同系統のパスがあれば）`npm run smoke:whisper-local:electron`  
   または手動で  
   `VELA_SMOKE_WHISPER_BIN=/path/to/whisper-cli`  
   `VELA_SMOKE_WHISPER_MODEL=/path/to/ggml-tiny.bin`  
   `VELA_SMOKE_WHISPER_MEDIA`（省略時は `process.cwd()` 基準の `fixtures/export/phase-a/media/audio-1s.wav`）  
   を付けて `npx electron out/main/smoke-whisper-local.js`

**結果（本環境）:** **`[smoke-whisper-local] progress`** に `whisperLocal:progress` 相当の JSON が複数行出力。**`[smoke-whisper-local] OK`** に `rawOutputKind:"json"`、`segmentCount:1`、`exitCode:0`。**失敗時の原因**は E-10 と同様に `-of` 二重拡張子など CLI 差が主因になり得るが、E-10 の argv 修正後は解消済み。

### B. Electron UI 経由（手動）

自動エージェントはウィンドウ操作ができないため、**手動**で次を確認する。

1. `npm run dev` でアプリ起動。プロジェクトを開き、タイムラインに **audio-1s.wav** を載せる（またはソース欄に絶対パスを入力）。
2. **字幕**パネル → Whisper local 設定で **binaryPath** / **modelPath** を指定（E-10 と同じ `whisper-cli` / `ggml-tiny.bin` で可）。
3. エンジン **Whisper local（実験的）** を選び実行。
4. **job status**: キュー → **実行中** → **完了**（または失敗）。**progress** は stderr チャンク由来の粗い仮進捗。
5. 完了行に **読取: json**（または srt/vtt）が出ることを確認（**`resultRawOutputKind`**）。
6. **「結果を字幕トラックへ追加」** → **`subtitleTracks`** にトラックが増えること。
7. **ファイル字幕**の **SRT / VTT 書き出し**（`SubtitleFilePanel` の保存）でエクスポートできること。

## 関連コマンド（開発者向け）

- `npm run check:transcription` — argv / パース / 成果物パス順の純粋 assert。
- `npm run check:whisper-local-smoke-doc` — 本ファイルの必須キーワード検査（スクリプト名に `whisper-local-smoke-doc` を含む）。
- `npm run smoke:whisper-local:electron` — 任意。ビルド済み **`invokeWhisperLocalStart`** 経路（`/tmp` の whisper ビルドが無い環境では exit 0 でスキップ）。

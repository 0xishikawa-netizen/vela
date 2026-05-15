# Vela

ローカルファーストの動画編集（Electron + React + FFmpeg）。

## 開発

```bash
npm install
npm run dev
```

## テスト・CI

- **自動（PR / main）:** GitHub Actions **Export fixture regression** で Linux 上の **`fixture:phase-a:verify`** / **`fixture:phase-b:verify`** および各種 **`npm run check:*`**（例: **`check:subtitles`**、**`check:transcription`**、**`check:whisper-local-smoke-doc`**、**GPU は使わない**）。
- **ファイル字幕（Phase E）:** E-1〜E-2 でデータと編集 UI。E-3〜E-4 で mock ジョブと **`transcriptionEngine`**。E-5 で **`whisperLocalRunner`**・**`electron/ipc/whisper-local-ipc-memo.md`**。E-6 で **`WhisperLocalSettings`**・**`userData/whisper-local-settings.json`**・**dialog**・**`whisperLocalSettingsStore`**・**設定 UI**。E-7 で **`electron/ipc/whisperLocal.ts`**（`spawn`・進捗 IPC・取消）。E-8 で **`parseWhisperJsonOrSrtOutput`**（JSON/SRT/VTT）と **字幕トラック反映**。E-9 で **`docs/whisper-local-smoke.md`**（手動スモーク）・**`check:whisper-local-smoke-doc`**。E-10 で **実測メモ**（`whisper-cli` v1.8.4）と **`-of` argv 修正**（拡張子なし）。E-11 で **IPC 同一経路スモーク**（`invokeWhisperLocalStart` / `smoke-whisper-local` / 任意 **`npm run smoke:whisper-local:electron`**）と **UI 手順**・**`resultRawOutputKind`**。**実推論の成功保証・モデル同梱は未実装**（その他 CLI 差は Remaining）。
- **HW エンコード:** CI では実機検証しない。**配布前**は `docs/export-platform-smoke.md` の OS 別チェックリストで確認する。
- **Linux:** **VAAPI は未実装**。自動エンコードはソフトウェア。**HW 失敗時のソフトへの再試行は 1 回のみ**（実装は `electron/ffmpeg.ts`）。

export 回帰のインデックス: `fixtures/export/README.md`

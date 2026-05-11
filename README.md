# Vela

ローカルファーストの動画編集（Electron + React + FFmpeg）。

## 開発

```bash
npm install
npm run dev
```

## テスト・CI

- **自動（PR / main）:** GitHub Actions **Export fixture regression** で Linux 上の **`fixture:phase-a:verify`** / **`fixture:phase-b:verify`** および各種 **`npm run check:*`**（例: **`check:subtitles`**、**`check:transcription`**、**GPU は使わない**）。
- **ファイル字幕（Phase E）:** E-1〜E-2 でデータと編集 UI。E-3〜E-4 で mock ジョブと **`transcriptionEngine`**。E-5 で **`whisperLocalRunner` skeleton**・**`runWhisperLocalTranscriptionEngine` の検証つき失敗**・**`electron/ipc/whisper-local-ipc-memo.md`**（将来 main `spawn`）。**実 Whisper 推論・モデル同梱は未実装**。
- **HW エンコード:** CI では実機検証しない。**配布前**は `docs/export-platform-smoke.md` の OS 別チェックリストで確認する。
- **Linux:** **VAAPI は未実装**。自動エンコードはソフトウェア。**HW 失敗時のソフトへの再試行は 1 回のみ**（実装は `electron/ffmpeg.ts`）。

export 回帰のインデックス: `fixtures/export/README.md`

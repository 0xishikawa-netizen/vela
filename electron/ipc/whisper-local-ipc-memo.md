# Whisper ローカル文字起こし — 将来 IPC 設計メモ（Phase E-5）

レンダラは **`child_process` を直接使わない**。**main で `spawn`** し、結果・進捗は **IPC** で返す。

## 想定フロー

1. レンダラ: `window.electronAPI.startWhisperTranscription({ jobId, inputPath, options, paths })` のような **単一開始** IPC。
2. main: 一時ディレクトリに出力ベースパスを決め、`buildWhisperLocalArgs`（`src/lib/whisperLocalRunner.ts`）相当の argv で **バイナリを spawn**。
3. **進捗**: stderr / stdout を行単位で読み、パターンが取れれば `webContents.send('transcription:progress', { jobId, progress, detail })`。取れなければ不定長ジョブ用の **indeterminate** 表現を検討。
4. **取消**: 別 IPC `cancelWhisperTranscription(jobId)` → **子プロセス `kill`**（SIGTERM → 必要なら SIGKILL）。
5. **一時ファイル**: 出力 JSON/SRT は **OS 一時領域または app.getPath('userData') 配下の専用サブディレクトリ**。完了後に読み取り、レンダラへセグメントを返すかファイルパスだけ返して読ませるかは後で決定。**失敗時も削除**（`try/finally`）。
6. **バイナリ・モデル**: **ユーザー設定**（ファイルピッカー）または **app data 内キャッシュパス**。同梱する場合は **ライセンス表記**と **プラットフォーム別バイナリ**の配置を README / 製品ドキュメントに明記。

## セキュリティ

- 入力パスはプロジェクト由来のメディアに限定するか、main で **存在チェック・パス正規化**。
- ユーザー指定 binary は **パストラバーサル**に注意。

## 未実装（E-5 時点）

- 上記 IPC の **登録・preload 露出・型**は未着手。`runWhisperLocalTranscriptionEngine` はレンダラ内で **設定検証のみ**し、実行は失敗返却。

# Vela — 品質レビュー & 修正レポート

> レビュー日: 2026-05-16  
> 対象ブランチ: main（コミット `8561d0e` 時点）  
> 実施者: Claude Sonnet 4.6

---

## 1. 確認スコープ

| カテゴリ | 対象 |
|----------|------|
| バグ・クラッシュリスク | store, IPC handlers, engine, hooks |
| セキュリティ | IPC payload 検証, パストラバーサル, XSS |
| UX / エラー表示 | トースト, エラーハンドリング |
| パフォーマンス | 再レンダリング, 大ファイル処理 |
| 保守性 | 未使用 import, 二重定義, 型安全 |
| アクセシビリティ | ARIA, キーボード操作 |
| 設計 | アーキテクチャ, 責務分離, IPC 設計, 状態管理 |

---

## 2. 検出された問題一覧

| # | 重大度 | 分類 | ファイル / 場所 | 概要 |
|---|--------|------|----------------|------|
| B-01 | **High** | バグ | `src/store/projectStore.ts:saveProject` | 保存失敗が完全にサイレント（try/catch なし）。I/O エラーや権限エラーがユーザーに届かない |
| B-02 | Medium | バグ | `src/store/projectStore.ts:deleteProject` | 削除失敗が完全にサイレント（try/catch なし） |
| B-03 | Medium | バグ | `src/store/projectStore.ts:saveProject/deleteProject` | `window.electronAPI` を直接参照（`typeof window` ガードなし）。他メソッドは全て守っているのに一貫しない |
| S-01 | Medium | セキュリティ | `electron/preload.ts:startWhisperLocalTranscription` | `payload: object` のまま main へ転送。main 側で `isPayload()` 検証はあるが、preload 層での型 narrow なし |
| S-02 | Low | セキュリティ | `electron/ipc/media.ts:readAudioFileForWaveform` | メディアファイルパスのホワイトリスト検証なし（設計変更が必要） |
| M-01 | Low | 保守性 | `src/store/projectStore.ts:5–34` | 未使用 import: `Track`, `serializeSrt`, `serializeVtt` |
| M-02 | Low | 保守性 | `src/store/projectStore.ts` & `src/lib/projectSanitize.ts` | ~~`ASPECT_RATIOS` が 2 ファイルに同一内容で二重定義~~ → **解消**（`src/lib/aspectRatios.ts` に集約） |
| M-03 | Low | 保守性 | `src/store/editorStore.ts:waveform` 周辺 | waveform 状態が `isLoadingWaveform / waveformFailed / waveformData` 3 フィールドで表現されており不整合リスク |
| P-01 | Low | パフォーマンス | `src/components/editor/Timeline.tsx:snapPoints` | `useCallback` の deps に `currentTime` が含まれ、再生中は毎フレーム再生成される |
| A-01 | Low | アクセシビリティ | `src/components/editor/SubtitleTimelineTrack.tsx:SegmentBar` | `div` で drag 実装。`role="button"` と `aria-label` がない |

---

## 3. 修正済み項目

| # | 問題 | 修正内容 | コミット |
|---|------|----------|--------|
| B-01 | saveProject サイレント失敗 | try/catch 追加 + `useUiToastStore` でエラートースト表示 | 今回修正 |
| B-02 | deleteProject サイレント失敗 | try/catch 追加 + エラートースト表示 | 今回修正 |
| B-03 | `window.electronAPI` 直接参照 | `typeof window !== 'undefined'` ガード追加 | 今回修正 |
| M-01 | 未使用 import | `Track`, `serializeSrt`, `serializeVtt` の import 削除 | 今回修正 |
| M-02 | ASPECT_RATIOS 二重定義 | `src/lib/aspectRatios.ts` 新設、`projectStore` / `projectSanitize` から import。`ASPECT_RATIO_KEYS` で sanitize 側のキー集合も単一化 | 追記コミット |

---

## 4. 未修正・要確認項目

| # | 問題 | 未修正理由 | 対応方針 |
|---|------|------------|---------|
| S-01 | preload の Whisper ペイロード検証 | 設計変更に該当（preload の責務変更） | §10 設計変更提案 D-1 を参照 |
| S-02 | メディアパスのホワイトリスト検証 | 設計変更に該当（IPC セキュリティモデル変更） | §10 設計変更提案 D-2 を参照 |
| M-03 | waveform 状態の不整合リスク | 設計変更に該当（状態モデルのリファクタ） | §10 設計変更提案 D-4 を参照 |
| P-01 | snapPoints 毎フレーム再生成 | 影響小（再生中のみ、配列生成コスト）。要実測 | 将来 optimization pass で対応 |
| A-01 | SegmentBar アクセシビリティ | 機能影響なし。aria 属性追加のみ | 将来 a11y pass で対応 |

---

## 5. 実行結果

```
npx tsc --noEmit 実行結果（修正後）:

修正対象ファイル projectStore.ts → エラー 0 件

残存する既存エラー（本修正とは無関係の pre-existing errors）:
- src/lib/previewLutWebgl.ts: WebGL コンテキスト型エラー（3件）
- src/lib/waveform.ts: SharedArrayBuffer 型エラー（1件）
- src/components/ai/AutoCaptionPanel.tsx: window.electronAPI possibly undefined（8件）
- src/components/editor/EffectsPanel.tsx: same（1件）
- src/components/editor/MediaPanel.tsx: same（4件）
- src/components/editor/Preview.tsx: 未使用 import（2件）
- src/App.tsx / src/pages/Home.tsx: 条件式常にtrue（2件）
```

---

## 6. 残タスク

| タスク | 優先度 | 担当 |
|--------|--------|------|
| S-01 preload 型検証強化 | Medium | 設計承認後に実装 |
| S-02 メディアパス検証 | Medium | 設計承認後に実装 |
| M-03 waveform 状態モデル改善 | Low | 設計承認後に実装 |
| 既存 TypeScript エラー解消 | Low | 別 PR で対応推奨 |
| A-01 aria 属性追加 | Low | a11y pass で対応 |

---

## 7. 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/store/projectStore.ts` | 未使用 import 削除、saveProject/deleteProject に try/catch + toast 追加、typeof window ガード追加 |
| `src/lib/aspectRatios.ts` | `ASPECT_RATIOS` / `ASPECT_RATIO_KEYS` の単一定義（新規） |
| `src/lib/projectSanitize.ts` | 上記から import、二重定義削除 |

---

## 8. 総合判定

**修正可能な即時リスクは全て対処済み。**  
saveProject の silent failure が最も重大なバグで、ディスク満杯・権限エラー時にユーザーがデータ消失に気づけなかった。今回の修正でエラートーストが表示されるようになった。  
セキュリティ・設計面の残課題は §10 に提案としてまとめ、ユーザー承認後に実装する。

---

## 9. 設計レビュー結果

| # | 観点 | 評価 | 所見 |
|---|------|------|------|
| D-arch | アーキテクチャ | ★★★★☆ | Electron + Vite/React の分離は良好。main/renderer 境界が明確 |
| D-resp | 責務分離 | ★★★☆☆ | projectStore が UI トーストを直接呼ぶのは軽微な違反。許容範囲だが、将来 store → event → UI の非同期通知層があると理想的 |
| D-data | データ設計 | ★★★★☆ | SubtitleSegment / SubtitleTrack の独立モデルは適切。Project に `subtitleTracks?: SubtitleTrack[]` として optional にしている後方互換設計は良い |
| D-ipc | IPC 設計 | ★★★☆☆ | preload が `payload: object` のまま転送するため、型安全の恩恵が途切れる。main 側で isPayload() 検証はあるが preload 層の責務として型ナローイングを持つべき |
| D-state | 状態管理 | ★★★★☆ | Zustand + immer の組み合わせは適切。歴史ストア(historyStore)の責務分離も明確 |
| D-error | エラー設計 | ★★★☆☆ | B-01/B-02 で指摘の通り、一部の async 操作でエラーがサイレント。修正後は改善。Whisper エラーの stderrTail ログビューアは実用的 |
| D-test | テスト容易性 | ★★☆☆☆ | テストコードが見当たらない。純粋関数（mockTranscription, subtitleFormat, colorGradeFfmpeg）は単体テスト対象として理想的 |
| D-ext | 拡張性 | ★★★★☆ | TranscriptionEngineId の union 型拡張でエンジン追加が容易。ExportPreset の resolveExportPresetSettings も同様 |
| D-sec | セキュリティ | ★★★☆☆ | project IPC の assertSafeProjectId は適切。Whisper IPC の isPayload() 検証も機能する。メディアパス検証が弱い点が残課題 |
| D-ux | UX | ★★★★☆ | トースト通知、stderrTail ログビューア、字幕タイムライントラックなど UX 投資は十分。saveProject エラー表示は今回修正で解決 |

---

## 10. 設計変更提案

> **重要**: 以下の変更は設計レベルの修正です。実装前に明示的な承認をお願いします。

### D-1: preload 層での Whisper ペイロード型ナローイング

**状態**: **実装済み** — `assertWhisperLocalStartPayload`（`src/lib/whisperLocalIpcMap.ts`）を preload の `startWhisperLocalTranscription` で呼び出し、検証失敗時は `Promise.reject`。

**概要**: ~~`electron/preload.ts` の `startWhisperLocalTranscription` が `payload: object` を受け取りそのまま転送している。~~  
**現状のリスク**: ~~renderer 側のバグや悪意ある拡張によって任意の object が main に届く可能性がある。~~ → preload で早期拒否。main の `isPayload()` は二重防御として維持。  
**影響範囲**: `electron/preload.ts`, `src/lib/whisperLocalIpcMap.ts`  
**破壊的変更**: なし

---

### D-2: メディアファイルパスのホワイトリスト検証

**状態**: **実装済み（allowlist）** — `electron/mediaPathAllowlist.ts` の `Set` に正規化絶対パスを蓄積。`dialog:openMedia` / `openLut` / `pickWhisper*` / `readSubtitleFile` / Whisper 起動時に登録。`projectStore.openProject` / `replaceCurrent` / `importSubtitleText` から `registerMediaAllowlistPaths` IPC で一括登録。`media:*` 読取と `ai:transcribe` は未登録パスを拒否。

**概要**: ~~メディア IPC がパス検証なしで読み取り可能だった。~~  
**提案**: ~~dialog 選択パスのみ許可~~ → 上記のとおり実装。  
**影響範囲**: `electron/ipc/media.ts`, `electron/ipc/dialog.ts`, `electron/ipc/ai.ts`, `electron/ipc/whisperLocal.ts`, `src/store/projectStore.ts`, `src/lib/projectMediaPaths.ts`  
**破壊的変更**: 許可リスト外の絶対パスは読めない（プロジェクト JSON に手書きしたパスは `openProject` 登録でカバー）。

### D-3: ASPECT_RATIOS の単一ソース化

**状態**: **実装済み**（`src/lib/aspectRatios.ts` に `ASPECT_RATIOS` と `ASPECT_RATIO_KEYS` を集約。当初メモの `constants.ts` ではなく、アスペクト比専用モジュールとした）

**概要**: ~~`src/store/projectStore.ts:100–106` と `src/lib/projectSanitize.ts:19–25` に同一内容の `ASPECT_RATIOS` マップが二重定義されている。~~  
**現状のリスク**: ~~どちらかを更新し忘れると不整合が生じる（例: 新アスペクト比追加時）。~~ → 単一ファイルのため解消。  
**提案**: ~~`src/lib/constants.ts` に `ASPECT_RATIOS` を一元化し、両ファイルから import する。~~ → `aspectRatios.ts` で実施済み。  
**影響範囲**: `projectStore.ts`, `projectSanitize.ts`, `aspectRatios.ts`  
**破壊的変更**: なし（内部リファクタ）

---

### D-4: waveform 状態の単一 enum モデル化

**状態**: **実装済み（パスごと）** — `waveformFailed` / `waveformLoading` を廃止し、`waveformPhase: Record<string, 'idle'|'loading'|'ready'|'failed'>` に統合。`TimelineTrack` は従来どおり loading / failed を boolean で受け取るが、内部は単一マップから算出。

**概要**: ~~`editorStore` の waveform 状態が `isLoadingWaveform: boolean`, `waveformFailed: boolean`, `waveformData: Float32Array | null` の 3 フィールドで表現されており、`loading=true && failed=true` のような不整合状態が型上は許容される。~~  
**提案**: ~~`waveformState: 'idle' | 'loading' | 'failed' | 'ready'` の単一 enum フィールドに統合~~ → パスキー付き `waveformPhase` で実施。  
**影響範囲**: `src/store/editorStore.ts`, `TimelineTrack.tsx`  
**破壊的変更**: なし（UI 互換）

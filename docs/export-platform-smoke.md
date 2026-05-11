# 配布前: 書き出しプラットフォームスモーク（手動チェックリスト）

**対象:** Phase D-1（HW encoder）〜 D-4（診断ログ保存）までの export 経路を、**macOS / Windows / Linux** で配布前に目視・実機確認するための一覧です。

**前提:**

- **CI（GitHub Actions）** は **`npm run fixture:phase-a:verify`** / **`fixture:phase-b:verify`** および **`check:export-*`** などの **純粋チェック・Linux 上の fixture** が中心です。**GPU 実機での HW エンコード検証は CI では行いません。**
- **HW エンコードの可否・画質・ドライバ差**は **各 OS の実機スモーク**で確認してください。
- **Linux VAAPI** は **未実装**です（自動はソフト、`NVENC` 明示は API 上試行するが UI は主に Windows 向け。詳細は `vela-product-roadmap.mdc` Phase D-1）。
- **HW 失敗時のフォールバック**は **`libx264` / `libx265` への再試行が 1 回だけ**（`electron/ffmpeg.ts`、ログ `[vela-export]`）。

**参照実装:** `src/lib/exportVideoEncoder.ts`、`src/lib/exportPresets.ts`、`src/lib/exportDiagnostics.ts`、`electron/ffmpeg.ts`、`ExportModal.tsx`。

---

## 共通確認

実施環境: いずれかの OS で **Vela を `npm run dev` で起動**し、小さめのテストプロジェクトで書き出し。

| # | 項目 | 確認内容 |
|---|------|----------|
| C1 | **Software H.264** | 動画エンコーダ **「ソフトウェア」**、プリセットで **H.264**（例: `web_1080p`）。書き出し成功、再生で映像・音声が破綻しない。 |
| C2 | **Software H.265** | プリセット **`archive_4k`** または **`custom`** で **H.265**、エンコーダ **ソフトウェア**。書き出し成功（重い場合は短尺で可）。 |
| C3 | **プリセット `web_1080p`** | 解像度・fps・ビットレートが UI 表示どおり反映され、出力が期待に近い。 |
| C4 | **プリセット `custom`** | 手動で解像度 / fps / ビットレートを変更し、出力に反映される。 |
| C5 | **`+faststart`** | 出力 MP4 に **`-movflags +faststart`** が付く実装のままであること（コード上 `electron/ffmpeg.ts`）。必要なら `ffprobe` でフォーマット確認。 |
| C6 | **ASS テロップ** | テロップありプロジェクトで書き出し、焼き込みが破綻しない（Phase A fixture の手順も参照: `fixtures/export/phase-a/README.md`）。 |
| C7 | **LUT / ColorGrade** | Effects で LUT・カラーグレードをかけた状態で書き出し、**export が正**であること（プレビューとの差はロードマーク参照）。Phase C: `fixtures/export/phase-c/README.md`。 |
| C8 | **オーディオ（ミックス / フェード / パン）** | 複数クリップ・フェード・パン・マスター等、意図したミックスになること（Phase B: `fixtures/export/phase-b/README.md`）。 |
| C9 | **診断ログの保存** | 意図的に失敗させるか既存の失敗再現で **「診断ログを保存…」** から `.txt` を保存し、**プリセット・encoder・stderr tail・platform** が含まれること。 |

---

## macOS

| # | 項目 | 確認内容 |
|---|------|----------|
| M1 | **VideoToolbox H.264** | エンコーダ **VideoToolbox** または **自動**、H.264 プリセットで書き出し成功。 |
| M2 | **VideoToolbox H.265** | HEVC 対応環境で **H.265** + VideoToolbox（または自動）。 |
| M3 | **フォールバック（1 回）** | HW が失敗する条件が取れる場合、ログに **`hardware encode failed; retrying with software`** が出たうえで **ソフト 1 回のみ**再試行されること。成功時は **`Software encode retry succeeded after hardware failure.`** の可能性。 |

---

## Windows

| # | 項目 | 確認内容 |
|---|------|----------|
| W1 | **NVENC / QSV / AMF** | GPU に応じて UI で選べる項目から **いずれか**で H.264 書き出し成功（全種必須ではない）。 |
| W2 | **自動** | **自動** が NVENC 等を選び、失敗時は **1 回だけ**ソフトへフォールバックすること。 |
| W3 | **GPU 非搭載 / ドライバ無し** | **ソフトウェア**で書き出し可能であること。自動選択時は実装どおり **ソフトへフォールバック**を確認できるとよい。 |

---

## Linux

| # | 項目 | 確認内容 |
|---|------|----------|
| L1 | **自動 = ソフトウェア** | エンコーダ **自動** が **libx264 / libx265**（ソフト）になること（VAAPI 等は未実装）。 |
| L2 | **VAAPI** | **未実装**であること（ロードマップ・本ドキュメントの前提として把握）。 |
| L3 | **NVENC 明示** | UI 上は主に Windows 向けだが、環境によっては API 定義上 NVENC を試すコードパスがある。**Linux CI では HW 実機検証しない**。必要ならローカル Linux で挙動のみ確認。 |

---

## 失敗時に保存するログ（サポート用）

書き出し失敗時は **Export モーダル**から **診断ログを保存**し、次を含めて共有できる状態にする。

| 内容 | 含まれる想定 |
|------|----------------|
| **診断ログ（ファイル）** | `buildExportDiagnosticsSaveDocument` 出力（設定要約・試行ごとのブロック）。 |
| **ffmpeg version** | ログ内 `ffmpegVersionHead` 相当。 |
| **platform** | `darwin` / `win32` / `linux`。 |
| **encoder** | 要求・解決されたビデオエンコーダ（試行ごと）。 |
| **stderr tail** | FFmpeg 側の末尾ログ。 |
| **プリセット** | `format`（プリセット ID）・解像度要約。 |

詳細デバッグが必要な場合: 環境変数 **`VELA_EXPORT_DEBUG=1`** または **`VELA_PHASE_A_DEBUG=1`** で **filter_complex / argv 全文** をログ・保存に載せられる（`fixtures/export/phase-a/README.md` 参照）。

---

## 自動チェック（CI・GPU 不要）

次は **ドキュメントの必須見出し・キーワード**のみ検証します（実機は不要）。

```bash
npm run check:export-platform-smoke-doc
```

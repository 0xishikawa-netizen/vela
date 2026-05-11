# Phase C — LUT preview 目視スモーク（manual）

**自動回帰**: 本ディレクトリは **export fixture ではない**。LUT `.cube` の **パース検証**は `npm run check:lut-cube` に含める。  
**Export の色**は常に FFmpeg **`lut3d`** が canonical。ここは **preview（WebGL アトラス + trilinear 近似）** の確認導線のみ。

## 同梱メディア

| ファイル | 用途 |
|----------|------|
| `media/warm-strong-lut.cube` | リポジトリ自前の強めのウォーム調（`LUT_3D_SIZE 4`）。著作権は Vela 生成のテスト用。 |

**identity LUT** は `fixtures/export/phase-a/media/identity-lut.cube` を使う。  
**プレビュー用の映像・静止画**は Phase A の小さめ素材（例: `fixtures/export/phase-a/media/video-a.mp4`）で足りる（本 README では巨大メディアを増やさない）。

## アプリでの目視手順（`npm run dev`）

1. **identity LUT**
   - クリップに `fixtures/export/phase-a/media/identity-lut.cube` を指定。
   - **期待**: preview の色は **ほぼ変化しない**（近似誤差は許容）。

2. **強め LUT**
   - 同じクリップで `fixtures/export/phase-c/media/warm-strong-lut.cube` に差し替え。
   - **期待**: preview が **明らかにウォーム寄り**に変化（R 寄与・B 抑制が分かる）。

3. **`lutPreviewState === 'ready'` 時のレイヤー**
   - **期待**: ソース video/img は **`opacity-0`**（非表示だがデコードは継続）、**LUT 合成 canvas** が見える。DevTools で確認可能。

4. **読み込み失敗時の fallback**
   - 存在しないパスや壊れた `.cube` を指定、またはブラウザのみで `readCubeLutFile` が無い環境。
   - **期待**: **source + CSS preview look**（preset / colorGrade）のみ。プレビュー全体が壊れないこと。

5. **テロップ**
   - テロップを重ねた状態で 1〜2 を確認。
   - **期待**: **テロップ canvas には LUT がかからない**（映像 LUT のみ）。

6. **export との関係**
   - **期待**: 書き出しは **`lut3d` tetrahedral**。preview は **trilinear 近似**であり **pixel 一致はしない**。

7. **DPR / リサイズ（Phase C-2f）**
   - ブラウザの **ズーム**や **ウィンドウ幅**を変え、Retina と非 Retina を切り替え可能なら試す。
   - **期待**: LUT 合成 canvas の **アスペクト**がソース video/img の **object-contain** と揃い、**極端にぼけない**（backing は **表示サイズ × clamp(DPR)**、上限 `PREVIEW_LUT_DPR_MAX`）。

8. **色相・色温度（Phase C-3）**
   - EffectsPanel で **色相**・**色温度**を動かし、LUT なし / identity / 強め LUT で破綻しないこと。
   - **期待**: 書き出しは **`eq` → `hue` → `colorbalance`**（ルックプリセットの次）。preview は CSS 近似のため **pixel 一致はしない**（自動回帰は `npm run check:preview-look`）。

## CI

本 README の手順は **人手**。pixel 一致や Electron E2E は Phase C の Remaining（ロードマップ参照）。

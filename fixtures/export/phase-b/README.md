# Phase B export fixtures（音声クリップの書き出し回帰）

## 目的

Phase B で実装した **クリップ単位の音量・ミュート・パン・フェード IN/OUT** と **プロジェクト全体のマスター音量（`audioMasterVolume`）** が、書き出しパイプラインで壊れていないことを **短尺プロジェクト JSON** と実 FFmpeg で固定化する。あわせて **Phase A で固めた音声の timeline duration 合わせ**（`amix`、`atrim`、`apad`、`-t`）がオーディオ改修後も維持されることを確認する。

## 確認対象（仕様）

| 項目 | 期待 |
|------|------|
| **clip volume** | ゲインのみ変化し、**プロジェクト終端から求めた出力尺**は変わらない |
| **clip mute** | ミュートでも **サイレント音声として尺は維持**（出力コンテナ尺は timeline に追従） |
| **clip fade in/out** | **書き出し**は FFmpeg **`afade`**（`curve=` 未指定の既定）。**プレビュー**は **`src/lib/audioMix.ts` の `calculateAudioFadeGain`**（線形ランプの乗算）。フェード長の正規化は **`resolveNormalizedAudioFadeLengths`** で共有。**`phase-b-fade-in-out`** は export の区間 `mean` で両端低下を自動検査（曲線一致はしない）。 |
| **master volume** | `audioMasterVolume` が **amix 後・アトリム前** の `volume` に反映され、**出力尺は `project.duration` と一致**すること |
| **clip pan** | **`AudioClip.pan`**（トラック pan と加算後にクランプ）が **ステレオ化＋`stereotools=balance_out`**（FFmpeg 6 互換。旧 `balance=` は無効）で書き出しに載る。プレビューは **Web Audio `StereoPanner`**。下記 **pan 系 fixture** では **左右 `mean` の差**を `check-phase-b-export.mjs` の **`PAN_EXPECTATIONS`** で自動検査する。**モノラル音源をステレオ化した経路**に加え、**元からステレオの素材**（`stereo-lr-10s.wav`）でも同様に検査する。 |
| **timeline duration 維持** | 各 fixture の **`project.duration`** と、書き出し MP4 の実尺が許容誤差内で一致 |

## 自動検査の範囲（現状）

`fixture:phase-b:verify`（内部の `check-phase-b-export.mjs`）は次を実行する。

1. **duration（すべての fixture）**  
   ffprobe で出力 MP4 の尺を **`project.duration`** と許容誤差内で照合する（従来どおり）。

2. **音声レベル（ffmpeg `volumedetect`・緩めのしきい値）**
   - **`phase-b-reference-volume`**（基準）: `audioMasterVolume` は省略（論理 1.0）、クリップ音量 **1.0**。`mean` / `max` を **ベースライン**としてログする。
   - **`phase-b-mute`**: **`max_volume` が約 -60dB 以下、または `-inf`** なら無音扱いで PASS。
   - **`phase-b-master-volume`**: 基準の **mean_volume よりおよそ -6dB 相当下がっている**ことを期待し、**(reference − target) が 4dB 以上**なら PASS（CI / コーデック差で厳密比較しない）。
   - **`phase-b-clip-volume`**: 基準より **クリップが明らかに下がっている**ことを期待し、**差が 6dB 以上**なら PASS。
   - **`phase-b-fade-in-out`**: **尺**に加え、export MP4 の音声を **冒頭・中央・終端**の 3 区間に分け、各区間で **`volumedetect`**（`-ss` / `-t`）。**中央の `mean_volume` が両端より大きい**（各端で **`middle − segment >= FADE_SEGMENT_DROP_MIN_DB`（既定 2dB）**）ことを緩く検査。**完全なカーブ一致ではない**。プレビューは **Web Audio 線形ゲイン**（`calculateAudioFadeGain`）、export は **`afade`**。自動検査は **export 結果の回帰**のみ。
   - **pan 系（マップ `PAN_EXPECTATIONS`）**: 左右を `pan=mono|c0=c0` / `pan=mono|c0=c1` で分離して各 ch の `mean` を取得。**`direction: 'right'`** のとき **`R.mean - L.mean`**、**`'left'`** のとき **`L.mean - R.mean`** が **いずれも >= 6dB**（fixture ごとに `minDiffDb` で上書き可）なら PASS。対象 ID: **`phase-b-clip-pan-right`** / **`phase-b-clip-pan-left`** / **`phase-b-track-pan-right`** / **`phase-b-pan-clamp`**（クランプ後も「右寄せ」とみなして `direction: 'right'`）、および **元ステレオ素材**の **`phase-b-stereo-pan-right`** / **`phase-b-stereo-pan-left`**（入力に L=440Hz / R=880Hz の差があるが、pan 後の **左右差**で回帰を見る）。
   - **ステレオ基準（`STEREO_REFERENCE_EXPECTATIONS`）**: **`phase-b-stereo-reference`** では、書き出し後の MP4 について左右 ch それぞれ `volumedetect` の **`max_volume` が -60dB より大きい**（かつ有限）ことを要求する。AAC 後のブレや無音化を緩く検出する目的。**極端に片側だけ無音**や **`-inf`** になっていないことの最低限の固定化である。

実装・環境により dB が数 dB ずれるため、閾値は意図的に緩い。ログに実測 `mean` / `max` と（該当時）drop を出す。

補足:

- `stereotools=balance_out` を採用しているのは、FFmpeg 6 で有効な指定だからです（旧 `balance=` は無効）。
- プレビュー（Web Audio `StereoPanner`）と書き出し（FFmpeg `stereotools`）は **pan law が完全一致しない可能性**があります。現段階の自動検査は **回帰用**であり、「左右差が期待方向に出ること」（pan fixture）と「各 ch にレベルが残ること」（stereo reference）を緩い閾値で見るにとどまる。

`master` / `clip-volume` 用の **`phase-b-reference-volume` の書き出し MP4 と prepared JSON が必須**。欠けるとチェックが失敗する。

## メディア

テスト動画・生成 WAV はリポジトリに含めない。**Phase A と同じ** `fixtures/export/phase-a/media/` を参照する。初回および CI では **`npm run fixture:phase-a:media`**（Phase B の `fixture:phase-b:media` と同一）が先に実行される。

**ステレオ素材** `stereo-lr-10s.wav`（10s・48kHz・L=440Hz / R=880Hz・`amerge` 生成）も同スクリプトで生成される。Phase B の **`phase-b-stereo-*`** がこれを参照する。

## コマンド（ローカル）

```bash
npm run fixture:phase-a:media
npm run fixture:phase-b:prepare
npm run build
npm run fixture:phase-b:export
npm run fixture:phase-b:check-all
```

`fixture:phase-b:check` は `fixture:phase-b:check-all` と同じ内容のエイリアスです。

一括（推奨）:

```bash
npm run fixture:phase-b:verify
```

（Phase A メディア生成 → Phase B prepare → build → export → **duration + 上記音声レベル**チェック）

## Phase A との併用

オーディオまわりを触ったあとは **必ず Phase A も通す**こと（テロップ・映像・音声パイプラインの回帰が一体のため）。

```bash
npm run fixture:phase-a:verify
npm run fixture:phase-b:verify
```

## CI

PR / `main` push では **Phase A・Phase B の verify を連続実行**する（`.github/workflows/phase-a-export-fixtures.yml`）。失敗時 artifact に Phase A / B のログ・`out` / `prepared`（および Phase A `media`）が含まれる。

## フィクスチャ一覧

| JSON | 内容 |
|------|------|
| `phase-b-reference-volume.json` | マスター 1・**クリップ音量 1**。他パターンとの **音声レベル比較用ベースライン** |
| `phase-b-clip-volume.json` | 映像 10s・短い音声・**クリップ音量 0.2** |
| `phase-b-mute.json` | 映像 10s・音声クリップ **`muted: true`** |
| `phase-b-fade-in-out.json` | 映像・音声とも 8s・**fadeIn / fadeOut 0.75s**・export の区間音量でフェード効きを緩検査 |
| `phase-b-master-volume.json` | 映像 10s・クリップ音量 1・**`audioMasterVolume`: 0.5** |
| `phase-b-clip-pan-right.json` | 映像 10s・モノ音声・トラック pan 0・**クリップ `pan`: 1**。`R-L` 自動検査 |
| `phase-b-clip-pan-left.json` | 同上・**クリップ `pan`: -1**。`L-R` 自動検査 |
| `phase-b-track-pan-right.json` | 同上・**トラック `pan`: 1**・クリップ pan 省略（0）。`R-L` 自動検査 |
| `phase-b-pan-clamp.json` | **トラック pan 0.75 + クリップ pan 0.75**（実効 1.0 にクランプ）。`R-L` 自動検査 |
| `phase-b-stereo-reference.json` | **元ステレオ** `stereo-lr-10s.wav` 全文・pan 0。左右 ch の **`max_volume` > -60dB** を自動検査 |
| `phase-b-stereo-pan-right.json` | 同上ソース・**クリップ pan 1**。`R-L` 自動検査 |
| `phase-b-stereo-pan-left.json` | 同上ソース・**クリップ pan -1**。`L-R` 自動検査 |

`prepared/` と `out/*.mp4` は **Git 管理外**（`.gitignore`）。

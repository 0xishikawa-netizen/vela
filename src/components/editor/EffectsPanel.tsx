import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { VideoClip, ImageClip, VideoFilter, ColorGrade, TransitionType } from '../../lib/types'
import { DEFAULT_COLOR_GRADE } from '../../lib/types'

const PRESET_FILTERS: { value: VideoFilter; label: string }[] = [
  { value: 'none', label: 'なし' },
  { value: 'cinematic', label: 'シネマ' },
  { value: 'vintage', label: 'ヴィンテージ' },
  { value: 'sepia', label: 'セピア' },
  { value: 'bw', label: '白黒' },
  { value: 'warm', label: '暖色' },
  { value: 'cool', label: '寒色' },
  { value: 'vivid', label: '鮮やか' },
  { value: 'matte', label: 'マット' },
  { value: 'fade', label: '淡い' },
]

/** クリップ先端の fade フィルタ＋隣接クリップ間 xfade で利用可能な種類 */
const VIDEO_XFADE_TRANSITIONS: { type: TransitionType; label: string }[] = [
  { type: 'none', label: 'なし' },
  { type: 'fade', label: 'フェード' },
  { type: 'dissolve', label: 'ディゾルブ（xfade）' },
  { type: 'wipe', label: 'ワイプ（xfade）' },
  { type: 'slide_left', label: 'スライド左（xfade）' },
  { type: 'slide_right', label: 'スライド右（xfade）' },
  { type: 'slide_up', label: 'スライド上（xfade）' },
  { type: 'slide_down', label: 'スライド下（xfade）' },
  { type: 'zoom_in', label: '円形オープン（xfade）' },
  { type: 'zoom_out', label: '円形クローズ（xfade）' },
]

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="ui-label">{label}</span>
      {children}
    </div>
  )
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <PanelRow label={label}>
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1"
          style={{ accentColor: 'var(--accent)' }}
        />
        <span
          className="mono text-[11px] w-10 text-right shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          {display}
        </span>
      </div>
    </PanelRow>
  )
}

function gradeOfVideo(vc: VideoClip): ColorGrade {
  return vc.colorGrade ?? DEFAULT_COLOR_GRADE
}

function gradeOfImage(ic: ImageClip): ColorGrade {
  return ic.colorGrade ?? DEFAULT_COLOR_GRADE
}

export default function EffectsPanel() {
  const current = useProjectStore((s) => s.current)
  const updateClip = useProjectStore((s) => s.updateClip)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId)

  if (!current || !selectedTrackId || !selectedClipId) {
    return (
      <div className="flex h-32 min-w-0 flex-col items-center justify-center p-4">
        <p className="text-center text-[12px] font-medium" style={{ color: 'var(--label)' }}>
          映像トラックのクリップを選ぶと、ルックを調整できます
        </p>
      </div>
    )
  }

  const track = current.tracks.find((t) => t.id === selectedTrackId)
  const clip = track?.clips.find((c) => c.id === selectedClipId)
  if (!clip || (clip.type !== 'video' && clip.type !== 'image')) {
    return (
      <div className="min-w-0 p-4">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--label)' }}>
          映像・静止画クリップを選択してください。
        </p>
      </div>
    )
  }

  const isVideo = clip.type === 'video'
  const vc = clip as VideoClip
  const ic = clip as ImageClip
  const g = isVideo ? gradeOfVideo(vc) : gradeOfImage(ic)
  const filterVal = isVideo ? vc.filter : ic.filter
  const lut = isVideo ? vc.lutPath : ic.lutPath

  const setGrade = (partial: Partial<ColorGrade>) => {
    if (isVideo) {
      updateClip(selectedTrackId, selectedClipId, {
        colorGrade: { ...gradeOfVideo(vc), ...partial },
      } as Partial<VideoClip>)
    } else {
      updateClip(selectedTrackId, selectedClipId, {
        colorGrade: { ...gradeOfImage(ic), ...partial },
      } as Partial<ImageClip>)
    }
  }

  const pickLut = async () => {
    const p = await window.electronAPI.openLutDialog()
    if (p) updateClip(selectedTrackId, selectedClipId, { lutPath: p } as Partial<VideoClip | ImageClip>)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
        ルック
      </p>
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        プレビューはルックとカラーグレードを CSS で近似します（export と完全一致ではありません）。LUT は WebGL レイヤーで別扱いです。
      </p>

      <PanelRow label="ルックプリセット">
        <select
          className="ui-select w-full"
          value={filterVal}
          onChange={(e) =>
            updateClip(selectedTrackId, selectedClipId, { filter: e.target.value as VideoFilter } as Partial<
              VideoClip | ImageClip
            >)
          }
        >
          {PRESET_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </PanelRow>

      <div className="flex flex-col gap-2">
        <span className="ui-label">LUT（.cube）</span>
        <div className="flex flex-col gap-1.5">
          <p
            className="text-[10px] rounded px-2 py-1.5 mono truncate"
            style={{ background: 'var(--surface-2)', color: 'var(--label)', border: '1px solid var(--border)' }}
            title={lut ?? ''}
          >
            {lut ? lut.split('/').pop() : '未設定'}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-accent shrink-0 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap"
              onClick={() => void pickLut()}
            >
              ファイルを選ぶ
            </button>
            {lut && (
              <button
                type="button"
                className="btn-ghost shrink-0 px-3 py-1.5 text-[12px] whitespace-nowrap"
                onClick={() => updateClip(selectedTrackId, selectedClipId, { lutPath: undefined } as Partial<VideoClip | ImageClip>)}
              >
                クリア
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
        書き出しは <code className="mono">eq</code> → <code className="mono">hue</code> → <code className="mono">colorbalance</code> → <code className="mono">curves</code> → <code className="mono">unsharp</code>（ルックプリセットの次）。
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-[11px]"
          onClick={() => setGrade({ ...DEFAULT_COLOR_GRADE })}
        >
          カラーグレードを既定に戻す
        </button>
      </div>
      <SliderRow
        label="明るさ"
        min={-100}
        max={100}
        step={1}
        value={g.brightness}
        display={`${g.brightness}`}
        onChange={(v) => setGrade({ brightness: v })}
      />
      <SliderRow
        label="コントラスト"
        min={-100}
        max={100}
        step={1}
        value={g.contrast}
        display={`${g.contrast}`}
        onChange={(v) => setGrade({ contrast: v })}
      />
      <SliderRow
        label="彩度"
        min={-100}
        max={100}
        step={1}
        value={g.saturation}
        display={`${g.saturation}`}
        onChange={(v) => setGrade({ saturation: v })}
      />
      <SliderRow
        label="色相"
        min={-180}
        max={180}
        step={1}
        value={g.hue}
        display={`${g.hue}°`}
        onChange={(v) => setGrade({ hue: v })}
      />
      <SliderRow
        label="色温度"
        min={-100}
        max={100}
        step={1}
        value={g.temperature}
        display={`${g.temperature}`}
        onChange={(v) => setGrade({ temperature: v })}
      />
      <SliderRow
        label="ハイライト"
        min={-100}
        max={100}
        step={1}
        value={g.highlights}
        display={`${g.highlights}`}
        onChange={(v) => setGrade({ highlights: v })}
      />
      <SliderRow
        label="シャドウ"
        min={-100}
        max={100}
        step={1}
        value={g.shadows}
        display={`${g.shadows}`}
        onChange={(v) => setGrade({ shadows: v })}
      />
      <SliderRow
        label="シャープネス"
        min={-100}
        max={100}
        step={1}
        value={g.sharpness}
        display={`${g.sharpness}`}
        onChange={(v) => setGrade({ sharpness: v })}
      />

      <div
        className="rounded-lg px-2 py-2 text-[10px] leading-relaxed"
        style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
      >
        フェードはクリップ単体の先端にも適用されます。その他の種類は「書き出し」で隣接クリップ間の xfade を有効にしたとき、境界の見た目として使われます（前クリップの OUT を優先、なければ次の IN）。
      </div>

      <PanelRow label="トランジション IN">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select
            className="ui-select min-w-0 flex-1 basis-[8rem]"
            value={clip.transitionIn.type}
            onChange={(e) => {
              const t = e.target.value as TransitionType
              updateClip(selectedTrackId, selectedClipId, {
                transitionIn: {
                  type: t,
                  duration: t === 'none' ? 0 : Math.max(0.1, clip.transitionIn.duration || 0.35),
                },
              })
            }}
          >
            {VIDEO_XFADE_TRANSITIONS.map((o) => (
              <option key={o.type} value={o.type}>
                {o.label}
              </option>
            ))}
          </select>
          {clip.transitionIn.type !== 'none' && (
            <input
              type="number"
              className="ui-select w-20 shrink-0"
              min={0.05}
              max={5}
              step={0.05}
              value={clip.transitionIn.duration}
              onChange={(e) =>
                updateClip(selectedTrackId, selectedClipId, {
                  transitionIn: { type: clip.transitionIn.type, duration: Number(e.target.value) },
                })
              }
            />
          )}
        </div>
      </PanelRow>

      <PanelRow label="トランジション OUT">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select
            className="ui-select min-w-0 flex-1 basis-[8rem]"
            value={clip.transitionOut.type}
            onChange={(e) => {
              const t = e.target.value as TransitionType
              updateClip(selectedTrackId, selectedClipId, {
                transitionOut: {
                  type: t,
                  duration: t === 'none' ? 0 : Math.max(0.1, clip.transitionOut.duration || 0.35),
                },
              })
            }}
          >
            {VIDEO_XFADE_TRANSITIONS.map((o) => (
              <option key={`o-${o.type}`} value={o.type}>
                {o.label}
              </option>
            ))}
          </select>
          {clip.transitionOut.type !== 'none' && (
            <input
              type="number"
              className="ui-select w-20 shrink-0"
              min={0.05}
              max={5}
              step={0.05}
              value={clip.transitionOut.duration}
              onChange={(e) =>
                updateClip(selectedTrackId, selectedClipId, {
                  transitionOut: { type: clip.transitionOut.type, duration: Number(e.target.value) },
                })
              }
            />
          )}
        </div>
      </PanelRow>
    </div>
  )
}

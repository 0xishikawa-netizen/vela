import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'
import type { VideoClip, ImageClip, AudioClip } from '../../lib/types'
import { DEFAULT_COLOR_GRADE } from '../../lib/types'
import { buildPreviewLookStyle } from '../../lib/previewLook'
import { parseCubeLut } from '../../lib/lutCube'
import {
  clampPreviewLutDpr,
  createPreviewLutRenderer,
  makePreviewLutCacheKeyFromReadResult,
  type PreviewLutRenderer,
} from '../../lib/previewLut'
import type { LutPreviewUiState } from '../../lib/previewLutPreviewUi'
import { lutPreviewShowLutOverlay, previewLookStyleTarget } from '../../lib/previewLutPreviewUi'
import { renderTelops } from '../../lib/telopRenderer'
import {
  audioClipTrimDurationSec,
  calculateAudioFadeGain,
  effectivePanForAudioClip,
  mixGainForAudioClip,
} from '../../lib/audioMix'
import { collectAllTelopClips, topVisualClipAtTime, trackContainingClipId } from '../../lib/visualTimeline'

function fileSrc(abs: string) {
  const u = abs.replace(/\\/g, '/')
  return u.startsWith('file:') ? u : `file://${u}`
}

/**
 * Phase C-2c / C-2d — LUT preview（WebGL）
 *
 * - **Export** の色は FFmpeg `lut3d` が canonical（本コンポーネントでは触らない）。
 * - **Preview** は `.cube` を **WebGL アトラス + trilinear 近似**で表示（`previewLutWebgl`）。export との完全一致は狙わない。
 * - **presetFilter / colorGrade** は **CSS `filter`**（`previewLook`）。**二重適用なし**: `lutPreviewState === 'ready'` のときだけ **LUT canvas** に style、それ以外は **source** に style（`previewLookStyleTarget`）。
 * - **C-2f**: LUT canvas **backing = object-contain 表示サイズ × clamp(DPR)**（`previewLutLayout`）。**再生中のみ**継続 rAF。pause / 静止画は **依存が変わったときだけ** `render`。
 *
 * ## `lutPreviewState === 'fallback'` になる条件（待機 `loading` ではない）
 * - `readCubeLutFile` が無い（ブラウザ等）→ 実質 `disabled`（LUT レイヤー未マウント）。`lutPath` だけある場合は開発時に一度だけ warn。
 * - **IPC** `readCubeLutFile` が `ok: false`。
 * - **`parseCubeLut` が throw**。
 * - **`createPreviewLutRenderer` が null**（WebGL 初期化失敗）。
 * - **`setLut` 後に `isReady()` が false**。
 * - **`render()` が false** かつ **video の `videoWidth` / `videoHeight` または image の `complete`+`naturalWidth` が既に確定**（未確定のフレームは **fallback にしない**で待機）。
 *
 * ## unmount / `lutPath` 空 / clip 切替
 * - `activeLutPath` 変更またはアンマウントで effect cleanup が **renderer dispose** + 状態を **`disabled` または次フレームで `loading`** に戻す。
 */

/** 再生中に毎フレーム currentTime を書き換えるとシークが連続し、映像が出ないことがある */
function syncMediaPlayback(
  el: HTMLMediaElement,
  timelineTime: number,
  clip: { timelineStart: number; sourceStart: number; sourceEnd: number },
  isPlaying: boolean,
) {
  const local = timelineTime - clip.timelineStart + clip.sourceStart
  if (!Number.isFinite(local)) return
  const target = Math.max(0, Math.min(local, clip.sourceEnd - 0.001))
  if (!isPlaying) {
    el.currentTime = target
    el.pause()
    return
  }
  const drift = Math.abs(el.currentTime - target)
  if (el.paused || drift > 0.25) {
    el.currentTime = target
  }
  void el.play().catch(() => {})
}

type BusChain = { src: MediaElementAudioSourceNode; gain: GainNode; panner: StereoPannerNode }

function PreviewAudioSync({
  clip,
  gain,
  pan,
  currentTime,
  isPlaying,
  audioContext,
}: {
  clip: AudioClip
  gain: number
  pan: number
  currentTime: number
  isPlaying: boolean
  audioContext: AudioContext | null
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const sourcePathRef = useRef<string | null>(null)
  const busRef = useRef<BusChain | null>(null)

  useEffect(() => {
    const a = ref.current
    if (!a) return
    if (sourcePathRef.current !== clip.sourcePath) {
      sourcePathRef.current = clip.sourcePath
      a.src = fileSrc(clip.sourcePath)
    }
    busRef.current?.src.disconnect()
    busRef.current?.gain.disconnect()
    busRef.current?.panner.disconnect()
    busRef.current = null

    if (!audioContext) {
      a.muted = gain <= 0.0001
      a.volume = Math.min(1, Math.max(0, gain))
    } else {
      try {
        const src = audioContext.createMediaElementSource(a)
        const gn = audioContext.createGain()
        gn.gain.value = Math.min(8, Math.max(0, gain))
        const panner = audioContext.createStereoPanner()
        panner.pan.value = Math.min(1, Math.max(-1, pan))
        src.connect(gn).connect(panner).connect(audioContext.destination)
        busRef.current = { src, gain: gn, panner }
        a.muted = false
        a.volume = 1
      } catch {
        a.muted = gain <= 0.0001
        a.volume = Math.min(1, Math.max(0, gain))
      }
    }
    syncMediaPlayback(a, currentTime, clip, isPlaying)
    return () => {
      busRef.current?.src.disconnect()
      busRef.current?.gain.disconnect()
      busRef.current?.panner.disconnect()
      busRef.current = null
    }
  }, [audioContext, clip.id, clip.sourcePath, clip.timelineStart, clip.timelineDuration, clip.sourceStart, clip.sourceEnd])

  useEffect(() => {
    const a = ref.current
    if (!a) return
    if (busRef.current && audioContext) {
      const g = Math.min(8, Math.max(0, gain))
      const gn = busRef.current.gain.gain
      try {
        if (isPlaying) gn.setTargetAtTime(g, audioContext.currentTime, 0.02)
        else {
          gn.cancelScheduledValues(audioContext.currentTime)
          gn.setValueAtTime(g, audioContext.currentTime)
        }
      } catch {
        gn.value = g
      }
      busRef.current.panner.pan.value = Math.min(1, Math.max(-1, pan))
      a.muted = g <= 0.0001
    } else {
      a.muted = gain <= 0.0001
      a.volume = Math.min(1, Math.max(0, gain))
    }
  }, [gain, pan, isPlaying, audioContext])

  useEffect(() => {
    const a = ref.current
    if (!a) return
    syncMediaPlayback(a, currentTime, clip, isPlaying)
  }, [clip, currentTime, isPlaying])

  return <audio ref={ref} className="pointer-events-none h-0 w-0 opacity-0" aria-hidden playsInline />
}

export default function Preview() {
  const current = useProjectStore((s) => s.current)
  const currentTime = useEditorStore((s) => s.currentTime)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lutCanvasRef = useRef<HTMLCanvasElement>(null)
  const lutRendererRef = useRef<PreviewLutRenderer | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const videoSourcePathRef = useRef<string | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [hostW, setHostW] = useState(0)
  const [lutPreviewState, setLutPreviewState] = useState<LutPreviewUiState>('disabled')
  const lutDevWarnOnceRef = useRef(new Set<string>())
  const [imgLutNonce, setImgLutNonce] = useState(0)
  const [lutLayoutNonce, setLutLayoutNonce] = useState(0)

  const projW = current?.resolution.width ?? 1920
  const projH = current?.resolution.height ?? 1080
  const previewMaxW = 640
  const previewBaseScale = Math.min(previewMaxW / projW, 360 / projH, 1)
  const previewIdealW = Math.round(projW * previewBaseScale)
  const outW = hostW > 0 ? Math.max(1, Math.min(previewIdealW, Math.floor(hostW))) : previewIdealW
  const outH = Math.round((outW * projH) / projW)

  const topVisual = current ? topVisualClipAtTime(current, currentTime) : undefined
  const active = topVisual?.clip
  const visualTrack = active && current ? trackContainingClipId(current, active.id) : undefined

  const [previewAudioCtx, setPreviewAudioCtx] = useState<AudioContext | null>(null)

  const activeAudioEntries: { key: string; clip: AudioClip; gain: number; pan: number }[] = []
  if (current) {
    for (const tr of current.tracks) {
      if (tr.type !== 'audio') continue
      for (const c of tr.clips) {
        if (c.type !== 'audio') continue
        if (
          currentTime >= c.timelineStart &&
          currentTime < c.timelineStart + c.timelineDuration
        ) {
          const trimDur = audioClipTrimDurationSec(c)
          const elapsed = currentTime - c.timelineStart
          /** フェード: `audioMix.calculateAudioFadeGain`（線形）— export の `afade` と曲線は非一致可 */
          const fadeGain = calculateAudioFadeGain({
            localTime: elapsed,
            duration: trimDur,
            fadeIn: c.fadeIn,
            fadeOut: c.fadeOut,
          })
          activeAudioEntries.push({
            key: c.id,
            clip: c,
            gain: mixGainForAudioClip(current, c) * fadeGain,
            pan: effectivePanForAudioClip(current, c),
          })
        }
      }
    }
  }

  const telops = useMemo(() => (current ? collectAllTelopClips(current) : []), [current])

  const activeLutPath =
    active && (active.type === 'video' || active.type === 'image')
      ? active.lutPath?.trim() || null
      : null

  const activeSourcePath =
    active && (active.type === 'video' || active.type === 'image') ? active.sourcePath : undefined

  const readCubeLutFile = window.electronAPI?.readCubeLutFile
  const lutLayerMounted = Boolean(activeLutPath && readCubeLutFile)

  /** ルック: CSS 近似（Phase C-1）。LUT 表示中は LUT canvas 側に適用し、ソース video/img は非表示。 */
  const previewLookStyle = useMemo(() => {
    if (!active || (active.type !== 'video' && active.type !== 'image')) return undefined
    const filter = active.filter
    const colorGrade = active.type === 'video' ? active.colorGrade : active.colorGrade ?? DEFAULT_COLOR_GRADE
    const s = buildPreviewLookStyle({ filter, colorGrade })
    return Object.keys(s).length ? s : undefined
  }, [active])

  const lutShowOverlay = lutPreviewShowLutOverlay(lutPreviewState)
  const lookTarget = previewLookStyleTarget(lutPreviewState)
  const previewLookForSource = lookTarget === 'source' ? previewLookStyle : undefined
  const previewLookForLutCanvas = lookTarget === 'lutCanvas' ? previewLookStyle : undefined

  useLayoutEffect(() => {
    if (activeAudioEntries.length === 0 || previewAudioCtx) return
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    setPreviewAudioCtx(new Ctor())
  }, [activeAudioEntries.length, previewAudioCtx])

  useEffect(() => {
    if (!isPlaying || !previewAudioCtx) return
    void previewAudioCtx.resume().catch(() => {})
  }, [isPlaying, previewAudioCtx])

  /** `lutPath` 変更時のみ IPC → parse → `setLut`（`makePreviewLutCacheKeyFromReadResult` で GPU 再 upload 抑制）。 */
  useEffect(() => {
    lutDevWarnOnceRef.current.clear()
    const readLut = window.electronAPI?.readCubeLutFile

    if (!activeLutPath) {
      lutRendererRef.current?.dispose()
      lutRendererRef.current = null
      setLutPreviewState('disabled')
      return
    }

    if (!readLut) {
      lutRendererRef.current?.dispose()
      lutRendererRef.current = null
      setLutPreviewState('disabled')
      try {
        if (import.meta.env.DEV && !lutDevWarnOnceRef.current.has('no-read-api')) {
          lutDevWarnOnceRef.current.add('no-read-api')
          console.warn('[vela-preview-lut] readCubeLutFile unavailable; LUT preview skipped')
        }
      } catch {
        /* noop */
      }
      return
    }

    const canvas = lutCanvasRef.current
    if (!canvas) {
      lutRendererRef.current?.dispose()
      lutRendererRef.current = null
      setLutPreviewState('fallback')
      try {
        if (import.meta.env.DEV && !lutDevWarnOnceRef.current.has('no-lut-canvas')) {
          lutDevWarnOnceRef.current.add('no-lut-canvas')
          console.warn('[vela-preview-lut] LUT canvas ref missing; fallback to source')
        }
      } catch {
        /* noop */
      }
      return
    }

    setLutPreviewState('loading')
    const renderer = createPreviewLutRenderer(canvas)
    if (!renderer) {
      lutRendererRef.current = null
      setLutPreviewState('fallback')
      try {
        if (import.meta.env.DEV && !lutDevWarnOnceRef.current.has('webgl-init')) {
          lutDevWarnOnceRef.current.add('webgl-init')
          console.warn('[vela-preview-lut] WebGL renderer init failed; fallback to source')
        }
      } catch {
        /* noop */
      }
      return
    }
    lutRendererRef.current = renderer

    let cancelled = false
    void (async () => {
      const res = await readLut(activeLutPath)
      if (cancelled) return
      if (!res.ok) {
        renderer.dispose()
        if (lutRendererRef.current === renderer) lutRendererRef.current = null
        setLutPreviewState('fallback')
        try {
          if (import.meta.env.DEV && !lutDevWarnOnceRef.current.has('ipc-fail')) {
            lutDevWarnOnceRef.current.add('ipc-fail')
            console.warn(`[vela-preview-lut] readCubeLutFile failed (${res.reason}); fallback to source`)
          }
        } catch {
          /* noop */
        }
        return
      }
      try {
        const parsed = parseCubeLut(res.text)
        const key = makePreviewLutCacheKeyFromReadResult(activeLutPath, res)
        renderer.setLut(parsed, key)
        if (cancelled) return
        if (!renderer.isReady()) {
          renderer.dispose()
          if (lutRendererRef.current === renderer) lutRendererRef.current = null
          setLutPreviewState('fallback')
          try {
            if (import.meta.env.DEV && !lutDevWarnOnceRef.current.has('not-ready')) {
              lutDevWarnOnceRef.current.add('not-ready')
              console.warn('[vela-preview-lut] renderer not ready after setLut; fallback to source')
            }
          } catch {
            /* noop */
          }
          return
        }
        setLutPreviewState('ready')
      } catch (e) {
        renderer.dispose()
        if (lutRendererRef.current === renderer) lutRendererRef.current = null
        setLutPreviewState('fallback')
        try {
          if (import.meta.env.DEV && !lutDevWarnOnceRef.current.has('parse-fail')) {
            lutDevWarnOnceRef.current.add('parse-fail')
            console.warn('[vela-preview-lut] parseCubeLut failed; fallback to source', e)
          }
        } catch {
          /* noop */
        }
      }
    })()

    return () => {
      cancelled = true
      lutRendererRef.current?.dispose()
      lutRendererRef.current = null
      setLutPreviewState('disabled')
    }
  }, [activeLutPath])

  useLayoutEffect(() => {
    if (!lutLayerMounted || lutPreviewState !== 'ready') return
    const canvas = lutCanvasRef.current
    if (!canvas) return
    const bump = () => setLutLayoutNonce((n) => n + 1)
    const ro = new ResizeObserver(bump)
    ro.observe(canvas)
    window.addEventListener('resize', bump)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', bump)
    }
  }, [lutLayerMounted, lutPreviewState])

  /** 再生中 video のみ継続 rAF（`currentTime` に依存しない）。 */
  useEffect(() => {
    if (lutPreviewState !== 'ready' || !lutRendererRef.current) return
    if (active?.type !== 'video' || !isPlaying) return

    let raf = 0
    let alive = true
    let renderFailLogged = false

    const layout = () => ({
      containerCssWidth: outW,
      containerCssHeight: outH,
      devicePixelRatio: clampPreviewLutDpr(window.devicePixelRatio),
    })

    const renderLut = () => {
      if (!alive) return
      const r = lutRendererRef.current
      if (!r?.isReady()) return
      const el = videoRef.current
      if (!el) return
      const ok = r.render(el, layout())
      if (!ok) {
        const v = el
        if (!v.videoWidth || !v.videoHeight) return
        try {
          if (import.meta.env.DEV && !renderFailLogged) {
            renderFailLogged = true
            console.warn('[vela-preview-lut] render() returned false; fallback to source')
          }
        } catch {
          /* noop */
        }
        setLutPreviewState('fallback')
      }
    }

    const tick = () => {
      if (!alive) return
      renderLut()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [
    lutPreviewState,
    active?.id,
    active?.type,
    activeSourcePath,
    isPlaying,
    outW,
    outH,
    imgLutNonce,
    lutLayoutNonce,
  ])

  /** pause 中の video / 静止画は必要時のみ描画（`currentTime`・レイアウト・clip 変更）。 */
  useEffect(() => {
    if (lutPreviewState !== 'ready' || !lutRendererRef.current) return
    if (!active || (active.type !== 'video' && active.type !== 'image')) return
    if (active.type === 'video' && isPlaying) return

    let renderFailLogged = false
    const r = lutRendererRef.current
    if (!r.isReady()) return
    const el = active.type === 'video' ? videoRef.current : imgRef.current
    if (!el) return
    const ok = r.render(el, {
      containerCssWidth: outW,
      containerCssHeight: outH,
      devicePixelRatio: clampPreviewLutDpr(window.devicePixelRatio),
    })
    if (!ok) {
      if (active.type === 'video') {
        const v = el as HTMLVideoElement
        if (!v.videoWidth || !v.videoHeight) return
      } else {
        const im = el as HTMLImageElement
        if (!im.complete || !im.naturalWidth) return
      }
      try {
        if (import.meta.env.DEV && !renderFailLogged) {
          renderFailLogged = true
          console.warn('[vela-preview-lut] render() returned false; fallback to source')
        }
      } catch {
        /* noop */
      }
      setLutPreviewState('fallback')
    }
  }, [
    lutPreviewState,
    active?.id,
    active?.type,
    activeSourcePath,
    isPlaying,
    currentTime,
    outW,
    outH,
    imgLutNonce,
    lutLayoutNonce,
  ])

  useEffect(() => {
    const v = videoRef.current
    const img = imgRef.current
    if (!active) {
      videoSourcePathRef.current = null
      if (v) {
        v.pause()
        v.removeAttribute('src')
      }
      if (img) img.removeAttribute('src')
      return
    }
    if (active.type === 'video') {
      const want = fileSrc(active.sourcePath)
      if (v) {
        if (videoSourcePathRef.current !== active.sourcePath) {
          videoSourcePathRef.current = active.sourcePath
          v.src = want
        }
        v.volume = active.volume
        if (img) img.removeAttribute('src')
        syncMediaPlayback(v, currentTime, active, isPlaying)
      }
    } else {
      videoSourcePathRef.current = null
      if (v) {
        v.pause()
        v.removeAttribute('src')
      }
      if (img) img.src = fileSrc(active.sourcePath)
    }
  }, [active, currentTime, isPlaying, visualTrack?.muted])

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setHostW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [current?.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = outW
    canvas.height = outH
    renderTelops({
      canvas,
      telops,
      currentTime,
      width: outW,
      height: outH,
    })
  }, [telops, currentTime, outW, outH])

  if (!current) return null

  return (
    <div ref={hostRef} className="flex w-full min-w-0 justify-center">
      <div
        className="relative flex max-w-full items-center justify-center overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--border)', background: 'var(--timeline-bg)', width: outW, height: outH }}
      >
      {active?.type === 'image' ? (
        <img
          ref={imgRef}
          alt=""
          className={`max-h-full max-w-full object-contain ${lutShowOverlay ? 'opacity-0' : ''}`}
          style={previewLookForSource}
          onLoad={() => {
            if (lutLayerMounted) setImgLutNonce((n) => n + 1)
          }}
        />
      ) : (
        <video
          ref={videoRef}
          className={`max-h-full max-w-full object-contain ${lutShowOverlay ? 'opacity-0' : ''}`}
          style={previewLookForSource}
          playsInline
          muted={visualTrack?.muted ?? false}
          onLoadedData={(e) => {
            if (active?.type !== 'video') return
            const st = useEditorStore.getState()
            syncMediaPlayback(e.currentTarget, st.currentTime, active, st.isPlaying)
          }}
        />
      )}
      {lutLayerMounted ? (
        <canvas
          ref={lutCanvasRef}
          className={`pointer-events-none absolute inset-0 z-[1] max-h-full max-w-full object-contain ${
            lutShowOverlay ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={previewLookForLutCanvas}
          aria-hidden
        />
      ) : null}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[2] h-full w-full" />
      {activeAudioEntries.map(({ key, clip, gain, pan }) => (
        <PreviewAudioSync
          key={`${key}:${clip.sourcePath}`}
          clip={clip}
          gain={gain}
          pan={pan}
          audioContext={previewAudioCtx}
          currentTime={currentTime}
          isPlaying={isPlaying}
        />
      ))}
      </div>
    </div>
  )
}

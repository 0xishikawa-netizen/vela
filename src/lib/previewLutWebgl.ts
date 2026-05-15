/**
 * Phase C-2 / C-2f — LUT preview **WebGL**（`Preview.tsx` から利用）。
 *
 * - **2D アトラス**: `previewLutAtlas.ts`。**幅 N² × 高さ N**（WebGL1 は 3D tex 不可）。
 * - **補間**: **trilinear 近似**（8 点＋手動補間）。FFmpeg **`lut3d` tetrahedral** とは一致しない。
 * - **レイアウト**: `previewLutLayout.ts` — **object-contain 表示サイズ × DPR** が canvas backing。ソース解像度は `texImage2D`、アスペクトは表示と一致。
 * - **fallback**: context / shader / link 失敗時は `createPreviewLutRenderer` が **`null`**。`render` は失敗時 **`false`**（レイアウト未確定は **`false`** で待機、`Preview` は fallback しない）。
 */

import type { ParsedCubeLut } from './lutCube'
import {
  previewLutCanvasBackingSize,
  previewLutObjectContainDisplaySize,
  type PreviewLutRenderLayout,
} from './previewLutLayout'
import {
  buildPreviewLutAtlasRgba,
  previewLutAtlasDimensions,
  previewLutShouldSkipAtlasReupload,
} from './previewLutAtlas'

function warnDev(msg: string): void {
  try {
    if (import.meta.env?.DEV) console.warn(`[vela-preview-lut] ${msg}`)
  } catch {
    /* noop */
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, source)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    warnDev(`shader compile: ${gl.getShaderInfoLog(sh) ?? ''}`)
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    warnDev(`program link: ${gl.getProgramInfoLog(prog) ?? ''}`)
    gl.deleteProgram(prog)
    return null
  }
  return prog
}

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

/** アトラス上の格子 (r,g,b) は texel 中心でサンプル（`previewLutAtlas` と整合）。 */
const FRAG = `
precision mediump float;
uniform sampler2D u_source;
uniform sampler2D u_lutAtlas;
uniform float u_hasLut;
uniform float u_lutSize;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;
varying vec2 v_uv;

vec2 lutAtlasUv(float r, float g, float b, float N) {
  float x = (r + N * g + 0.5) / (N * N);
  float y = (b + 0.5) / N;
  return vec2(x, y);
}

vec3 sampleLutBilinearRg(sampler2D lut, float rf, float gf, float bf, float N) {
  float r0 = floor(rf);
  float r1 = min(r0 + 1.0, N - 1.0);
  float g0 = floor(gf);
  float g1 = min(g0 + 1.0, N - 1.0);
  float dr = rf - r0;
  float dg = gf - g0;
  vec3 c00 = texture2D(lut, lutAtlasUv(r0, g0, bf, N)).rgb;
  vec3 c10 = texture2D(lut, lutAtlasUv(r1, g0, bf, N)).rgb;
  vec3 c01 = texture2D(lut, lutAtlasUv(r0, g1, bf, N)).rgb;
  vec3 c11 = texture2D(lut, lutAtlasUv(r1, g1, bf, N)).rgb;
  vec3 c0 = mix(c00, c10, dr);
  vec3 c1 = mix(c01, c11, dr);
  return mix(c0, c1, dg);
}

vec3 applyLutTrilinear(vec3 rgb, sampler2D lut, float N, vec3 dMin, vec3 dMax) {
  vec3 denom = max(dMax - dMin, vec3(1e-5));
  vec3 t = (rgb - dMin) / denom;
  t = clamp(t, 0.0, 1.0);
  vec3 p = t * (N - 1.0);
  float b0 = floor(p.b);
  float b1 = min(b0 + 1.0, N - 1.0);
  float db = p.b - b0;
  vec3 s0 = sampleLutBilinearRg(lut, p.r, p.g, b0, N);
  vec3 s1 = sampleLutBilinearRg(lut, p.r, p.g, b1, N);
  return mix(s0, s1, db);
}

void main() {
  vec4 c = texture2D(u_source, v_uv);
  if (u_hasLut < 0.5) {
    gl_FragColor = c;
    return;
  }
  float N = u_lutSize;
  vec3 outRgb = applyLutTrilinear(c.rgb, u_lutAtlas, N, u_domainMin, u_domainMax);
  gl_FragColor = vec4(outRgb, c.a);
}
`

export type { PreviewLutRenderLayout } from './previewLutLayout'

export interface PreviewLutRenderer {
  isReady(): boolean
  setLut(parsed: ParsedCubeLut | null, cacheKey?: string): void
  render(source: HTMLVideoElement | HTMLImageElement, layout: PreviewLutRenderLayout): boolean
  dispose(): void
}

class PreviewLutRendererImpl implements PreviewLutRenderer {
  private readonly gl: WebGLRenderingContext
  private readonly canvas: HTMLCanvasElement
  private program: WebGLProgram | null
  private buf: WebGLBuffer | null
  private texSource: WebGLTexture | null = null
  private texLut: WebGLTexture | null = null
  private loc: {
    a_pos: number
    a_uv: number
    u_source: WebGLUniformLocation | null
    u_lutAtlas: WebGLUniformLocation | null
    u_hasLut: WebGLUniformLocation | null
    u_lutSize: WebGLUniformLocation | null
    u_domainMin: WebGLUniformLocation | null
    u_domainMax: WebGLUniformLocation | null
  } | null
  private lastLutCacheKey: string | undefined
  private hasLutUniform = 0
  private lutSizeUniform = 0
  private domainMinUniform: [number, number, number] = [0, 0, 0]
  private domainMaxUniform: [number, number, number] = [1, 1, 1]
  private ready = false

  constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, program: WebGLProgram) {
    this.canvas = canvas
    this.gl = gl
    this.program = program

    const a_pos = gl.getAttribLocation(program, 'a_pos')
    const a_uv = gl.getAttribLocation(program, 'a_uv')
    this.loc = {
      a_pos,
      a_uv,
      u_source: gl.getUniformLocation(program, 'u_source'),
      u_lutAtlas: gl.getUniformLocation(program, 'u_lutAtlas'),
      u_hasLut: gl.getUniformLocation(program, 'u_hasLut'),
      u_lutSize: gl.getUniformLocation(program, 'u_lutSize'),
      u_domainMin: gl.getUniformLocation(program, 'u_domainMin'),
      u_domainMax: gl.getUniformLocation(program, 'u_domainMax'),
    }

    const buf = gl.createBuffer()
    this.buf = buf
    if (!buf) {
      gl.deleteProgram(program)
      this.program = null
      this.ready = false
      return
    }

    /** フルスクアッド（CLIP）+ UV（映像上端を v=0 とする） */
    const data = new Float32Array([
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0,
    ])
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)

    this.texSource = gl.createTexture()
    this.texLut = gl.createTexture()
    if (!this.texSource || !this.texLut) {
      this.dispose()
      this.ready = false
      return
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texLut)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.ready = true
  }

  isReady(): boolean {
    return this.ready && !this.gl.isContextLost() && this.program != null && this.loc != null
  }

  setLut(parsed: ParsedCubeLut | null, cacheKey?: string): void {
    const gl = this.gl
    if (!this.texLut || !this.isReady()) return

    if (parsed == null) {
      this.lastLutCacheKey = undefined
      this.hasLutUniform = 0
      this.lutSizeUniform = 0
      this.domainMinUniform = [0, 0, 0]
      this.domainMaxUniform = [1, 1, 1]
      gl.bindTexture(gl.TEXTURE_2D, this.texLut)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
      return
    }

    if (cacheKey != null && previewLutShouldSkipAtlasReupload(this.lastLutCacheKey, cacheKey)) {
      return
    }

    const rgba = buildPreviewLutAtlasRgba(parsed)
    if (!rgba) {
      warnDev('setLut: buildPreviewLutAtlasRgba failed')
      this.setLut(null)
      return
    }
    const dim = previewLutAtlasDimensions(parsed.size)
    if (!dim) {
      this.setLut(null)
      return
    }

    gl.bindTexture(gl.TEXTURE_2D, this.texLut)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dim.width, dim.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.lastLutCacheKey = cacheKey
    this.hasLutUniform = 1
    this.lutSizeUniform = parsed.size
    this.domainMinUniform = [parsed.domainMin[0]!, parsed.domainMin[1]!, parsed.domainMin[2]!]
    this.domainMaxUniform = [parsed.domainMax[0]!, parsed.domainMax[1]!, parsed.domainMax[2]!]
  }

  render(source: HTMLVideoElement | HTMLImageElement, layout: PreviewLutRenderLayout): boolean {
    const gl = this.gl
    if (!this.isReady() || !this.program || !this.loc || !this.buf || !this.texSource || !this.texLut) {
      return false
    }

    const sw =
      source instanceof HTMLVideoElement ? source.videoWidth : (source as HTMLImageElement).naturalWidth
    const sh =
      source instanceof HTMLVideoElement ? source.videoHeight : (source as HTMLImageElement).naturalHeight
    if (!sw || !sh) return false

    const display = previewLutObjectContainDisplaySize(
      layout.containerCssWidth,
      layout.containerCssHeight,
      sw,
      sh,
    )
    if (!display) return false

    const backing = previewLutCanvasBackingSize(
      display.displayCssW,
      display.displayCssH,
      layout.devicePixelRatio,
    )
    if (!backing) return false

    if (this.canvas.width !== backing.width || this.canvas.height !== backing.height) {
      this.canvas.width = backing.width
      this.canvas.height = backing.height
    }

    gl.viewport(0, 0, backing.width, backing.height)
    gl.useProgram(this.program)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texSource)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
    } catch {
      return false
    }

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texLut)

    if (this.loc.u_source) gl.uniform1i(this.loc.u_source, 0)
    if (this.loc.u_lutAtlas) gl.uniform1i(this.loc.u_lutAtlas, 1)
    if (this.loc.u_hasLut) gl.uniform1f(this.loc.u_hasLut, this.hasLutUniform)
    if (this.loc.u_lutSize) gl.uniform1f(this.loc.u_lutSize, this.lutSizeUniform)
    if (this.loc.u_domainMin)
      gl.uniform3f(
        this.loc.u_domainMin,
        this.domainMinUniform[0]!,
        this.domainMinUniform[1]!,
        this.domainMinUniform[2]!,
      )
    if (this.loc.u_domainMax)
      gl.uniform3f(
        this.loc.u_domainMax,
        this.domainMaxUniform[0]!,
        this.domainMaxUniform[1]!,
        this.domainMaxUniform[2]!,
      )

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    const stride = 16
    gl.enableVertexAttribArray(this.loc.a_pos)
    gl.vertexAttribPointer(this.loc.a_pos, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.loc.a_uv)
    gl.vertexAttribPointer(this.loc.a_uv, 2, gl.FLOAT, false, stride, 8)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disableVertexAttribArray(this.loc.a_pos)
    gl.disableVertexAttribArray(this.loc.a_uv)

    return true
  }

  dispose(): void {
    const gl = this.gl
    if (this.buf) {
      gl.deleteBuffer(this.buf)
      this.buf = null
    }
    if (this.texSource) {
      gl.deleteTexture(this.texSource)
      this.texSource = null
    }
    if (this.texLut) {
      gl.deleteTexture(this.texLut)
      this.texLut = null
    }
    if (this.program) {
      gl.deleteProgram(this.program)
      this.program = null
    }
    this.loc = null
    this.ready = false
    this.lastLutCacheKey = undefined
  }
}

export function createPreviewLutRenderer(canvas: HTMLCanvasElement): PreviewLutRenderer | null {
  const glMaybe =
    canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    }) ||
    canvas.getContext('experimental-webgl', {
      alpha: true,
      premultipliedAlpha: false,
    } as WebGLContextAttributes)

  if (!glMaybe) {
    warnDev('WebGL context unavailable')
    return null
  }
  const gl = glMaybe as WebGLRenderingContext

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null

  const program = linkProgram(gl, vs, fs)
  if (!program) return null

  const impl = new PreviewLutRendererImpl(canvas, gl, program)
  if (!impl.isReady()) {
    impl.dispose()
    return null
  }
  return impl
}

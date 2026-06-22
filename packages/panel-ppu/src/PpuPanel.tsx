import { useEffect, useRef, useState } from 'react'
import type { PanelContext } from '@ports'
import { hex } from '@core/hex'
import './PpuPanel.css'

// PPU viewer. Reads the machine's 'ppu' + 'oam' memory spaces (declared in
// MachinePlugin.memorySpaces, served by the backend's readMem) and renders the
// palette + both pattern tables. Machine-neutral mechanism, NES-specific
// decode: 2bpp tiles + the 2C02 master palette live here, not in the core.

/** Live-refresh cadence while running (events drive step/pause refreshes). */
const PPU_REFRESH_MS = 250

// Standard NTSC 2C02 master palette (64 entries, 0xRRGGBB). Index 0x0D ("blacker
// than black") folded to black. A viewer doesn't need emphasis bits.
const NES_PALETTE: readonly number[] = [
  0x626262, 0x002e98, 0x0c11c2, 0x3b00c2, 0x650098, 0x7d0037, 0x7d0c00, 0x652f00,
  0x3b4e00, 0x0c6300, 0x006a00, 0x006337, 0x004e98, 0x000000, 0x000000, 0x000000,
  0xababab, 0x0064f4, 0x353cff, 0x761bff, 0xae0af4, 0xcf0c8f, 0xcf2b1d, 0xae5400,
  0x768100, 0x35a200, 0x00ad00, 0x00a374, 0x008abc, 0x000000, 0x000000, 0x000000,
  0xffffff, 0x4ab5ff, 0x858cff, 0xc86aff, 0xff58ff, 0xff5be2, 0xff726a, 0xff9b00,
  0xc8c800, 0x85ed00, 0x4af82d, 0x14f891, 0x00e8d9, 0x4e4e4e, 0x000000, 0x000000,
  0xffffff, 0xb6e1ff, 0xceceff, 0xe6bfff, 0xffb8ff, 0xffb8e8, 0xffc9c1, 0xffd9a8,
  0xe6e09a, 0xcee69a, 0xb6eba8, 0xa8ebc9, 0xa8e1e6, 0xb6b6b6, 0x000000, 0x000000,
]

const PT_W = 256 // two 128×128 pattern tables side by side
const PT_H = 128
const GRAY = [0x1f, 0x6b, 0xb0, 0xf4] // 2bpp value → grayscale shade

function drawPatternTables(canvas: HTMLCanvasElement | null, chr: Uint8Array): void {
  if (!canvas) return
  const cctx = canvas.getContext('2d')
  if (!cctx) return
  const img = cctx.createImageData(PT_W, PT_H)
  const px = img.data
  for (let table = 0; table < 2; table++) {
    for (let tile = 0; tile < 256; tile++) {
      const base = table * 0x1000 + tile * 16
      const tileCol = tile & 15
      const tileRow = tile >> 4
      for (let y = 0; y < 8; y++) {
        const p0 = chr[base + y] ?? 0
        const p1 = chr[base + y + 8] ?? 0
        for (let x = 0; x < 8; x++) {
          const bit = 7 - x
          const v = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
          const shade = GRAY[v]!
          const cx = table * 128 + tileCol * 8 + x
          const cy = tileRow * 8 + y
          const o = (cy * PT_W + cx) * 4
          px[o] = shade
          px[o + 1] = shade
          px[o + 2] = shade
          px[o + 3] = 0xff
        }
      }
    }
  }
  cctx.putImageData(img, 0, 0)
}

export function PpuPanel({ ctx }: { ctx: PanelContext }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [palette, setPalette] = useState<Uint8Array | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target()) return
      try {
        const [pal, chr] = await Promise.all([
          ctx.debug.readMemory(0x3f00, 32, 'ppu'),
          ctx.debug.readMemory(0x0000, 0x2000, 'ppu'),
        ])
        if (cancelled) return
        setPalette(pal)
        drawPatternTables(canvasRef.current, chr)
      } catch {
        // Backend not booted / wrong machine — re-fired on next event/tick.
      }
    }
    void refresh()
    // Event refresh for snappy step/pause updates; a slow interval keeps the
    // view live while the program is running (it may write VRAM mid-frame).
    const offs = [
      ctx.events.on('debug:step-done', () => void refresh()),
      ctx.events.on('debug:bp-hit', () => void refresh()),
      ctx.events.on('run:state', (p) => {
        if (p.status === 'paused' || p.status === 'loaded') void refresh()
      }),
    ]
    // Poll while running (events cover step/pause); 250ms ≈ 4 Hz keeps the
    // VRAM/pattern view live without dominating the frame loop.
    const timer = setInterval(() => void refresh(), PPU_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      for (const off of offs) off()
    }
  }, [ctx.debug, ctx.events])

  return (
    <div className="debug__panel">
      <div className="debug__title label">Pattern tables</div>
      <canvas
        ref={canvasRef}
        width={PT_W}
        height={PT_H}
        className="ppu__pattern"
        style={{ width: PT_W * 2, height: PT_H * 2, imageRendering: 'pixelated' }}
      />
      <div className="debug__title label">Palette</div>
      <div className="ppu__palette" style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 1 }}>
        {Array.from({ length: 32 }, (_, i) => {
          const idx = (palette?.[i] ?? 0) & 0x3f
          const rgb = NES_PALETTE[idx]!
          const css = '#' + rgb.toString(16).padStart(6, '0')
          return (
            <div
              key={i}
              title={`$${hex(0x3f00 + i, 4)} = $${hex(idx, 2)}`}
              style={{ background: css, aspectRatio: '1', borderTop: i === 16 ? '2px solid var(--border-muted)' : undefined }}
            />
          )
        })}
      </div>
    </div>
  )
}

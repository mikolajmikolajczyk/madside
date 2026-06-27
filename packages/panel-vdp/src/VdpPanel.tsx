import { useEffect, useRef, useState } from 'react'
import type { PanelContext } from '@ports'
import { hex } from '@core/hex'
import './VdpPanel.css'

// Genesis VDP viewer. Reads the VDP-internal 'cram' (palette) + 'vram' (tiles)
// memory spaces (declared in machine-genesis.memorySpaces, served by the gpgx
// backend's readMem, #146) and renders the 4 palette lines + the full 64 KB of
// VRAM decoded as 8x8 4bpp tiles. Machine-neutral mechanism, Genesis-specific
// decode (9-bit BGR colour + planar-free 4bpp tiles) lives here, not in the core.

/** Live-refresh cadence while running (events drive step/pause refreshes). */
const VDP_REFRESH_MS = 250

// Genesis VDP 3-bit colour component → 8-bit, the "normal" levels Genesis Plus GX
// uses (non-linear, matches real hardware output better than v/7*255).
const LEVELS = [0, 52, 87, 116, 144, 172, 206, 255]

/** Decode one CRAM word to 0xRRGGBB. The gpgx core stores CRAM packed to 9 bits
 *  as `BBBGGGRRR` (it repacks the raw bus `BBB0GGG0RRR0` on write), and the
 *  backend's readMem('cram') hands those packed words back big-endian (#146). */
function cramToRgb(word: number): number {
  const r = LEVELS[word & 7]!
  const g = LEVELS[(word >> 3) & 7]!
  const b = LEVELS[(word >> 6) & 7]!
  return (r << 16) | (g << 8) | b
}

const TILES = 2048 // 64 KB VRAM / 32 bytes per tile
const COLS = 32 // tiles per row → 256px wide
const ROWS = TILES / COLS // 64 rows → 512px tall
const TW = COLS * 8 // 256
const TH = ROWS * 8 // 512

/** Render all of VRAM as a grid of 8x8 4bpp tiles, coloured by one palette line. */
function drawTiles(canvas: HTMLCanvasElement | null, vram: Uint8Array, line: number[]): void {
  if (!canvas) return
  const cctx = canvas.getContext('2d')
  if (!cctx) return
  const img = cctx.createImageData(TW, TH)
  const px = img.data
  for (let tile = 0; tile < TILES; tile++) {
    const base = tile * 32
    const tileCol = tile % COLS
    const tileRow = (tile / COLS) | 0
    for (let y = 0; y < 8; y++) {
      const rowBase = base + y * 4
      for (let x = 0; x < 8; x++) {
        const byte = vram[rowBase + (x >> 1)] ?? 0
        const v = (x & 1) === 0 ? byte >> 4 : byte & 0x0f
        const rgb = line[v]!
        const cx = tileCol * 8 + x
        const cy = tileRow * 8 + y
        const o = (cy * TW + cx) * 4
        px[o] = (rgb >> 16) & 0xff
        px[o + 1] = (rgb >> 8) & 0xff
        px[o + 2] = rgb & 0xff
        px[o + 3] = 0xff
      }
    }
  }
  cctx.putImageData(img, 0, 0)
}

const SCR_W = 320 // H40 max width; H32 (256) clips on the right
const SCR_H = 224 // NTSC visible height

/** Render the sprite layer: walk the sprite attribute table (in VRAM, base from
 *  VDP reg[5]) and blit each sprite's tiles at its on-screen position, coloured
 *  by its own palette line, honouring H/V flip. Returns the sprite count. */
function drawSprites(canvas: HTMLCanvasElement | null, vram: Uint8Array, palette: number[], regs: Uint8Array): number {
  if (!canvas) return 0
  const cctx = canvas.getContext('2d')
  if (!cctx) return 0
  const img = cctx.createImageData(SCR_W, SCR_H)
  const px = img.data
  const h40 = (regs[12]! & 1) !== 0
  const satb = ((regs[5]! << 9) & (h40 ? 0xfc00 : 0xfe00)) & 0xffff
  const maxSprites = h40 ? 80 : 64

  const plot = (x: number, y: number, rgb: number) => {
    if (x < 0 || x >= SCR_W || y < 0 || y >= SCR_H) return
    const o = (y * SCR_W + x) * 4
    px[o] = (rgb >> 16) & 0xff
    px[o + 1] = (rgb >> 8) & 0xff
    px[o + 2] = rgb & 0xff
    px[o + 3] = 0xff
  }

  let idx = 0
  let count = 0
  const seen = new Set<number>()
  while (count < maxSprites && !seen.has(idx)) {
    seen.add(idx)
    const o = (satb + idx * 8) & 0xffff
    const yPos = (((vram[o]! << 8) | vram[o + 1]!) & 0x3ff) - 128
    const sizeByte = vram[o + 2]!
    const hTiles = ((sizeByte >> 2) & 3) + 1
    const vTiles = (sizeByte & 3) + 1
    const link = vram[o + 3]! & 0x7f
    const attr = (vram[o + 4]! << 8) | vram[o + 5]!
    const palLineOf = (attr >> 13) & 3
    const vflip = (attr >> 12) & 1
    const hflip = (attr >> 11) & 1
    const baseTile = attr & 0x7ff
    const xPos = (((vram[o + 6]! << 8) | vram[o + 7]!) & 0x1ff) - 128

    const w = hTiles * 8
    const h = vTiles * 8
    for (let oy = 0; oy < h; oy++) {
      for (let ox = 0; ox < w; ox++) {
        const sx = hflip ? w - 1 - ox : ox
        const sy = vflip ? h - 1 - oy : oy
        // Genesis sprite tiles increment vertically first, then horizontally.
        const tile = (baseTile + (sx >> 3) * vTiles + (sy >> 3)) & 0x7ff
        const byte = vram[tile * 32 + (sy & 7) * 4 + ((sx & 7) >> 1)] ?? 0
        const v = (sx & 1) === 0 ? byte >> 4 : byte & 0x0f
        if (v === 0) continue // colour 0 is transparent
        plot(xPos + ox, yPos + oy, palette[palLineOf * 16 + v]!)
      }
    }
    count++
    if (link === 0) break
    idx = link
  }
  cctx.putImageData(img, 0, 0)
  return count
}

export function VdpPanel({ ctx }: { ctx: PanelContext }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const spritesRef = useRef<HTMLCanvasElement | null>(null)
  const [palette, setPalette] = useState<number[]>(() => new Array(64).fill(0))
  const [palLine, setPalLine] = useState(0)
  const [spriteCount, setSpriteCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      if (!ctx.debug.target()) return
      try {
        const [cram, vram, regs] = await Promise.all([
          ctx.debug.readMemory(0, 0x80, 'cram'),
          ctx.debug.readMemory(0, 0x10000, 'vram'),
          ctx.debug.readMemory(0, 0x20, 'vdp-regs'),
        ])
        if (cancelled) return
        const colors: number[] = []
        for (let i = 0; i < 64; i++) colors.push(cramToRgb((cram[i * 2]! << 8) | cram[i * 2 + 1]!))
        setPalette(colors)
        const base = palLine * 16
        drawTiles(canvasRef.current, vram, colors.slice(base, base + 16))
        setSpriteCount(drawSprites(spritesRef.current, vram, colors, regs))
      } catch {
        // Backend not booted / wrong machine — re-fired on next event/tick.
      }
    }
    void refresh()
    const offs = [
      ctx.events.on('debug:step-done', () => void refresh()),
      ctx.events.on('debug:bp-hit', () => void refresh()),
      ctx.events.on('run:state', (p) => {
        if (p.status === 'paused' || p.status === 'loaded') void refresh()
      }),
    ]
    // Poll while running (events cover step/pause); 250ms ≈ 4 Hz keeps the
    // VRAM/palette view live without dominating the frame loop.
    const timer = setInterval(() => void refresh(), VDP_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      for (const off of offs) off()
    }
  }, [ctx.debug, ctx.events, palLine])

  return (
    <div className="debug__panel">
      <div className="debug__title label">Palette (CRAM)</div>
      <div className="vdp__palette">
        {palette.map((rgb, i) => {
          const css = '#' + rgb.toString(16).padStart(6, '0')
          const line = (i / 16) | 0
          return (
            <div
              key={i}
              title={`line ${line}, idx ${i % 16} — $${hex(i * 2, 2)} = #${rgb.toString(16).padStart(6, '0')}`}
              className={'vdp__swatch' + (line === palLine ? ' vdp__swatch--active-line' : '')}
              style={{ background: css }}
              onClick={() => setPalLine(line)}
            />
          )
        })}
      </div>
      <div className="debug__title label">
        Tiles (VRAM)
        <span className="vdp__lines">
          {[0, 1, 2, 3].map((l) => (
            <button
              key={l}
              type="button"
              className={'vdp__linebtn' + (l === palLine ? ' vdp__linebtn--active' : '')}
              onClick={() => setPalLine(l)}
            >
              {l}
            </button>
          ))}
        </span>
      </div>
      <div className="vdp__tilewrap">
        <canvas
          ref={canvasRef}
          width={TW}
          height={TH}
          className="vdp__tiles"
          style={{ width: TW, height: TH, imageRendering: 'pixelated' }}
        />
      </div>
      <div className="debug__title label">
        Sprites
        <span className="vdp__count">{spriteCount}</span>
      </div>
      <div className="vdp__spritewrap">
        <canvas
          ref={spritesRef}
          width={SCR_W}
          height={SCR_H}
          className="vdp__sprites"
          style={{ width: SCR_W, height: SCR_H, imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  )
}

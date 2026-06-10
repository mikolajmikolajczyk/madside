// Reference editor: 1bpp bitmap painter. 8 bytes per row, MSB = leftmost pixel.
// Width = 64 px (8 bytes), height = file size / 8 rows. Click / drag to toggle.
// Trivial enough to keep, useful enough to exercise the contract.

import type { EditorModule } from "../types";

const WIDTH_BYTES = 8;
const PIXEL = 12;

const bitmap: EditorModule = {
  meta: {
    id: "bitmap",
    label: "1bpp Bitmap",
    fileExt: ["1bpp", "bmp1"],
  },
  mount(container, ctx) {
    container.innerHTML = "";
    container.style.padding = "12px";
    container.style.color = "var(--text-primary)";
    container.style.fontFamily = "var(--font-mono)";
    container.style.fontSize = "12px";

    let bytes = new Uint8Array(ctx.value.length || WIDTH_BYTES * 16);
    bytes.set(ctx.value.subarray(0, bytes.length));
    const rows = bytes.length / WIDTH_BYTES;

    const info = document.createElement("div");
    info.textContent = `1bpp · ${WIDTH_BYTES * 8}×${rows} · ${ctx.path}`;
    info.style.marginBottom = "8px";
    info.style.color = "var(--text-quaternary)";
    container.appendChild(info);

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH_BYTES * 8 * PIXEL;
    canvas.height = rows * PIXEL;
    canvas.style.background = "var(--bg-primary)";
    canvas.style.border = "1px solid var(--border-default)";
    canvas.style.imageRendering = "pixelated";
    canvas.style.cursor = "crosshair";
    container.appendChild(canvas);
    const ctx2d = canvas.getContext("2d")!;

    const draw = () => {
      ctx2d.fillStyle = "#0e1116";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      ctx2d.fillStyle = "#a7e8cd";
      for (let y = 0; y < rows; y++) {
        for (let bx = 0; bx < WIDTH_BYTES; bx++) {
          const b = bytes[y * WIDTH_BYTES + bx];
          for (let bit = 0; bit < 8; bit++) {
            if (b & (0x80 >> bit)) {
              ctx2d.fillRect((bx * 8 + bit) * PIXEL, y * PIXEL, PIXEL - 1, PIXEL - 1);
            }
          }
        }
      }
    };

    let painting = false;
    let paintTo = 0;
    const togglePixel = (px: number, py: number) => {
      if (px < 0 || py < 0 || py >= rows) return;
      const bx = (px >>> 3);
      if (bx >= WIDTH_BYTES) return;
      const bit = 0x80 >> (px & 7);
      const idx = py * WIDTH_BYTES + bx;
      if (paintTo === 1) bytes[idx] |= bit; else bytes[idx] &= ~bit;
      draw();
      ctx.onChange(new Uint8Array(bytes));
    };
    const pickPixel = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = Math.floor((e.clientX - rect.left) / PIXEL);
      const py = Math.floor((e.clientY - rect.top) / PIXEL);
      return { px, py };
    };
    const onDown = (e: MouseEvent) => {
      const { px, py } = pickPixel(e);
      if (px < 0 || py < 0 || py >= rows || px >= WIDTH_BYTES * 8) return;
      const bx = (px >>> 3);
      const bit = 0x80 >> (px & 7);
      paintTo = bytes[py * WIDTH_BYTES + bx] & bit ? 0 : 1;
      painting = true;
      togglePixel(px, py);
    };
    const onMove = (e: MouseEvent) => {
      if (!painting) return;
      const { px, py } = pickPixel(e);
      togglePixel(px, py);
    };
    const onUp = () => { painting = false; };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    draw();

    return {
      destroy() {
        canvas.removeEventListener("mousedown", onDown);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        container.innerHTML = "";
      },
      onValueChange(next) {
        bytes = new Uint8Array(next.length || WIDTH_BYTES * 16);
        bytes.set(next.subarray(0, bytes.length));
        draw();
      },
    };
  },
};

export default bitmap;

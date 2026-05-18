/**
 * Umple benzile safe zone cu fundal sintetic extrapolat din marginile interioare
 * (fără AI) — acoperă conținut plasat greșit în safe zone.
 */

function samplePixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): [number, number, number] {
  const d = ctx.getImageData(
    Math.min(Math.max(0, x), ctx.canvas.width - 1),
    Math.min(Math.max(0, y), ctx.canvas.height - 1),
    1,
    1,
  ).data;
  return [d[0]!, d[1]!, d[2]!];
}

function fillRectRgb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number],
) {
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  ctx.fillRect(x, y, w, h);
}

/**
 * Extrapolează culoarea/texture din rândul/coloana de la limita interioară a safe zone
 * în benzile exterioare (sus, jos, stânga, dreapta + colțuri).
 */
export function fillSafeZoneMarginsOnCanvas(
  canvas: HTMLCanvasElement,
  safePx: number,
): void {
  if (safePx <= 0) return;
  const w = canvas.width;
  const h = canvas.height;
  if (safePx * 2 >= w || safePx * 2 >= h) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const innerTop = safePx;
  const innerBottom = h - safePx - 1;
  const innerLeft = safePx;
  const innerRight = w - safePx - 1;
  const midH = h - 2 * safePx;
  const midW = w - 2 * safePx;

  if (midH > 0) {
    ctx.drawImage(canvas, 0, innerTop, w, 1, 0, 0, w, safePx);
    ctx.drawImage(canvas, 0, innerBottom, w, 1, 0, h - safePx, w, safePx);
  }
  if (midW > 0) {
    ctx.drawImage(canvas, innerLeft, safePx, 1, midH, 0, safePx, safePx, midH);
    ctx.drawImage(canvas, innerRight, safePx, 1, midH, w - safePx, safePx, safePx, midH);
  }

  const corners: Array<{
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    sx: number;
    sy: number;
  }> = [
    { dx: 0, dy: 0, dw: safePx, dh: safePx, sx: innerLeft, sy: innerTop },
    { dx: w - safePx, dy: 0, dw: safePx, dh: safePx, sx: innerRight, sy: innerTop },
    { dx: 0, dy: h - safePx, dw: safePx, dh: safePx, sx: innerLeft, sy: innerBottom },
    { dx: w - safePx, dy: h - safePx, dw: safePx, dh: safePx, sx: innerRight, sy: innerBottom },
  ];
  for (const c of corners) {
    fillRectRgb(ctx, c.dx, c.dy, c.dw, c.dh, samplePixel(ctx, c.sx, c.sy));
  }
}

/**
 * The scene board stores an image's layout slot, but object-contain paints
 * the bitmap in a possibly much smaller rectangle within that slot.  A PNG
 * may also have transparent margins. This module operates in unzoomed board
 * coordinates and never mutates source images or saved geometry on display.
 */
import type { SceneBoardElement } from '@/types/sceneBoard';
import type { CanvasArtMetrics } from './canvasSpeechAnchor';

export interface CanvasVisualRect { left: number; top: number; width: number; height: number }

type Edges = { left: number; right: number; top: number; bottom: number };
function edges(metrics: CanvasArtMetrics): Edges {
  const left = Math.max(0, Math.min(1, metrics.visibleLeft));
  const right = Math.max(left + 0.005, Math.min(1, metrics.visibleRight));
  const top = Math.max(0, Math.min(1, metrics.visibleTop ?? 0));
  const bottom = Math.max(top + 0.005, Math.min(1, metrics.visibleBottom ?? 1));
  return { left, right, top, bottom };
}

function rasterSlot(element: Pick<SceneBoardElement, 'width' | 'height'>, metrics: CanvasArtMetrics) {
  const scale = Math.min(element.width / metrics.naturalWidth, element.height / metrics.naturalHeight);
  const width = metrics.naturalWidth * scale;
  const height = metrics.naturalHeight * scale;
  return { width, height, left: (element.width - width) / 2, top: (element.height - height) / 2 };
}

/** Interactive bounds relative to the image element's normal stored layout slot. */
export function canvasImageVisualRect(element: SceneBoardElement, metrics?: CanvasArtMetrics): CanvasVisualRect {
  if (!metrics || !(metrics.naturalWidth > 0) || !(metrics.naturalHeight > 0) || !(element.width > 0) || !(element.height > 0)) {
    return { left: 0, top: 0, width: element.width, height: element.height };
  }
  const bitmap = rasterSlot(element, metrics);
  const e = edges(metrics);
  return {
    left: bitmap.left + bitmap.width * e.left,
    top: bitmap.top + bitmap.height * e.top,
    width: bitmap.width * (e.right - e.left),
    height: bitmap.height * (e.bottom - e.top),
  };
}

/**
 * Resize from the *visible* lower-right handle, preserving the visual
 * top-left and source aspect ratio. Converts a letterboxed legacy layout slot
 * into a bitmap-sized slot on first actual resize. There is no silent migration
 * or snapping of images merely because they were opened or selected.
 */
export function resizeCanvasImage(
  original: SceneBoardElement,
  metrics: CanvasArtMetrics | undefined,
  dx: number,
  dy: number,
  snapToGrid = false,
): Pick<SceneBoardElement, 'x' | 'y' | 'width' | 'height'> {
  if (!metrics || !(metrics.naturalWidth > 0) || !(metrics.naturalHeight > 0)) {
    return { x: original.x, y: original.y, width: Math.max(30, original.width + dx), height: Math.max(30, original.height + dy) };
  }
  const visible = canvasImageVisualRect(original, metrics);
  const raster = rasterSlot(original, metrics);
  const e = edges(metrics);
  const relativeX = dx / Math.max(1, visible.width);
  const relativeY = dy / Math.max(1, visible.height);
  const intendedScale = Math.abs(relativeX) >= Math.abs(relativeY) ? 1 + relativeX : 1 + relativeY;
  const minScale = Math.max(30 / raster.width, 30 / raster.height);
  let scale = Math.max(minScale, intendedScale);
  if (snapToGrid) {
    const snappedWidth = Math.max(20, Math.round((visible.width * scale) / 20) * 20);
    scale = Math.max(minScale, snappedWidth / Math.max(1, visible.width));
  }
  const bitmapWidth = raster.width * scale;
  const bitmapHeight = raster.height * scale;
  const inkX = original.x + visible.left;
  const inkY = original.y + visible.top;
  return {
    x: inkX - bitmapWidth * e.left,
    y: inkY - bitmapHeight * e.top,
    width: bitmapWidth,
    height: bitmapHeight,
  };
}

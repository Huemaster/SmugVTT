/**
 * Canvas speech anchors are visual, not hit-box centers. `object-contain` means
 * the image may be letterboxed inside its draggable element. Transparent PNGs
 * can also have unbalanced empty padding within their intrinsic bounds.
 */
export interface CanvasArtMetrics {
  naturalWidth: number;
  naturalHeight: number;
  /** Horizontal visible-ink bounds, as fractions of the intrinsic image width. */
  visibleLeft: number;
  visibleRight: number;
}

export function canvasArtSpeechX(
  x: number,
  width: number,
  height: number,
  metrics: CanvasArtMetrics | undefined,
): number {
  if (!metrics || metrics.naturalWidth <= 0 || metrics.naturalHeight <= 0 || width <= 0 || height <= 0) {
    return x + width / 2;
  }
  const fit = Math.min(width / metrics.naturalWidth, height / metrics.naturalHeight);
  const renderedWidth = metrics.naturalWidth * fit;
  const leftInset = (width - renderedWidth) / 2;
  const artCenter = Math.max(0, Math.min(1, (metrics.visibleLeft + metrics.visibleRight) / 2));
  return x + leftInset + renderedWidth * artCenter;
}

/**
 * Measure only a small downsample, avoiding full-resolution alpha buffers.
 * Images that cannot be sampled (CORS, SVG, etc.) retain natural dimensions
 * and use the ordinary `object-contain` center fallback.
 */
export async function measureCanvasArt(url: string): Promise<CanvasArtMetrics | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const absolute = new URL(url, window.location.href);
    if (absolute.origin !== window.location.origin) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (!naturalWidth || !naturalHeight) { resolve(null); return; }
      const fallback: CanvasArtMetrics = { naturalWidth, naturalHeight, visibleLeft: 0, visibleRight: 1 };
      try {
        const ratio = Math.min(1, 384 / Math.max(naturalWidth, naturalHeight));
        const sampleWidth = Math.max(1, Math.round(naturalWidth * ratio));
        const sampleHeight = Math.max(1, Math.round(naturalHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(fallback); return; }
        ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
        const rgba = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        let minX = sampleWidth;
        let maxX = -1;
        for (let py = 0; py < sampleHeight; py++) {
          for (let px = 0; px < sampleWidth; px++) {
            if (rgba[(py * sampleWidth + px) * 4 + 3] <= 28) continue;
            minX = Math.min(minX, px);
            maxX = Math.max(maxX, px);
          }
        }
        if (maxX < minX) { resolve(fallback); return; }
        resolve({ naturalWidth, naturalHeight, visibleLeft: minX / sampleWidth, visibleRight: (maxX + 1) / sampleWidth });
      } catch { resolve(fallback); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

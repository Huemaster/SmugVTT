import { useEffect, useRef, useState } from 'react';

// A 3:4 raster fits the 132 x 176 frame without stretching or cropping faces.
const SOURCE_WIDTH = 96;
const SOURCE_HEIGHT = 128;
const DISPLAY_WIDTH = 96;
const DISPLAY_HEIGHT = 128;
const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/** Presentational only: never modifies or uploads the original Speak As portrait. */
export default function JrpgPortrait({ src, name }: { src: string | null; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filtered, setFiltered] = useState(false);

  useEffect(() => {
    setFiltered(false);
    if (!src) return;

    let active = true;
    const picture = new Image();
    // Same-origin assets work normally. External portraits without CORS fall back
    // to the original <img> instead of disappearing when processing is refused.
    picture.crossOrigin = 'anonymous';
    picture.onload = () => {
      if (!active) return;
      const canvas = canvasRef.current;
      if (!canvas || !picture.naturalWidth || !picture.naturalHeight) return;
      try {
        const lowRes = document.createElement('canvas');
        lowRes.width = SOURCE_WIDTH;
        lowRes.height = SOURCE_HEIGHT;
        const lowCtx = lowRes.getContext('2d', { willReadFrequently: true });
        const targetCtx = canvas.getContext('2d');
        if (!lowCtx || !targetCtx) return;

        // Fit the ENTIRE Speak As image within the square, preserving its
        // aspect ratio. The old center-square crop could cut off hair, faces,
        // or characters positioned away from the image center.
        const fit = Math.min(SOURCE_WIDTH / picture.naturalWidth, SOURCE_HEIGHT / picture.naturalHeight);
        const imageWidth = picture.naturalWidth * fit;
        const imageHeight = picture.naturalHeight * fit;
        const left = (SOURCE_WIDTH - imageWidth) / 2;
        const top = (SOURCE_HEIGHT - imageHeight) / 2;
        lowCtx.clearRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
        lowCtx.imageSmoothingEnabled = true;
        lowCtx.drawImage(picture, left, top, imageWidth, imageHeight);

        // Nearly imperceptible retro texture at full display resolution.
        // Keep face details smooth instead of enlarging low-resolution pixels.
        const frame = lowCtx.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
        for (let y = 0; y < SOURCE_HEIGHT; y++) {
          for (let x = 0; x < SOURCE_WIDTH; x++) {
            const offset = (y * SOURCE_WIDTH + x) * 4;
            if (frame.data[offset + 3] === 0) continue;
            const dither = ((BAYER_4X4[(y % 4) * 4 + (x % 4)] - 7.5) / 7.5) * 0.5;
            for (let channel = 0; channel < 3; channel++) {
              const original = frame.data[offset + channel];
              const rounded = Math.round(Math.max(0, Math.min(255, original + dither)) / 8) * 8;
              frame.data[offset + channel] = Math.max(0, Math.min(255, Math.round(original * 0.92 + rounded * 0.08)));
            }
          }
        }
        lowCtx.putImageData(frame, 0, 0);
        canvas.width = DISPLAY_WIDTH;
        canvas.height = DISPLAY_HEIGHT;
        targetCtx.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
        targetCtx.imageSmoothingEnabled = true;
        targetCtx.drawImage(lowRes, 0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
        if (active) setFiltered(true);
      } catch {
        // SecurityError from a cross-origin portrait, or unsupported canvas:
        // keep the original picture visible rather than breaking dialogue.
        if (active) setFiltered(false);
      }
    };
    picture.onerror = () => { if (active) setFiltered(false); };
    picture.src = src;
    return () => {
      active = false;
      picture.onload = null;
      picture.onerror = null;
    };
  }, [src]);

  return (
    <div
      role="img"
      aria-label={`${name} portrait`}
      className="relative h-44 w-[132px] shrink-0 overflow-hidden border-[3px] border-white bg-[#0c152a] shadow-[0_0_0_2px_#000]"
    >
      {src ? (
        <>
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain"
            style={{ display: filtered ? 'none' : 'block' }}
          />
          <canvas
            ref={canvasRef}
            width={DISPLAY_WIDTH}
            height={DISPLAY_HEIGHT}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-contain"
            style={{ display: filtered ? 'block' : 'none', imageRendering: 'auto' }}
          />
        </>
      ) : (
        <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-mono text-5xl text-white/35">?</span>
      )}
    </div>
  );
}

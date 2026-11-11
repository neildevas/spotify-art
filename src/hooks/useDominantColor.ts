import { useEffect, useState } from 'react';

const cache = new Map<string, string>();

/**
 * Samples an image down to 24×24 and returns a vivid-leaning average colour.
 * Spotify's image CDN sends CORS headers, so the canvas isn't tainted.
 */
export function extractColor(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0, g = 0, b = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          // Weight saturated, mid-bright pixels more so greys/blacks don't wash it out.
          const w = 0.15 + (max - min) / 255 + (max > 40 && max < 235 ? 0.3 : 0);
          r += R * w; g += G * w; b += B * w; total += w;
        }
        const color = `rgb(${Math.round(r / total)}, ${Math.round(g / total)}, ${Math.round(b / total)})`;
        cache.set(url, color);
        resolve(color);
      } catch {
        resolve('rgb(40, 40, 46)');
      }
    };
    img.onerror = () => resolve('rgb(40, 40, 46)');
    img.src = url;
  });
}

export function useDominantColor(url: string | undefined) {
  const [color, setColor] = useState<string | null>(url ? cache.get(url) ?? null : null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    extractColor(url).then((c) => alive && setColor(c));
    return () => {
      alive = false;
    };
  }, [url]);
  return color;
}

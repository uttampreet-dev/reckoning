// Reads the text in screenshots, inside this browser tab. The pictures are never uploaded: the reader and its
// language file are served by this site (public/ocr) and run in a worker on the device.
type Progress = (done: number, total: number, share: number) => void;

/**
 * Makes the picture easy to read: emoji are painted out (their warm colours otherwise come back as stray letters
 * stuck to the next word), dark chat themes are flipped to dark-on-light, small pictures are enlarged, and the
 * faint pattern behind the bubbles is washed out.
 */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 900 ? Math.min(3, 1400 / bitmap.width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const warm = new Uint8Array(px.length / 4);
  let sum = 0;
  let n = 0;
  for (let i = 0, k = 0; i < px.length; i += 4, k++) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // red, orange and yellow, strongly coloured: fire, rockets' flames, faces. Links and names are blue and stay.
    if (max > 90 && max - min > 0.5 * max && r === max && b <= g + 40) warm[k] = 1;
    else {
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
    }
  }
  const dark = sum / Math.max(1, n) < 110;
  const paper = dark ? 25 : 240;
  for (let i = 0, k = 0; i < px.length; i += 4, k++) {
    let v = warm[k] ? paper : 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (dark) v = 255 - v;
    v = (v - 128) * CONTRAST + 128;
    px[i] = px[i + 1] = px[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
const CONTRAST = 1.6;

export async function readScreenshots(files: File[], onProgress: Progress): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  let at = 0;
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress(at, files.length, m.progress);
    },
  });
  try {
    const texts: string[] = [];
    for (const file of files) {
      onProgress(at, files.length, 0);
      const { data } = await worker.recognize(await prepare(file));
      texts.push(data.text.trim());
      at += 1;
    }
    return texts.filter(Boolean).join("\n\n");
  } finally {
    await worker.terminate();
  }
}

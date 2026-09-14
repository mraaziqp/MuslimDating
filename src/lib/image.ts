import type { PhotoUploadInput } from "./contracts";

const MAX_DIMENSION = 900;
const BLUR_DIMENSION = 24;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

function renderJpeg(img: HTMLImageElement, maxDimension: number, quality: number): string {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot process images.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  // Re-encoding strips EXIF metadata such as GPS location.
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Resizes, strips metadata, and produces the tiny blur thumbnail used before consent. */
export async function prepareProfilePhoto(file: File): Promise<PhotoUploadInput> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Please choose an image smaller than 15 MB.");
  const img = await loadImage(file);
  return {
    mimeType: "image/jpeg",
    fullData: renderJpeg(img, MAX_DIMENSION, 0.82),
    blurData: renderJpeg(img, BLUR_DIMENSION, 0.6),
  };
}

import type { AttachmentPreview } from "../workspace/document";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png"]);

export function fileExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function labelExt(ext: string) {
  if (ext === "jpeg") return "jpg";
  return ext || "file";
}

/** Type icon until an image thumbnail replaces it. */
export function filePreview(file: File): AttachmentPreview {
  return { kind: "file", ext: labelExt(fileExtension(file.name)) };
}

function isImageFile(file: File) {
  const ext = fileExtension(file.name);
  const type = (file.type || "").toLowerCase();
  return IMAGE_EXT.has(ext) || type === "image/jpeg" || type === "image/png";
}

/** JPEG the chat can keep and open larger. The bubble still shows it at thumbnail size. */
export function imageThumbnail(file: File): Promise<string | null> {
  if (!isImageFile(file)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const finish = (src: string | null) => {
      URL.revokeObjectURL(url);
      resolve(src);
    };
    img.onload = () => {
      const max = 720;
      const longest = Math.max(img.width, img.height) || 1;
      const scale = Math.min(1, max / longest);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        finish(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      finish(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

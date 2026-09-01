// Client-side PDF upload straight to Cloudinary via an unsigned upload
// preset — no backend proxy needed for the upload itself (Cloudinary's
// account API secret never touches the browser). The preset restricts
// what an unsigned upload is allowed to do; see .env.example for setup.
//
// Cloudinary natively renders a specific page of an uploaded PDF as an
// image via a URL transformation (`pg_<n>`), so no PDF-rendering library
// is needed on Homeroom's side at all — see PROJECT_NOTES.md / the
// open-platform plan doc for the full reasoning.

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function cloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

// Cloudinary answers 429 "Slow Down, Out of Processing Capacity" when its
// processing queue is saturated -- a transient condition on the free tier,
// not a quota a teacher has permanently used up. One try was enough to
// fail an upload outright and show the teacher raw JSON, so we back off
// and try again before giving up.
const UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_MS = 1200;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 429 and 5xx are worth retrying; a 4xx like "file too large" or "preset
// not found" will fail identically forever, so retrying it only makes a
// teacher wait longer for the same error.
const isRetryable = status => status === 429 || (status >= 500 && status < 600);

/**
 * Uploads a PDF File to Cloudinary and returns both the PDF's own URL and
 * a thumbnail URL for its first page.
 * @param {File} file
 * @returns {Promise<{ publicId: string, pdfUrl: string, thumbUrl: string }>}
 */
export async function uploadAssignmentPdf(file) {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary isn't configured — set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET (see .env.example)."
    );
  }

  // PDFs upload as Cloudinary "image" resources (that's what makes the
  // pg_<n> page-render transformation available on them).
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  let response;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    // Rebuilt per attempt: a FormData carrying a File is consumed by the
    // request that sends it, so reusing one across retries uploads an
    // empty body the second time.
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    response = await fetch(endpoint, { method: "POST", body: formData });
    if (response.ok) break;

    if (attempt < UPLOAD_ATTEMPTS && isRetryable(response.status)) {
      // Honour Retry-After when Cloudinary sends one, otherwise back off
      // 1.2s, 2.4s.
      const after = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(after) && after > 0
        ? Math.min(after * 1000, 10000)
        : RETRY_BASE_MS * attempt;
      await sleep(waitMs);
      continue;
    }
    break;
  }

  if (!response.ok) {
    // The teacher gets a sentence they can act on; the raw body goes to
    // the console. It used to be spliced straight into the on-screen
    // message, so a busy Cloudinary showed a wall of JSON on the board.
    const detail = await response.text().catch(() => "");
    console.error("[cloudinary] upload failed", response.status, detail);
    if (response.status === 429) {
      throw new Error("Cloudinary is busy right now — wait a moment and try the upload again.");
    }
    throw new Error(`Couldn't upload that file (error ${response.status}). Try again, or pick it from Google Drive instead.`);
  }
  const data = await response.json();

  return {
    publicId: data.public_id,
    pdfUrl: data.secure_url,
    thumbUrl: firstPageThumbUrl(data.public_id),
  };
}

/**
 * Builds a URL for a downscaled JPG of a PDF's first page, matching the
 * ~8.5:11 aspect ratio AssignmentThumb renders assignment cards at.
 * Cloudinary generates this derived image on first request and caches it.
 */
export function firstPageThumbUrl(publicId, { width = 400 } = {}) {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/pg_1,f_jpg,w_${width},c_fill/${publicId}.jpg`;
}

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

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  // PDFs upload as Cloudinary "image" resources (that's what makes the
  // pg_<n> page-render transformation available on them).
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  const response = await fetch(endpoint, { method: "POST", body: formData });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${response.status}): ${detail}`);
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

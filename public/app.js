// ---- Config ----------------------------------------------------------
const FACE_MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const DETECTION_MAX_DIM = 640; // downscale for fast client-side detection; fractions stay resolution-independent
const API_BASE = ""; // same-origin (server also serves this static site)

// ---- DOM refs ----------------------------------------------------------
const photoInput = document.getElementById("photoInput");
const previewWrap = document.getElementById("previewWrap");
const previewCanvas = document.getElementById("previewCanvas");
const detectionStatus = document.getElementById("detectionStatus");
const nameInput = document.getElementById("nameInput");
const roleInput = document.getElementById("roleInput");
const generateBtn = document.getElementById("generateBtn");
const formError = document.getElementById("formError");
const formSection = document.getElementById("formSection");
const resultSection = document.getElementById("resultSection");
const resultImage = document.getElementById("resultImage");
const downloadBtn = document.getElementById("downloadBtn");
const shareBtn = document.getElementById("shareBtn");
const startOverBtn = document.getElementById("startOverBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

// ---- State ---------------------------------------------------------------
let uploadBlob = null; // the actual file/blob we send to the backend (HEIC already converted to JPEG if needed)
let uploadFilename = "photo.jpg";
let faceBoxFraction = null; // { x, y, width, height } as 0..1 fractions, or null if detection failed
let lastGeneratedResult = null; // { imageUrl, downloadUrl, sharePageUrl, shareIntentUrl }

// ---- Model loading (kicks off immediately, awaited later) ---------------
const modelsReadyPromise = (async () => {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
    return true;
  } catch (err) {
    console.error("Failed to load face detection model:", err);
    return false; // detection will be skipped, fallback crop used server-side
  }
})();

// ---- Helpers ---------------------------------------------------------------
function showError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}
function clearError() {
  formError.hidden = true;
  formError.textContent = "";
}
function setLoading(isLoading, text) {
  loadingOverlay.hidden = !isLoading;
  if (text) loadingText.textContent = text;
}
function updateGenerateEnabled() {
  generateBtn.disabled = !(
    uploadBlob &&
    nameInput.value.trim() &&
    roleInput.value.trim()
  );
}

async function isHeicFile(file) {
  try {
    if (window.HeicTo && typeof HeicTo.isHeic === "function") {
      return await HeicTo.isHeic(file);
    }
  } catch {
    /* fall through to extension check */
  }
  return /\.(heic|heif)$/i.test(file.name);
}

/**
 * Loads a File/Blob into an HTMLImageElement, resolving once decoded.
 */
function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Draws the image onto a downscaled canvas (max DETECTION_MAX_DIM on the
 * longer side) — fast for both on-screen preview and face detection.
 * Fractional coordinates computed against this canvas remain valid at any
 * resolution since they're proportions, not pixels.
 */
function drawScaledToCanvas(img, canvas) {
  const scale = Math.min(
    1,
    DETECTION_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h };
}

function drawFaceOverlay(canvas, box) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.strokeStyle = "#fee101"; // brand primary yellow (Hackers House Goa theme)
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

// ---- Photo selection: convert HEIC if needed, detect face, preview ------
photoInput.addEventListener("change", async () => {
  clearError();
  const file = photoInput.files[0];
  if (!file) return;

  previewWrap.hidden = false;
  detectionStatus.textContent = "Preparing photo…";
  uploadBlob = null;
  faceBoxFraction = null;
  updateGenerateEnabled();

  try {
    // 1. HEIC/HEIF -> JPEG conversion (most browsers can't decode HEIC in <canvas>)
    let workingBlob = file;
    uploadFilename = file.name || "photo.jpg";

    if (await isHeicFile(file)) {
      detectionStatus.textContent = "Converting HEIC photo…";
      const converted = await HeicTo.heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.92,
      });
      workingBlob = Array.isArray(converted) ? converted[0] : converted;
      uploadFilename = uploadFilename.replace(/\.(heic|heif)$/i, ".jpg");
    }

    uploadBlob = workingBlob;

    // 2. Decode into an <img>, draw scaled preview
    const { img, url } = await loadImageFromBlob(workingBlob);
    const { w, h } = drawScaledToCanvas(img, previewCanvas);
    URL.revokeObjectURL(url);

    // 3. Face detection (client-side, so results are near-instant and the
    //    server never has to run a model per request)
    detectionStatus.textContent = "Detecting face…";
    const modelsReady = await modelsReadyPromise;

    if (modelsReady) {
      const detection = await faceapi.detectSingleFace(
        previewCanvas,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5,
        }),
      );

      if (detection) {
        const box = detection.box;
        faceBoxFraction = {
          x: box.x / w,
          y: box.y / h,
          width: box.width / w,
          height: box.height / h,
        };
        drawFaceOverlay(previewCanvas, box);
        detectionStatus.textContent =
          "Face detected — this area will be centered in your card.";
      } else {
        faceBoxFraction = null;
        detectionStatus.textContent =
          "Couldn't auto-detect a face — we'll auto-center your photo instead.";
      }
    } else {
      faceBoxFraction = null;
      detectionStatus.textContent =
        "Face detection unavailable — we'll auto-center your photo instead.";
    }
  } catch (err) {
    console.error(err);
    uploadBlob = null;
    showError(
      "Could not read that photo. Try a different file (JPG, PNG, or HEIC).",
    );
    previewWrap.hidden = true;
  }

  updateGenerateEnabled();
});

nameInput.addEventListener("input", updateGenerateEnabled);
roleInput.addEventListener("input", updateGenerateEnabled);

// ---- Generate ---------------------------------------------------------------
generateBtn.addEventListener("click", async () => {
  clearError();
  if (!uploadBlob) return showError("Please choose a photo first.");
  const name = nameInput.value.trim();
  const role = roleInput.value.trim();
  if (!name) return showError("Please enter your name.");
  if (!role) return showError("Please enter your role/stack.");

  setLoading(true, "Generating your card…");

  try {
    const formData = new FormData();
    formData.append("photo", uploadBlob, uploadFilename);
    formData.append("name", name);
    formData.append("role", role);
    if (faceBoxFraction) {
      formData.append("faceBox", JSON.stringify(faceBoxFraction));
    }

    const res = await fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.error || "Something went wrong generating your card.",
      );
    }

    lastGeneratedResult = data;
    resultImage.src = data.imageUrl;
    downloadBtn.href = data.downloadUrl;
    downloadBtn.setAttribute("download", `hh-goa-2026-${data.id}.png`);

    formSection.hidden = true;
    resultSection.hidden = false;
  } catch (err) {
    console.error(err);
    showError(err.message || "Could not generate your card. Please try again.");
  } finally {
    setLoading(false);
  }
});

// ---- Share to X ---------------------------------------------------------------
shareBtn.addEventListener("click", async () => {
  if (!lastGeneratedResult) return;
  const { imageUrl, sharePageUrl, shareIntentUrl } = lastGeneratedResult;
  const shareText = "I just built my Hacker House Goa 2026 card! #FrameInGoa";

  // Prefer native share sheet with the actual image attached (best on mobile)
  try {
    if (navigator.canShare) {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const file = new File([blob], "hh-goa-2026-card.png", {
        type: "image/png",
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: shareText,
          url: sharePageUrl,
        });
        return;
      }
    }
  } catch (err) {
    // user cancelled share sheet, or share failed — fall through to link intent
    if (err && err.name === "AbortError") return;
    console.warn("Native share failed, falling back to link intent:", err);
  }

  // Fallback: open a pre-filled X/Twitter intent with the share-page link
  // (its OG image is the real generated card, not a blank thumbnail)
  window.open(shareIntentUrl, "_blank", "noopener");
});

// ---- Start over ---------------------------------------------------------------
startOverBtn.addEventListener("click", () => {
  uploadBlob = null;
  faceBoxFraction = null;
  lastGeneratedResult = null;
  photoInput.value = "";
  nameInput.value = "";
  roleInput.value = "";
  previewWrap.hidden = true;
  formSection.hidden = false;
  resultSection.hidden = true;
  updateGenerateEnabled();
});

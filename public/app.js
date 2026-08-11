// ---- Config ----------------------------------------------------------
const FACE_MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const DETECTION_MAX_DIM = 640; // downscale for fast client-side detection; fractions stay resolution-independent
const API_BASE = ""; // same-origin (server also serves this static site)
const SHARE_POST_TEXT =
  "Built my HH Goa 2026 frame and I’m feeling the builder energy. Come join the vibe! #FrameInGoa #HHGoa";

const FRAME_SHARE_POST_TEXT =
  "I just created my Hacker House Goa 2026 frame! #FrameInGoa";

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

function buildShareIntentUrl(sharePageUrl) {
  const params = new URLSearchParams({ text: SHARE_POST_TEXT, url: sharePageUrl });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function buildFrameShareIntentUrl(publicImageUrl) {
  const params = new URLSearchParams({
    text: FRAME_SHARE_POST_TEXT,
    url: publicImageUrl,
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function isMobileBrowser() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
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

  // ---- Profile Frame mode: client-side compositing ----
  if (currentMode === 'frame') {
    handleFramePhotoUpload(file);
    return;
  }

  // ---- Builder ID mode (existing behavior, unchanged) ----
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
        // Note: we intentionally do NOT draw the bounding box on the preview —
        // face detection still works and the faceBox is sent to the server for
        // accurate center-cropping, but the yellow square is hidden from the user.
        detectionStatus.textContent =
          "Face detected — your photo will be perfectly centered.";
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
  if (currentMode === 'frame') return; // safety: frame mode has no Generate step
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
    downloadBtn.dataset.downloadUrl = data.imageUrl;
    downloadBtn.dataset.filename = `hh-goa-2026-${data.id}.jpg`;

    formSection.hidden = true;
    resultSection.hidden = false;
  } catch (err) {
    console.error(err);
    showError(err.message || "Could not generate your card. Please try again.");
  } finally {
    setLoading(false);
  }
});


downloadBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  const url = downloadBtn.dataset.downloadUrl;
  const filename = downloadBtn.dataset.filename || "hh-goa-2026.jpg";

  if (!url) {
    alert("Download link is not available.");
    return;
  }

  try {
    downloadBtn.style.pointerEvents = "none";
    downloadBtn.style.opacity = "0.7";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const blob = await response.blob();

    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Download error:", error);
    alert("Could not download the card. Please try again.");
  } finally {
    downloadBtn.style.pointerEvents = "";
    downloadBtn.style.opacity = "";
  }
});


// ---- Share to X ---------------------------------------------------------------
shareBtn.addEventListener("click", async () => {
  if (!lastGeneratedResult) return;
  const { imageUrl, sharePageUrl, shareIntentUrl } = lastGeneratedResult;
  const shareText = SHARE_POST_TEXT;
  const fallbackIntentUrl =
    shareIntentUrl ||
    buildShareIntentUrl(
      sharePageUrl || `${window.location.origin}${window.location.pathname}`,
    );

  // Open a placeholder tab synchronously so popup blockers don't block
  // fallback navigation after async share checks.
  let fallbackTab = null;
  try {
    fallbackTab = window.open("", "_blank");
  } catch (err) {
    fallbackTab = null;
  }

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
        if (fallbackTab && !fallbackTab.closed) fallbackTab.close();
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
  if (fallbackTab && !fallbackTab.closed) {
    fallbackTab.location.href = fallbackIntentUrl;
    return;
  }
  window.location.href = fallbackIntentUrl;
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

// ==============================================================
// PROFILE FRAME MODE — Client-side canvas compositing
// This section is completely independent of the Builder ID flow.
// ==============================================================

// ---- Frame DOM refs ----
const modeBtnBuilder = document.getElementById('modeBtnBuilder');
const modeBtnFrame = document.getElementById('modeBtnFrame');
const framePreviewWrap = document.getElementById('framePreviewWrap');
const frameCanvas = document.getElementById('frameCanvas');
const frameCtx = frameCanvas.getContext('2d');
const frameControls = document.getElementById('frameControls');
const frameZoomSlider = document.getElementById('frameZoomSlider');
const frameResetBtn = document.getElementById('frameResetBtn');
const frameActions = document.getElementById('frameActions');
const frameDownloadBtn = document.getElementById('frameDownloadBtn');
const frameShareBtn = document.getElementById('frameShareBtn');
const frameStartOverBtn = document.getElementById('frameStartOverBtn');
const builderOnlySection = document.getElementById('builderOnlySection');
const photoHint = document.getElementById('photoHint');

// ---- Frame State ----
let currentMode = 'builder'; // 'builder' | 'frame'
let frameUploadedImage = null; // HTMLImageElement of user's uploaded photo
let frameTemplateImage = null; // HTMLImageElement of the loaded template PNG
let frameObjectUrl = null;     // tracked for memory cleanup
let framePhotoOffsetX = 0;
let framePhotoOffsetY = 0;
let framePhotoScale = 1;
let frameDragging = false;
let frameDragStartX = 0;
let frameDragStartY = 0;
let frameOffsetStartX = 0;
let frameOffsetStartY = 0;

// ---- Frame Template Config ----
const FRAME_TEMPLATE = {
  src: '/HHGOA.png',
  width: 1080,
  height: 1350,
  photo: { centerX: 554, centerY: 564, radius: 177 }
};

const FRAME_TEXT = {
  title: { y: 820, font: 'italic bold 26px "Roboto"', color: '#2B4A14' },
  name:  { yStart: 905, font: 'bold 54px "Roboto"', color: '#1C3A0E', lineHeight: 62 },
  role:  { y: 1010, font: 'bold 48px "Roboto"', color: '#C8960A' },
  maxTextWidth: 692, // 792 (card width) minus 100px padding
};

// ---- Client-side Builder Title (mirrors src/builderTitles.js) ----
const FRAME_ROLE_TITLES = {
  frontend: ['Terminal Wizard', 'Pixel Whisperer', 'CSS Sorcerer', 'DOM Tamer'],
  backend:  ['Latency Slayer', 'Query Whisperer', 'Server Shaman', 'Byte Herder'],
  fullstack: ['Stack Overlord', 'End-to-End Enigma', 'Full Stack Nomad'],
  design:   ['Pixel Perfectionist', 'Vibe Architect', 'Figma Alchemist'],
  ml:       ['Gradient Descender', 'Tensor Tamer', 'Model Whisperer'],
  data:     ['Data Druid', 'Pipeline Sorcerer', 'Query Ninja'],
  product:  ['Roadmap Rogue', 'Scope Shepherd', 'Feature Forger'],
  founder:  ['Chaos Coordinator', 'Vision Vagabond', 'Founder Mode: On'],
  devops:   ['Uptime Guardian', 'Container Whisperer', 'Deploy Druid'],
};
const FRAME_GENERIC_TITLES = [
  'Terminal Wizard', 'Bug Whisperer', 'Ship-It Specialist', 'Midnight Committer',
  'Chaos Engineer', 'Prod Firefighter', 'Merge Conflict Survivor', 'Builder Extraordinaire',
];

function frameHashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function frameGenerateBuilderTitle(role, seed) {
  const normalized = role.toLowerCase();
  const matchKey = Object.keys(FRAME_ROLE_TITLES).find(k => normalized.includes(k));
  if (matchKey) {
    const arr = FRAME_ROLE_TITLES[matchKey];
    return arr[seed != null ? seed % arr.length : Math.floor(Math.random() * arr.length)];
  }
  return FRAME_GENERIC_TITLES[seed != null ? seed % FRAME_GENERIC_TITLES.length : Math.floor(Math.random() * FRAME_GENERIC_TITLES.length)];
}

function frameWrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---- Frame Template Loading (runs immediately, awaited before first render) ----
const frameReadyPromise = (async () => {
  try {
    await document.fonts.ready;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = FRAME_TEMPLATE.src;
    });
    frameTemplateImage = img;
    return true;
  } catch (err) {
    console.error('Failed to load frame template:', err);
    return false;
  }
})();

// ---- Frame Rendering (synchronous — template + fonts guaranteed loaded before first call) ----
function renderFrameCard() {
  if (!frameTemplateImage) return;

  const canvas = frameCanvas;
  const ctx = frameCtx;
  const { centerX, centerY, radius } = FRAME_TEMPLATE.photo;

  // 1. Clear and fill with white (prevents transparent/black holes in download)
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Draw user photo clipped to the circular area
  if (frameUploadedImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const img = frameUploadedImage;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const diameter = radius * 2;

    // Cover behavior: scale to completely fill the circle, crop excess
    const imgAspect = imgW / imgH;
    let drawW, drawH;
    if (imgAspect > 1) {
      // Landscape photo: height fills diameter, width overflows
      drawH = diameter;
      drawW = diameter * imgAspect;
    } else {
      // Portrait or square: width fills diameter, height overflows
      drawW = diameter;
      drawH = diameter / imgAspect;
    }

    // Apply user zoom
    drawW *= framePhotoScale;
    drawH *= framePhotoScale;

    // Center in circle + apply user offset
    const drawX = centerX - drawW / 2 + framePhotoOffsetX;
    const drawY = centerY - drawH / 2 + framePhotoOffsetY;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  // 3. Draw template on top (transparent hole reveals photo underneath)
  ctx.drawImage(frameTemplateImage, 0, 0, canvas.width, canvas.height);

  // 4. Draw text (builder title, name, role)
  const name = nameInput.value.trim();
  const role = roleInput.value.trim();
  const cardCenterX = canvas.width / 2;
  ctx.textAlign = 'center';

  // Builder title (only when both name and role are filled)
  if (name && role) {
    const seed = frameHashString(name.toLowerCase() + role.toLowerCase());
    const builderTitle = frameGenerateBuilderTitle(role, seed);
    ctx.font = FRAME_TEXT.title.font;
    ctx.fillStyle = FRAME_TEXT.title.color;
    ctx.fillText('\u2726 ' + builderTitle.toUpperCase() + ' \u2726', cardCenterX, FRAME_TEXT.title.y);
  }

  // Name
  if (name) {
    ctx.font = FRAME_TEXT.name.font;
    ctx.fillStyle = FRAME_TEXT.name.color;
    const nameLines = frameWrapText(ctx, name.toUpperCase(), FRAME_TEXT.maxTextWidth);
    let nameY = FRAME_TEXT.name.yStart;
    for (const line of nameLines.slice(0, 2)) {
      ctx.fillText(line, cardCenterX, nameY);
      nameY += FRAME_TEXT.name.lineHeight;
    }
  }

  // Role
  if (role) {
    ctx.font = FRAME_TEXT.role.font;
    ctx.fillStyle = FRAME_TEXT.role.color;
    ctx.fillText(role.toUpperCase(), cardCenterX, FRAME_TEXT.role.y);
  }
}

// ---- Frame Photo Upload (with face-aware centering) ----
async function handleFramePhotoUpload(file) {
  try {
    let workingBlob = file;

    // HEIC conversion using existing mechanism
    if (await isHeicFile(file)) {
      const converted = await HeicTo.heicTo({
        blob: file,
        type: 'image/jpeg',
        quality: 0.92,
      });
      workingBlob = Array.isArray(converted) ? converted[0] : converted;
    }

    // Cleanup previous object URL
    if (frameObjectUrl) {
      URL.revokeObjectURL(frameObjectUrl);
    }

    frameObjectUrl = URL.createObjectURL(workingBlob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = frameObjectUrl;
    });

    // Bail if mode changed during async processing
    if (currentMode !== 'frame') return;

    frameUploadedImage = img;

    // ---- Face-aware initial offset ----
    // Detect the face and compute an offset so the face lands at circle center.
    // Falls back to (0,0) i.e. image center if no face detected.
    let initialOffsetX = 0;
    let initialOffsetY = 0;

    const modelsReady = await modelsReadyPromise; // reuse already-loaded face-api models
    if (modelsReady && frameUploadedImage) {
      try {
        const tempCanvas = document.createElement('canvas');
        const { w, h } = drawScaledToCanvas(img, tempCanvas); // reuse existing helper
        const det = await faceapi.detectSingleFace(
          tempCanvas,
          new faceapi.TinyFaceDetectorOptions()
        );
        if (det) {
          // Face center as fraction of the full image
          const faceCenterXFrac = (det.box.x + det.box.width / 2) / w;
          const faceCenterYFrac = (det.box.y + det.box.height / 2) / h;

          // Compute the cover-fit draw dimensions at scale=1
          const { radius } = FRAME_TEMPLATE.photo;
          const diameter = radius * 2;
          const imgAspect = img.naturalWidth / img.naturalHeight;
          let drawW, drawH;
          if (imgAspect > 1) {
            drawH = diameter;
            drawW = diameter * imgAspect;
          } else {
            drawW = diameter;
            drawH = diameter / imgAspect;
          }

          // Offset so detected face center ends up at circle center
          initialOffsetX = -(faceCenterXFrac - 0.5) * drawW;
          initialOffsetY = -(faceCenterYFrac - 0.5) * drawH;
        }
      } catch (faceErr) {
        console.warn('Frame face detection failed, using center:', faceErr);
      }
    }

    framePhotoOffsetX = initialOffsetX;
    framePhotoOffsetY = initialOffsetY;
    framePhotoScale = 1;
    frameZoomSlider.value = '1';

    // Ensure template + fonts are loaded
    const ready = await frameReadyPromise;
    if (!ready) {
      showError('Could not load the frame template. Please refresh and try again.');
      return;
    }

    // Show preview, controls, and action buttons
    framePreviewWrap.hidden = false;
    frameControls.hidden = false;
    frameActions.hidden = false;

    renderFrameCard();
  } catch (err) {
    console.error('Frame photo upload error:', err);
    showError('Could not process the photo. Try a different file (JPG, PNG, or HEIC).');
  }
}

// ---- Mode Toggle ----
function setMode(mode) {
  currentMode = mode;
  modeBtnBuilder.classList.toggle('active', mode === 'builder');
  modeBtnFrame.classList.toggle('active', mode === 'frame');

  if (mode === 'builder') {
    builderOnlySection.hidden = false;
    framePreviewWrap.hidden = true;
    frameControls.hidden = true;
    frameActions.hidden = true;
    photoHint.textContent = "JPG, PNG, or iPhone HEIC. We\u2019ll auto-crop around your face.";
    // Restore builder preview if a photo was uploaded in builder mode
    if (uploadBlob) {
      previewWrap.hidden = false;
    }
  } else {
    // Frame mode
    builderOnlySection.hidden = true;
    previewWrap.hidden = true;
    photoHint.textContent = 'JPG, PNG, or iPhone HEIC. Drag to reposition, scroll to zoom.';

    // Show frame preview (template shown even without photo)
    framePreviewWrap.hidden = false;

    // Auto-process existing photo if one is selected but not yet composited
    if (!frameUploadedImage && photoInput.files[0]) {
      handleFramePhotoUpload(photoInput.files[0]);
    } else if (frameUploadedImage) {
      frameControls.hidden = false;
      frameActions.hidden = false;
      renderFrameCard();
    } else {
      // No photo yet — render template only (white circle placeholder)
      if (frameTemplateImage) {
        renderFrameCard();
      } else {
        frameReadyPromise.then((ready) => {
          if (ready && currentMode === 'frame') renderFrameCard();
        });
      }
    }
  }
  updateGenerateEnabled();
}

modeBtnBuilder.addEventListener('click', () => setMode('builder'));
modeBtnFrame.addEventListener('click', () => setMode('frame'));

// ---- Name/Role live update for frame mode ----
nameInput.addEventListener('input', () => {
  if (currentMode === 'frame' && frameTemplateImage) renderFrameCard();
});
roleInput.addEventListener('input', () => {
  if (currentMode === 'frame' && frameTemplateImage) renderFrameCard();
});

// ---- Frame Reposition: Mouse Drag ----
frameCanvas.addEventListener('mousedown', (e) => {
  if (!frameUploadedImage) return;
  frameDragging = true;
  frameDragStartX = e.clientX;
  frameDragStartY = e.clientY;
  frameOffsetStartX = framePhotoOffsetX;
  frameOffsetStartY = framePhotoOffsetY;
  frameCanvas.style.cursor = 'grabbing';
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!frameDragging) return;
  const rect = frameCanvas.getBoundingClientRect();
  const scaleX = frameCanvas.width / rect.width;
  const scaleY = frameCanvas.height / rect.height;
  framePhotoOffsetX = frameOffsetStartX + (e.clientX - frameDragStartX) * scaleX;
  framePhotoOffsetY = frameOffsetStartY + (e.clientY - frameDragStartY) * scaleY;
  renderFrameCard();
});

window.addEventListener('mouseup', () => {
  if (frameDragging) {
    frameDragging = false;
    frameCanvas.style.cursor = 'grab';
  }
});

// ---- Frame Reposition: Touch Drag ----
frameCanvas.addEventListener('touchstart', (e) => {
  if (!frameUploadedImage || e.touches.length !== 1) return;
  frameDragging = true;
  frameDragStartX = e.touches[0].clientX;
  frameDragStartY = e.touches[0].clientY;
  frameOffsetStartX = framePhotoOffsetX;
  frameOffsetStartY = framePhotoOffsetY;
});

frameCanvas.addEventListener('touchmove', (e) => {
  if (!frameDragging || e.touches.length !== 1) return;
  const rect = frameCanvas.getBoundingClientRect();
  const scaleX = frameCanvas.width / rect.width;
  const scaleY = frameCanvas.height / rect.height;
  framePhotoOffsetX = frameOffsetStartX + (e.touches[0].clientX - frameDragStartX) * scaleX;
  framePhotoOffsetY = frameOffsetStartY + (e.touches[0].clientY - frameDragStartY) * scaleY;
  renderFrameCard();
});

frameCanvas.addEventListener('touchend', () => {
  frameDragging = false;
});

// ---- Frame Reposition: Scroll to Zoom ----
frameCanvas.addEventListener('wheel', (e) => {
  if (!frameUploadedImage) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  framePhotoScale = Math.max(1, Math.min(3, framePhotoScale + delta));
  frameZoomSlider.value = String(framePhotoScale);
  renderFrameCard();
}, { passive: false });

// ---- Frame Zoom Slider ----
frameZoomSlider.addEventListener('input', () => {
  framePhotoScale = parseFloat(frameZoomSlider.value);
  renderFrameCard();
});

// ---- Frame Reset Position ----
frameResetBtn.addEventListener('click', () => {
  framePhotoOffsetX = 0;
  framePhotoOffsetY = 0;
  framePhotoScale = 1;
  frameZoomSlider.value = '1';
  renderFrameCard();
});

// ---- Frame Download (client-side canvas export) ----
frameDownloadBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (!frameUploadedImage || !frameTemplateImage) return;

  // Ensure canvas is up-to-date
  renderFrameCard();

  frameCanvas.toBlob((blob) => {
    if (!blob) {
      console.error('Canvas toBlob returned null');
      alert('Could not export the card. Please try again.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hh-goa-2026-profile-frame.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// ---- Frame Share (with Vercel Blob upload fallback for desktop) ----
frameShareBtn.addEventListener('click', async () => {
  if (!frameUploadedImage || !frameTemplateImage) return;

  const useNativeMobileShare = isMobileBrowser();
  // Open synchronously so desktop popup blockers allow the later X navigation.
  const xWindow = useNativeMobileShare ? null : window.open('', '_blank');
  if (xWindow) xWindow.opener = null;

  renderFrameCard();

  const blob = await new Promise((resolve) => frameCanvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    if (xWindow && !xWindow.closed) xWindow.close();
    alert('Could not export the card. Please try again.');
    return;
  }

  // Desktop always opens X directly. Native file sharing is available only on
  // mobile, where it can share the generated PNG with an installed X app.
  if (useNativeMobileShare) {
    try {
      const file = new File([blob], 'hh-goa-2026-profile-frame.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: FRAME_SHARE_POST_TEXT });
        return;
      }
    } catch (err) {
      console.warn('Mobile native share unavailable, opening X instead:', err);
    }
  }

  // Upload PNG to Vercel Blob, then use its public URL in the X intent.
  const origHTML = frameShareBtn.innerHTML;
  frameShareBtn.disabled = true;
  frameShareBtn.textContent = 'Uploading\u2026';

  try {
    const shareName = nameInput.value.trim() || 'Builder';
    const formData = new FormData();
    formData.append('image', blob, 'frame.png');
    formData.append('name', shareName);

    const res = await fetch(`${API_BASE}/api/frame-share`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    const intentUrl = data.intentUrl || buildFrameShareIntentUrl(data.imageUrl);
    if (xWindow && !xWindow.closed) {
      xWindow.location.href = intentUrl;
    } else {
      window.open(intentUrl, '_blank', 'noopener');
    }
  } catch (uploadErr) {
    console.error('Frame share upload error:', uploadErr);
    // If upload fails, still open X with the required frame hashtag.
    const fallbackIntentUrl = buildFrameShareIntentUrl(window.location.href);
    if (xWindow && !xWindow.closed) {
      xWindow.location.href = fallbackIntentUrl;
    } else {
      window.open(fallbackIntentUrl, '_blank', 'noopener');
    }
  } finally {
    frameShareBtn.disabled = false;
    frameShareBtn.innerHTML = origHTML;
    if (window.lucide) lucide.createIcons();
  }
});

// ---- Frame State Reset (shared helper) ----
function resetFrameState() {
  if (frameObjectUrl) {
    URL.revokeObjectURL(frameObjectUrl);
    frameObjectUrl = null;
  }
  frameUploadedImage = null;
  framePhotoOffsetX = 0;
  framePhotoOffsetY = 0;
  framePhotoScale = 1;
  frameZoomSlider.value = '1';
  frameControls.hidden = true;
  frameActions.hidden = true;
}

// ---- Frame Start Over ----
frameStartOverBtn.addEventListener('click', () => {
  resetFrameState();
  photoInput.value = '';
  nameInput.value = '';
  roleInput.value = '';
  // Re-render template without photo (white circle placeholder)
  renderFrameCard();
});

// Also clean up frame state when Builder ID's Start Over is clicked
startOverBtn.addEventListener('click', () => {
  resetFrameState();
  framePreviewWrap.hidden = true;
  frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
});


let redactions = [];
let processedImagePath = null;
let rawImagePath = null;
let selectionRect = null;
let targetW = 1920;
let targetH = 1080;

const statusEl = document.getElementById('status');
const targetWInput = document.getElementById('target-w');
const targetHInput = document.getElementById('target-h');
const lockAspect = document.getElementById('lock-aspect');
const aspectBadge = document.getElementById('aspect-badge');

const redTypeSelect = document.getElementById('red-type');
const fillColorInput = document.getElementById('fill-color');

function showStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = 'status-bar ' + (type === 'error' ? 'error' : '');
  statusEl.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
  }
}

function updateAspectBadge() {
  const w = parseInt(targetWInput.value) || 1920;
  const h = parseInt(targetHInput.value) || 1080;
  if (lockAspect.checked) {
    aspectBadge.textContent = '比率: 1:1 (正方形)';
  } else if (w > 0 && h > 0) {
    const g = gcd(w, h);
    aspectBadge.textContent = `比率: ${(w/g)}:${(h/g)}`;
  } else {
    aspectBadge.textContent = '';
  }
  targetW = w;
  targetH = h;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// 塗りつぶしの色変更も即時反映
fillColorInput.addEventListener('input', () => {
  redactions.forEach(r => {
    if (r.type === 'fill') r.color = fillColorInput.value;
  });
  if (rawImagePath) runPreview();
});

// Event Listeners for inputs
[targetWInput, targetHInput, lockAspect].forEach(el => {
  el.addEventListener('input', () => {
    if (lockAspect.checked) {
      if (el === targetWInput) targetHInput.value = targetWInput.value;
      else if (el === targetHInput) targetWInput.value = targetHInput.value;
    }
    updateAspectBadge();
    if (rawImagePath) runPreview();
  });
});

updateAspectBadge();

// ROI Selection
document.getElementById('select-mouse-btn').addEventListener('click', async () => {
  showStatus('画面が切り替わります。 Enterで決定、Escでキャンセル。');
  try {
    await window.electronAPI.openSelection(
      lockAspect.checked ? 1 : (targetW / targetH),
      targetW,
      targetH
    );
  } catch (err) {
    showStatus('エラー: ' + err.message, 'error');
  }
});

// Selection Callback
window.electronAPI.onSelectionRectSelected(async (rect) => {
  selectionRect = rect;
  showStatus('キャプチャ中...', 'info');
  try {
    rawImagePath = await window.electronAPI.captureScreenshot(rect);
    await runPreview();
    document.getElementById('preview-section').style.display = 'block';
    document.getElementById('export-section').style.display = 'block';
    showStatus('撮影完了。ドラッグして「塗りつぶし」を追加できます。', 'success');
  } catch (err) {
    showStatus('キャプチャエラー: ' + err.message, 'error');
  }
});

function renderRedactions() {
  const listEl = document.getElementById('redaction-list');
  listEl.innerHTML = '';

  redactions.forEach((red, index) => {
    const div = document.createElement('div');
    div.className = 'redaction-item';
    const detail = `<span style="display:inline-block; width:12px; height:12px; background:${red.color}; border:1px solid #ddd; vertical-align:middle; margin-right:4px;"></span>${red.color}`;

    div.innerHTML = `
      <div>
        <span class="type">塗りつぶし</span>
        <span style="color: var(--text-muted); font-size: 11px; margin-right: 8px;">
          ${detail}
        </span>
      </div>
      <button class="danger" style="padding: 4px 12px; font-size: 12px;" data-index="${index}">削除</button>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll('button.danger').forEach(btn => {
    btn.onclick = () => {
      const i = parseInt(btn.dataset.index);
      redactions.splice(i, 1);
      renderRedactions();
      runPreview();
    };
  });
}

function getConfig() {
  return {
    borderSize: parseInt(document.getElementById('border-size').value) || 0,
    borderColor: document.getElementById('border-color').value || 'black',
    targetSize: {
      width: parseInt(targetWInput.value) || 0,
      height: parseInt(targetHInput.value) || 0
    },
    redactions: [...redactions]
  };
}

async function updatePreview(imagePath) {
  if (!imagePath) return;
  const previewImg = document.getElementById('preview-img');
  const previewStatus = document.getElementById('preview-status');

  try {
    const imageData = await window.electronAPI.getProcessedImage(imagePath);
    previewImg.src = imageData;
    const config = getConfig();
    previewStatus.textContent = `出力サイズ: ${config.targetSize.width}×${config.targetSize.height}px`;
    previewImg.onload = () => {
      renderRedactionOverlay();
    };
  } catch (err) {
    console.error('Preview load error:', err);
  }
}

async function runPreview() {
  if (!rawImagePath) return;
  try {
    const config = getConfig();
    processedImagePath = await window.electronAPI.processImage({
      inputPath: rawImagePath,
      config: config
    });
    await updatePreview(processedImagePath);
  } catch (err) {
    showStatus('画像処理エラー: ' + err.message, 'error');
  }
}

document.getElementById('border-size').addEventListener('input', () => { if (rawImagePath) runPreview(); });
document.getElementById('border-color').addEventListener('input', () => { if (rawImagePath) runPreview(); });

// Mouse Drawing
const previewContainer = document.getElementById('preview-container');
const drawGuide = document.getElementById('draw-guide');
let isDrawing = false;
let startX, startY;

previewContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !rawImagePath) return;
  e.preventDefault();
  const rect = previewContainer.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  isDrawing = true;

  drawGuide.style.left = startX + 'px';
  drawGuide.style.top = startY + 'px';
  drawGuide.style.width = '0px';
  drawGuide.style.height = '0px';
  drawGuide.style.display = 'block';
});

window.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const rect = previewContainer.getBoundingClientRect();
  let currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  let currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(startX - currentX);
  const height = Math.abs(startY - currentY);

  drawGuide.style.left = left + 'px';
  drawGuide.style.top = top + 'px';
  drawGuide.style.width = width + 'px';
  drawGuide.style.height = height + 'px';
});

window.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  drawGuide.style.display = 'none';

  const previewImg = document.getElementById('preview-img');
  const rect = previewContainer.getBoundingClientRect();
  let endX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  let endY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

  const widthDisp = Math.abs(startX - endX);
  const heightDisp = Math.abs(startY - endY);
  if (widthDisp < 5 || heightDisp < 5) return;

  const leftDisp = Math.min(startX, endX);
  const topDisp = Math.min(startY, endY);
  const scale = previewImg.naturalWidth / previewImg.clientWidth;

  redactions.push({
    type: 'fill',
    x: Math.round(leftDisp * scale),
    y: Math.round(topDisp * scale),
    width: Math.round(widthDisp * scale),
    height: Math.round(heightDisp * scale),
    color: fillColorInput.value
  });
  renderRedactions();
  runPreview();
});

function renderRedactionOverlay() {
  const overlay = document.getElementById('redaction-overlay');
  overlay.innerHTML = '';
  const previewImg = document.getElementById('preview-img');
  if (!previewImg || !previewImg.clientWidth) return;

  const scale = previewImg.clientWidth / previewImg.naturalWidth;
  redactions.forEach(red => {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.left = (red.x * scale) + 'px';
    div.style.top = (red.y * scale) + 'px';
    div.style.width = (red.width * scale) + 'px';
    div.style.height = (red.height * scale) + 'px';
    div.style.border = '1px solid var(--primary)';
    div.style.background = red.color + '44';
    div.style.pointerEvents = 'none';
    overlay.appendChild(div);
  });
}

document.getElementById('save-file-btn').addEventListener('click', async () => {
  if (!processedImagePath) return;
  const savePath = await window.electronAPI.saveDialog();
  if (savePath) {
    try {
      await window.electronAPI.copyFile({ from: processedImagePath, to: savePath });
      showStatus('ファイルを保存しました', 'success');
    } catch (err) {
      showStatus('保存エラー: ' + err.message, 'error');
    }
  }
});

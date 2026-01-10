
// static/js/pdf_handler.js
// PDF 처리 로직: pdf.js 사용, 렌더링, 다운로드

import { openModal, showToast } from './ui.js';

let currentPdfBlobs = []; // Array of { blob, filename, index }
let pdfDoc = null;

export async function handlePdfUpload(file) {
  const pdfDropZone = document.getElementById('pdfDropZone');
  const pdfResultContainer = document.getElementById('pdfResultContainer');
  const pdfFileName = document.getElementById('pdfFileName');
  const pdfPageCount = document.getElementById('pdfPageCount');
  const pdfFileInfo = document.getElementById('pdfFileInfo');
  const pdfQualitySelect = document.getElementById('pdfQuality');

  // UI Update
  pdfDropZone.classList.add('hidden');

  // Find Grid
  const grid = document.getElementById('pdfPreviewGrid');
  if (grid) {
    grid.innerHTML = '<div class="loader"></div><p style="text-align:center">PDF 변환 중...</p>';
  }
  if (pdfResultContainer) pdfResultContainer.classList.remove('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;

    // Default to 3.0 (HD) if element is hidden/removed
    const scale = pdfQualitySelect ? parseFloat(pdfQualitySelect.value) : 3.0;

    if (grid) grid.innerHTML = '';

    // Reset State
    currentPdfBlobs = [];

    // Update Top Info
    if (pdfFileName) pdfFileName.textContent = file.name;
    if (pdfPageCount) pdfPageCount.textContent = `${pdfDoc.numPages} pages`;
    if (pdfFileInfo) pdfFileInfo.classList.remove('hidden');

    // Render Pages
    await renderPdfPages(pdfDoc, scale, grid);

  } catch (e) {
    console.error(e);
    if (grid) grid.innerHTML = '<p style="color:red; text-align:center">PDF를 읽을 수 없습니다.</p>';
    showToast('PDF 변환 실패');
  }
}

async function renderPdfPages(pdf, scale, container) {
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;

      // Convert to Blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const filename = `page_${String(i).padStart(3, '0')}.png`;

      currentPdfBlobs.push({ blob, filename, index: i });

      // Create UI Card
      const card = createPdfCard(i, blob, filename);
      container.appendChild(card);

    } catch (err) {
      console.error(`Page ${i} error:`, err);
    }
  }

  // Done
  if (window.lucide) lucide.createIcons();
  updateSelectionState();
}

function createPdfCard(index, blob, filename) {
  const url = URL.createObjectURL(blob);
  const div = document.createElement('div');
  div.className = 'pdf-card';
  div.innerHTML = `
    <div class="pdf-card-check">
         <label class="custom-checkbox">
            <input type="checkbox" class="pdf-check-input" data-index="${index}">
            <span class="checkmark"></span>
         </label>
    </div>
    <img src="${url}" loading="lazy" onclick="this.parentElement.querySelector('input').click()">
    <div class="pdf-card-footer">
         <span>Page ${index}</span>
         <button class="btn-text small" id="btnPreview_${index}"><i data-lucide="eye" size="14"></i></button>
    </div>
  `;

  const btnPreview = div.querySelector(`#btnPreview_${index}`);
  if (btnPreview) {
    btnPreview.addEventListener('click', () => {
      openModal({ bg_url: url }, filename);
    });
  }

  return div;
}

// Select All / Download Logic exports

export function getSelectedBlobs() {
  const checkboxes = document.querySelectorAll('.pdf-check-input:checked');
  const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));
  return currentPdfBlobs.filter(item => selectedIndices.includes(item.index));
}

export function getAllBlobs() {
  return currentPdfBlobs;
}

export function updateSelectionState() {
  const total = currentPdfBlobs.length;
  const checkboxes = document.querySelectorAll('.pdf-check-input:checked');
  const checkedCount = checkboxes.length;

  const btnDownloadSelected = document.getElementById('btnDownloadSelected');
  const pdfSelectAll = document.getElementById('pdfSelectAll');

  if (btnDownloadSelected) {
    btnDownloadSelected.disabled = checkedCount === 0;
    btnDownloadSelected.innerHTML = `<i data-lucide="check-square"></i> 선택 이미지 다운 (${checkedCount})`;
    if (window.lucide) lucide.createIcons({ root: btnDownloadSelected });
  }

  // Update Master Checkbox
  if (pdfSelectAll) {
    if (total > 0 && checkedCount === total) {
      pdfSelectAll.checked = true;
      pdfSelectAll.indeterminate = false;
    } else if (checkedCount > 0) {
      pdfSelectAll.checked = false;
      pdfSelectAll.indeterminate = true;
    } else {
      pdfSelectAll.checked = false;
      pdfSelectAll.indeterminate = false;
    }
  }
}

export function toggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('.pdf-check-input');
  checkboxes.forEach(cb => cb.checked = checked);
  updateSelectionState();
}

export async function downloadImages(blobs, prefix = 'pdf_export') {
  if (blobs.length === 0) return;

  if (blobs.length === 1) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blobs[0].blob);
    link.download = blobs[0].filename;
    link.click();
  } else {
    const zip = new JSZip();
    blobs.forEach(item => {
      zip.file(item.filename, item.blob);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${prefix}_${Date.now()}.zip`;
    link.click();
  }
}

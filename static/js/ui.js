
// static/js/ui.js
// 화면(DOM) 조작, 탭 전환, 토스트/모달, HTML 생성 헬퍼

import { getTabSuffix } from './config.js';

// --- Toast & Modals ---

export function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, duration);
}

export function openModal(data, title, previewOverrideUrl = null) {
  const modal = document.getElementById('previewModal');
  const modalTitle = document.getElementById('modalTitle');
  const container = document.getElementById('modalPreviewContainer');
  const btnDlHtml = document.getElementById('modalBtnDownloadHtml');
  const btnDlBg = document.getElementById('modalBtnDownloadBg');
  const btnDlPptx = document.getElementById('modalBtnDownloadPptx');

  modalTitle.textContent = title || "Slide Preview";
  container.innerHTML = '';

  // Setup Download Links
  if (data.html_url) {
    btnDlHtml.href = data.html_url;
    btnDlHtml.classList.remove('hidden');
  } else {
    btnDlHtml.classList.add('hidden');
  }

  if (data.bg_url) {
    btnDlBg.href = data.bg_url;
    btnDlBg.classList.remove('hidden');
  } else {
    btnDlBg.classList.add('hidden');
  }

  if (data.pptx_url) {
    btnDlPptx.href = data.pptx_url;
    btnDlPptx.classList.remove('hidden');
  } else {
    btnDlPptx.classList.add('hidden');
  }

  // Determine Preview Content
  let content = '';
  // Priority 1: Override URL (e.g. Original Image)
  if (previewOverrideUrl) {
    content = `<img src="${previewOverrideUrl}" class="preview-img">`;
  }
  // Priority 2: HTML
  else if (data.html_url) {
    content = `<iframe src="${data.html_url}" class="preview-iframe"></iframe>`;
  }
  // Priority 3: BG Image
  else if (data.bg_url) {
    content = `<img src="${data.bg_url}" class="preview-img">`;
  } else {
    content = '<p style="text-align:center; color:#ccc;">미리보기 없음</p>';
  }

  container.innerHTML = content;
  modal.classList.remove('hidden');
}

export function closeModal() {
  document.getElementById('previewModal').classList.add('hidden');
  document.getElementById('modalPreviewContainer').innerHTML = ''; // Clear iframe to stop sound/video
}

export function showCombineMismatchModal(type, details, message) {
  alert(message); // Using simple alert as per original code logic fallback/simplicity request
}

export function toggleDetails(header) {
  const content = header.nextElementSibling;
  const icon = header.querySelector('.chevron-icon');
  content.classList.toggle('hidden');
  if (icon) {
    if (content.classList.contains('hidden')) icon.classList.remove('rotate-180');
    else icon.classList.add('rotate-180');
  }
}

// --- Tab Switching ---

export function switchTab(tabId, jobQueueLength = 0) {
  // HIDDEN ALL SECTIONS (Reset)
  const reconstructSection = document.getElementById('reconstructSection');
  const pdfSection = document.getElementById('pdfSection');
  const combineSection = document.getElementById('combineSection');
  const removeTextPhotoroomSection = document.getElementById('removeTextPhotoroomSection');
  const batchControlPanel = document.getElementById('batchControlPanel');

  if (reconstructSection) reconstructSection.classList.add('hidden');
  if (pdfSection) pdfSection.classList.add('hidden');
  if (combineSection) combineSection.classList.add('hidden');
  if (removeTextPhotoroomSection) removeTextPhotoroomSection.classList.add('hidden');

  if (batchControlPanel) batchControlPanel.classList.add('hidden');

  const rResult = document.getElementById('reconstructResultSection');
  const cResult = document.getElementById('combineResultSection');
  const pResult = document.getElementById('pdfResultContainer');

  if (rResult) rResult.classList.add('hidden');
  if (cResult) cResult.classList.add('hidden');
  if (pResult) pResult.classList.add('hidden');

  // Elements specific to PDF/Reconstruct actions logic
  const btnPptxStart = document.getElementById('btnPptxStart');
  const uploadZone = document.getElementById('uploadSection');

  // SHOW CURRENT SECTION
  if (tabId === 'pdf-to-pptx') {
    // PDF to PPTX Mode
    if (pdfSection) pdfSection.classList.remove('hidden');
    if (btnPptxStart) btnPptxStart.classList.remove('hidden');
    // Maybe show result if it has content? Managed by PDF handler generally.

  } else if (tabId === 'combine') {
    if (combineSection) combineSection.classList.remove('hidden');

  } else if (tabId === 'remove-text-photoroom') {
    if (removeTextPhotoroomSection) removeTextPhotoroomSection.classList.remove('hidden');

  } else {
    // Standard Reconstruction (reconstruct)
    if (reconstructSection) reconstructSection.classList.remove('hidden');

    const reconstructSettings = document.getElementById('reconstructSettings');
    if (reconstructSettings) reconstructSettings.classList.remove('hidden');

    // Manage Upload vs Queue Visibility
    if (jobQueueLength > 0) {
      if (batchControlPanel) batchControlPanel.style.display = 'flex';
      if (batchControlPanel) batchControlPanel.classList.remove('hidden');
      if (rResult) rResult.classList.remove('hidden');
      if (uploadZone) uploadZone.classList.add('hidden');
    } else {
      if (uploadZone) uploadZone.classList.remove('hidden');
      if (rResult) rResult.classList.add('hidden'); // Fix: Hide result section if empty
    }
  }

  // Update Title (Legacy/Simple)
  const titles = {
    'reconstruct': '슬라이드 이미지 업로드',
    'pdf-to-pptx': 'PDF 슬라이드 변환',
    'remove-text-photoroom': '이미지 텍스트 제거 (Photoroom)',
    'combine': '이미지 + 텍스트 조합'
  };
  const titleEl = document.getElementById('uploadTitle');
  if (titleEl) titleEl.textContent = titles[tabId] || '이미지 업로드';
}

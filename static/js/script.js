document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // --- 1. Centralized Settings State ---
  const AppSettings = {
    vision_model: 'gemini-3-flash-preview',
    inpainting_model: 'opencv-telea',
    codegen_model: 'algorithmic',
    output_format: 'both',
    max_concurrent: 3
  };

  // --- Elements ---
  const uploadZone = document.getElementById('uploadSection');
  const fileInput = document.getElementById('fileInput');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const jobListContainer = document.getElementById('jobList');

  // Batch Controls
  const batchControlPanel = document.getElementById('batchControlPanel');
  const btnPause = document.getElementById('btnPause');
  const btnResume = document.getElementById('btnResume');
  const btnStop = document.getElementById('btnStop');
  const batchProgressBar = document.getElementById('batchProgressBar');
  const batchStatusText = document.getElementById('batchStatusText');

  // Settings Elements
  const visionModelSelect = document.getElementById('visionModel');
  const inpaintingModelSelect = document.getElementById('inpaintingModel');
  const codegenModelSelect = document.getElementById('codegenModel');
  const outputFormatSelect = document.getElementById('outputFormat');
  const maxConcurrentSelect = document.getElementById('maxConcurrent');
  const btnSaveDefaults = document.getElementById('btnSaveDefaults');

  // PDF Elements
  // PDF Elements
  const pdfSection = document.getElementById('pdfSection');
  const pdfDropZone = document.getElementById('pdfDropZone');
  const pdfInput = document.getElementById('pdfInput');
  const pdfResultContainer = document.getElementById('pdfResultContainer');
  const pdfQualitySelect = document.getElementById('pdfQuality');

  // PDF New UI Elements
  const pdfTopArea = document.getElementById('pdfTopArea');
  const pdfFileInfo = document.getElementById('pdfFileInfo');
  const pdfFileName = document.getElementById('pdfFileName');
  const pdfPageCount = document.getElementById('pdfPageCount');
  const btnPdfReset = document.getElementById('btnPdfReset');

  const pdfToolbar = document.getElementById('pdfToolbar');
  const pdfSelectAll = document.getElementById('pdfSelectAll');
  const btnDownloadSelected = document.getElementById('btnDownloadSelected');
  const btnDownloadAll = document.getElementById('btnDownloadAll');

  // PDF State
  let currentPdfBlobs = []; // Array of { blob, filename, index }

  // Preview Modal Elements (Global references)
  const modal = document.getElementById('previewModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalContainer = document.getElementById('modalPreviewContainer');

  let currentTab = 'reconstruct';

  // --- Job Queue Class ---
  class JobQueue {
    constructor() {
      this.queue = [];
      this.activeCount = 0;
      this.isPaused = false;
      this.latestBatchFolder = null;
    }

    // Dynamic Getter for Config from AppSettings
    get maxConcurrent() {
      return AppSettings.max_concurrent;
    }

    addFiles(files) {
      if (this.queue.length === 0 && this.activeCount === 0) {
        uploadZone.classList.add('hidden');
        batchControlPanel.classList.remove('hidden');
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      const timeStr = `${year}${month}${day}_${hour}${minute}${second}`;
      const batchFolder = files.length > 1 ? `multi_${timeStr}` : 'single';
      this.latestBatchFolder = batchFolder;

      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const job = {
          id: jobId,
          file: file,
          status: 'pending',
          element: this.createJobCard(jobId, file.name),
          batchFolder: batchFolder
        };
        this.queue.push(job);
        jobListContainer.appendChild(job.element);
      });
      lucide.createIcons();
      this.updateGlobalProgress();
      this.processQueue();
    }

    createJobCard(id, filename) {
      const div = document.createElement('div');
      div.className = 'job-card';
      div.id = id;
      div.innerHTML = `
                <div class="job-header">
                    <div class="job-info">
                        <div class="job-title-row" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <span class="job-badge pending"><i data-lucide="clock" size="14"></i> 대기 중</span>
                            <div class="job-title">${filename}</div>
                        </div>
                        <div class="job-meta">
                            <span class="status-detail">대기열 등록됨</span>
                        </div>
                        <div class="job-progress-wrapper">
                            <div class="job-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
                <div class="job-actions"></div>
                <div class="job-preview-container hidden" style="display: none;"></div>
            `;
      return div;
    }

    async processQueue() {
      if (this.isPaused) return;
      // Check concurrency against AppSettings
      if (this.activeCount >= this.maxConcurrent) return;

      const nextJob = this.queue.find(j => j.status === 'pending');
      if (!nextJob) return;

      nextJob.status = 'processing';
      this.activeCount++;
      this.updateJobUI(nextJob, 'processing', '작업을 시작합니다...', 5);
      this.updateGlobalProgress();

      this.runJob(nextJob).finally(() => {
        this.activeCount--;
        this.updateGlobalProgress();
        this.processQueue();
      });
      // Try to start more if limit allows
      this.processQueue();
    }

    async runJob(job) {
      const formData = new FormData();
      formData.append('file', job.file);
      // Use AppSettings for Consistency
      formData.append('vision_model', AppSettings.vision_model);
      formData.append('batch_folder', job.batchFolder);
      // Pass Concurrency Setting to Backend
      formData.append('max_concurrent', AppSettings.max_concurrent);

      let endpoint = '/upload';
      if (currentTab === 'reconstruct') {
        endpoint = '/upload';
        formData.append('inpainting_model', AppSettings.inpainting_model);
        formData.append('codegen_model', AppSettings.codegen_model);
      } else if (currentTab === 'remove-text') {
        endpoint = '/remove-text';
        formData.append('inpainting_model', AppSettings.inpainting_model);
      } else if (currentTab === 'remove-text-ai') {
        endpoint = '/remove-text-ai';
      } else if (currentTab === 'extract-text') {
        endpoint = '/extract-text';
      }

      try {
        const response = await fetch(endpoint, { method: 'POST', body: formData });
        if (!response.ok) throw new Error('서버 오류');
        const data = await response.json();

        if (currentTab === 'reconstruct' && data.status === 'processing') {
          await this.monitorProgress(job, data.task_id);
        } else {
          this.completeJob(job, data.data);
        }
      } catch (e) {
        console.error(e);
        job.status = 'error';
        this.updateJobUI(job, 'error', `오류: ${e.message}`, 0);
      }
    }

    monitorProgress(job, taskId) {
      return new Promise((resolve, reject) => {
        const evtSource = new EventSource(`/progress/${taskId}`);
        evtSource.onmessage = (e) => {
          const pData = JSON.parse(e.data);
          this.updateJobUI(job, pData.status, pData.message, pData.percent);
          if (pData.status === 'complete') { evtSource.close(); this.completeJob(job, pData.data); resolve(); }
          else if (pData.status === 'error') { evtSource.close(); job.status = 'error'; reject(new Error(pData.message)); }
          else if (pData.status === 'cancelled') { evtSource.close(); job.status = 'cancelled'; this.updateJobUI(job, 'cancelled', '작업이 취소되었습니다.', 0); resolve(); }
        };
        evtSource.onerror = () => { evtSource.close(); reject(new Error("Connection Lost")); };
      });
    }

    completeJob(job, data) {
      job.status = 'complete';
      this.updateJobUI(job, 'complete', '처리 완료!', 100);
      const actionsDiv = job.element.querySelector('.job-actions');
      if (actionsDiv) {
        actionsDiv.innerHTML = '';
        const originalUrl = URL.createObjectURL(job.file);
        // Prepare safe data object for onclick
        const safeData = { html_url: data.html_url, bg_url: data.bg_url, pptx_url: data.pptx_url };
        const dataStr = JSON.stringify(safeData).replace(/"/g, "&quot;");

        actionsDiv.innerHTML += `<button class="btn-secondary small" onclick="openModal(${dataStr}, '${job.file.name} (원본)', '${originalUrl}')"><i data-lucide="image" size="14"></i> 원본</button>`;

        if (data.html_url) {
          actionsDiv.innerHTML += `<a href="${data.html_url}" class="btn-secondary small" target="_blank"><i data-lucide="eye" size="14"></i> 보기</a>`;
          actionsDiv.innerHTML += `<a href="${data.html_url}" class="btn-secondary small" download><i data-lucide="download" size="14"></i> DL</a>`;
        }
        if (data.pptx_url) {
          actionsDiv.innerHTML += `<a href="${data.pptx_url}" class="btn-secondary small" download><i data-lucide="file-text" size="14"></i> PPTX</a>`;
        }
        if (data.bg_url) {
          actionsDiv.innerHTML += `<a href="${data.bg_url}" class="btn-secondary small" download><i data-lucide="image" size="14"></i> 배경</a>`;
        }
        if (data.text) {
          // For text extraction
          actionsDiv.innerHTML += `<button class="btn-secondary small" onclick="navigator.clipboard.writeText(\`${data.text.replace(/`/g, '\\`')}\`)"><i data-lucide="copy" size="14"></i> 복사</button>`;
        }
        lucide.createIcons({ root: actionsDiv });
      }

      const previewContainer = job.element.querySelector('.job-preview-container');
      if (previewContainer) {
        previewContainer.style.display = 'block'; previewContainer.classList.remove('hidden');
        let previewContent = '';
        if (data.html_url) previewContent = `<iframe src="${data.html_url}" class="preview-iframe" scrolling="no"></iframe>`;
        else if (data.bg_url) previewContent = `<img src="${data.bg_url}" class="preview-img">`;

        if (previewContent) {
          previewContainer.innerHTML = previewContent;
          previewContainer.onclick = () => openModal(data, job.file.name);
        }
      }
    }

    updateJobUI(job, status, message, percent = 0) {
      const badge = job.element.querySelector('.job-badge');
      const detail = job.element.querySelector('.status-detail');
      const progressBar = job.element.querySelector('.job-progress-fill');
      const card = job.element;
      let badgeClass = status === 'starting' ? 'pending' : status;
      badge.className = `job-badge ${badgeClass}`;
      let iconName = 'clock';
      if (status === 'processing') iconName = 'loader-2';
      else if (status === 'complete') iconName = 'check-circle-2';
      else if (status === 'error') iconName = 'alert-circle';
      else if (status === 'cancelled') iconName = 'x-circle';
      else if (status === 'paused') iconName = 'pause-circle';

      badge.innerHTML = `<i data-lucide="${iconName}" size="14"></i> ${this.getStatusText(status)}`;
      lucide.createIcons({ root: badge, attrs: { class: status === 'processing' ? 'animate-spin' : '' } });
      detail.textContent = message;

      // Toggle visibility of status detail text
      if (status === 'complete') {
        detail.style.display = 'none';
      } else {
        detail.style.display = 'block';
      }

      if (progressBar && percent !== undefined) {
        progressBar.style.width = `${percent}%`;
        if (status === 'cancelled') progressBar.style.backgroundColor = '#94a3b8';
      }
      card.className = `job-card ${badgeClass}`;
    }

    getStatusText(status) {
      const map = { 'pending': '대기 중', 'processing': '처리 중', 'complete': '완료', 'error': '오류', 'cancelled': '취소됨', 'paused': '일시정지됨' };
      return map[status] || status;
    }

    updateGlobalProgress() {
      const total = this.queue.length;
      const completed = this.queue.filter(j => j.status === 'complete' || j.status === 'error' || j.status === 'cancelled').length;
      const percent = total === 0 ? 0 : (completed / total) * 100;
      batchStatusText.textContent = `완료: ${completed} / ${total}`;
      batchProgressBar.style.width = `${percent}%`;

      // Show PPTX Download Button if we have completed items
      const btnPPTX = document.getElementById('btnDownloadBatchPPTX');
      if (completed > 0 && this.latestBatchFolder) {
        btnPPTX.classList.remove('hidden');
      } else {
        btnPPTX.classList.add('hidden');
      }
    }

    async downloadBatchPPTX() {
      if (!this.latestBatchFolder) {
        showToast('다운로드할 배치가 없습니다.');
        return;
      }

      const btn = document.getElementById('btnDownloadBatchPPTX');
      const originalText = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> 생성 중...`;
      btn.disabled = true;

      try {
        const res = await fetch(`/generate-pptx-batch/${this.latestBatchFolder}`, { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.status === 'success') {
          // Trigger Download
          const link = document.createElement('a');
          link.href = data.download_url;
          link.download = data.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showToast('PPTX 다운로드가 시작되었습니다.');
        } else {
          showToast(`오류: ${data.message || 'PPTX 생성 실패'}`);
        }
      } catch (e) {
        console.error(e);
        showToast('PPTX 요청 중 오류가 발생했습니다.');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        lucide.createIcons(); // restore icon
      }
    }

    pause() {
      this.isPaused = true;
      document.getElementById('btnPause').classList.add('hidden');
      document.getElementById('btnResume').classList.remove('hidden');
      fetch('/pause', { method: 'POST' }).then(() => { showToast('⏸️ 작업이 일시정지되었습니다. (현재 단계가 끝나면 멈춥니다)'); });
    }
    resume() {
      this.isPaused = false;
      document.getElementById('btnPause').classList.remove('hidden');
      document.getElementById('btnResume').classList.add('hidden');
      fetch('/resume', { method: 'POST' }).then(() => { showToast('▶️ 작업이 재개됩니다.'); this.processQueue(); });
    }
    stop() {
      if (!confirm('현재 진행 중인 모든 작업을 취소하시겠습니까?')) return;
      const processingJobs = this.queue.filter(j => j.status === 'processing');
      processingJobs.forEach(job => {
        fetch(`/cancel/${job.id}`, { method: 'POST' }).catch(console.error);
        job.status = 'cancelled';
        this.updateJobUI(job, 'cancelled', '중단 요청됨...', 0);
      });
      const pendingJobs = this.queue.filter(j => j.status === 'pending');
      pendingJobs.forEach(job => {
        job.status = 'cancelled';
        this.updateJobUI(job, 'cancelled', '대기열에서 취소됨');
      });
      this.updateGlobalProgress();
      if (this.activeCount === 0 && pendingJobs.length === 0) showToast('작업이 중단되었습니다.');
    }
  }

  const jobQueue = new JobQueue();
  window.jobQueue = jobQueue;

  // --- 2. State Sync Logic ---
  // Load Settings from Server
  async function loadSettings() {
    try {
      const res = await fetch('/settings');
      if (res.ok) {
        const settings = await res.json();
        // Update AppSettings
        if (settings.vision_model) AppSettings.vision_model = settings.vision_model;
        if (settings.inpainting_model) AppSettings.inpainting_model = settings.inpainting_model;
        if (settings.codegen_model) AppSettings.codegen_model = settings.codegen_model;
        if (settings.output_format) AppSettings.output_format = settings.output_format;
        if (settings.max_concurrent) AppSettings.max_concurrent = parseInt(settings.max_concurrent);

        // Sync UI
        visionModelSelect.value = AppSettings.vision_model;
        inpaintingModelSelect.value = AppSettings.inpainting_model;
        codegenModelSelect.value = AppSettings.codegen_model;
        if (outputFormatSelect) outputFormatSelect.value = AppSettings.output_format;
        maxConcurrentSelect.value = AppSettings.max_concurrent;
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }

  // Save Settings to Server (Defaults)
  async function saveSettings() {
    const settings = {
      vision_model: AppSettings.vision_model,
      inpainting_model: AppSettings.inpainting_model,
      codegen_model: AppSettings.codegen_model,
      output_format: AppSettings.output_format,
      max_concurrent: AppSettings.max_concurrent
    };

    try {
      const res = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) showToast('✅ 설정이 기본값으로 저장되었습니다!');
      else showToast('❌ 설정 저장 실패.');
    } catch (e) { showToast('❌ 설정 저장 중 오류가 발생했습니다.'); }
  }

  // Bind UI Changes to AppSettings (Instant Update)
  visionModelSelect.addEventListener('change', (e) => { AppSettings.vision_model = e.target.value; });
  inpaintingModelSelect.addEventListener('change', (e) => { AppSettings.inpainting_model = e.target.value; });
  codegenModelSelect.addEventListener('change', (e) => { AppSettings.codegen_model = e.target.value; });
  if (outputFormatSelect) outputFormatSelect.addEventListener('change', (e) => { AppSettings.output_format = e.target.value; });

  maxConcurrentSelect.addEventListener('change', (e) => {
    AppSettings.max_concurrent = parseInt(e.target.value);
    // Do NOT auto-save to server defaults. Only update runtime state.
    jobQueue.processQueue(); // Retry queue with new limit immediately
  });

  if (btnSaveDefaults) btnSaveDefaults.addEventListener('click', saveSettings);

  // --- Initial Load ---
  loadSettings();

  // --- Event Listeners (Upload, Tab, etc.) ---
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => { uploadZone.classList.remove('dragover'); });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault(); uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) jobQueue.addFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) jobQueue.addFiles(e.target.files);
  });

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      const titles = {
        'reconstruct': '재구성을 위한 슬라이드 이미지 업로드',
        'remove-text': '텍스트 제거를 위한 이미지 업로드 (OpenCV)',
        'remove-text-ai': '텍스트 제거를 위한 이미지 업로드 (AI)',
        'extract-text': '텍스트 추출을 위한 이미지 업로드'
      };
      document.getElementById('uploadTitle').textContent = titles[currentTab];
    });
  });

  // --- Toast Function ---
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
  }

  // --- PDF to PNG Logic (Client Side) ---
  pdfDropZone.addEventListener('click', () => pdfInput.click());
  pdfInput.addEventListener('change', (e) => {
    if (e.target.files.length) handlePdf(e.target.files[0]);
  });
  pdfDropZone.addEventListener('dragover', (e) => { e.preventDefault(); pdfDropZone.classList.add('dragover'); });
  pdfDropZone.addEventListener('dragleave', () => { pdfDropZone.classList.remove('dragover'); });
  pdfDropZone.addEventListener('drop', (e) => {
    e.preventDefault(); pdfDropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length && e.dataTransfer.files[0].type === 'application/pdf') {
      handlePdf(e.dataTransfer.files[0]);
    } else {
      showToast("PDF 파일만 지원합니다.");
    }
  });

  // Reset Button
  if (btnPdfReset) {
    btnPdfReset.addEventListener('click', () => {
      pdfFileInfo.classList.add('hidden');
      pdfToolbar.classList.add('hidden');
      pdfResultContainer.classList.add('hidden');
      pdfResultContainer.innerHTML = '';
      pdfDropZone.classList.remove('hidden');
      pdfInput.value = '';
      currentPdfBlobs = [];

      // Reset Selection State
      pdfSelectAll.checked = false;
      updateSelectionState();
    });
  }

  // Toolbar Events
  if (pdfSelectAll) {
    pdfSelectAll.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.pdf-check-input');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        toggleCardSelect(cb);
      });
      updateSelectionState();
    });
  }

  if (btnDownloadAll) {
    btnDownloadAll.addEventListener('click', () => downloadImages(currentPdfBlobs)); // All
  }

  if (btnDownloadSelected) {
    btnDownloadSelected.addEventListener('click', () => {
      const selectedIndices = Array.from(document.querySelectorAll('.pdf-check-input:checked'))
        .map(cb => parseInt(cb.dataset.index));
      const selectedBlobs = currentPdfBlobs.filter(item => selectedIndices.includes(item.index));
      downloadImages(selectedBlobs);
    });
  }

  function toggleCardSelect(checkbox) {
    const card = checkbox.closest('.pdf-card');
    if (checkbox.checked) card.classList.add('selected');
    else card.classList.remove('selected');
  }

  function updateSelectionState() {
    const total = currentPdfBlobs.length;
    const checkedCount = document.querySelectorAll('.pdf-check-input:checked').length;

    btnDownloadSelected.innerHTML = `<i data-lucide="check-square"></i> 선택 다운로드 (${checkedCount})`;
    btnDownloadSelected.disabled = checkedCount === 0;

    // Update Master Checkbox
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

  async function handlePdf(file) {
    pdfDropZone.classList.add('hidden');
    pdfResultContainer.innerHTML = '<div class="loader"></div><p style="text-align:center">PDF 변환 중...</p>';
    pdfResultContainer.classList.remove('hidden');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const scale = parseFloat(pdfQualitySelect.value);

      pdfResultContainer.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'pdf-grid';
      pdfResultContainer.appendChild(grid);

      // Reset State
      currentPdfBlobs = [];

      // Update Top Info
      pdfFileName.textContent = file.name;
      pdfPageCount.textContent = `${pdf.numPages} pages`;
      pdfFileInfo.classList.remove('hidden');

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        // To Blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const fileName = `page_${String(i).padStart(3, '0')}.png`;

        // Store state
        currentPdfBlobs.push({ index: i, blob: blob, filename: fileName });

        // Create Card
        const imgUrl = URL.createObjectURL(blob);
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.innerHTML = `
                <div class="pdf-card-check">
                     <label class="custom-checkbox">
                        <input type="checkbox" class="pdf-check-input" data-index="${i}">
                        <span class="checkmark"></span>
                     </label>
                </div>
                <img src="${imgUrl}" loading="lazy" onclick="this.parentElement.querySelector('input').click()">
                <div class="pdf-card-footer">
                     <span>Page ${i}</span>
                     <button class="btn-text small" onclick="openModal({bg_url:'${imgUrl}'}, '${fileName}')"><i data-lucide="eye" size="14"></i></button>
                </div>
              `;
        grid.appendChild(card);

        // Bind individual change event
        const checkbox = card.querySelector('input');
        checkbox.addEventListener('change', (e) => {
          toggleCardSelect(e.target);
          updateSelectionState();
        });
      }

      // Show Toolbar
      pdfToolbar.classList.remove('hidden');
      lucide.createIcons();
      updateSelectionState(); // Init state

      showToast("PDF 변환 완료! 서버에 저장 중...");

      // Auto Upload to Server
      uploadPdfImages(currentPdfBlobs);

    } catch (e) {
      console.error(e);
      showToast("PDF 변환 실패.");
      pdfDropZone.classList.remove('hidden');
      pdfResultContainer.classList.add('hidden');
      pdfFileInfo.classList.add('hidden');
    }
  }

  async function uploadPdfImages(items) {
    if (!items || items.length === 0) return;

    const formData = new FormData();
    items.forEach(item => {
      formData.append('images', item.blob, item.filename);
    });

    try {
      const res = await fetch('/save-pdf-images', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        console.log('Server backup success:', data.folder);
        showToast("서버에 자동 저장되었습니다.");
      } else {
        console.error('Server backup failed:', data);
      }
    } catch (e) {
      console.error('Upload error:', e);
    }
  }

  async function downloadImages(items) {
    if (items.length === 0) return;

    // Multi-file Download (No Zip)
    let count = 0;
    for (const item of items) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(item.blob);
      link.download = item.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      count++;
      // Small delay to prevent browser blocking multiple downloads
      await new Promise(r => setTimeout(r, 300));
    }

    showToast(`${count}개 파일 다운로드 완료`);
  }

  // Handle Tab Switch for PDF
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // ... (Existing logic managed by tabButtons event listener above, we just need to handle visibility)
      // Actually the existing listener just sets currentTab. We need to toggle sections.
      // Let's modify the ORIGINAL listener or add logic here.
      // Wait, the original listener (line 426) only changes styling and title. 
      // We need to hide/show sections.

      const target = btn.dataset.tab;
      if (target === 'pdf-to-png') {
        uploadZone.classList.add('hidden');
        batchControlPanel.classList.add('hidden');
        jobListContainer.classList.add('hidden');
        pdfSection.classList.remove('hidden');
        document.getElementById('resultReconstruct').classList.add('hidden'); // Ensure results hidden
        // Also hide settings? Maybe keep them for consistency or hide if irrelevant.
        // PDF doesn't use settings.
        document.querySelector('.settings-container').classList.add('hidden');
      } else {
        if (jobQueue.queue.length > 0) {
          // If jobs exist
          uploadZone.classList.add('hidden');
          batchControlPanel.classList.remove('hidden');
          jobListContainer.classList.remove('hidden');
        } else {
          uploadZone.classList.remove('hidden');
          batchControlPanel.classList.add('hidden');
          jobListContainer.classList.remove('hidden');
        }
        pdfSection.classList.add('hidden');
        document.querySelector('.settings-container').classList.remove('hidden');
      }
    });
  });
});

// --- Modal Logic (Global) ---
function openModal(data, title, previewOverrideUrl = null) {
  const modal = document.getElementById('previewModal');
  const modalTitle = document.getElementById('modalTitle');
  const container = document.getElementById('modalPreviewContainer');
  // Updated selectors for Bug Fix
  const btnDlHtml = document.getElementById('modalBtnDownloadHtml');
  const btnDlBg = document.getElementById('modalBtnDownloadBg');
  const btnDlPptx = document.getElementById('modalBtnDownloadPptx');

  modalTitle.textContent = title || "Slide Preview";
  container.innerHTML = '';

  // Setup Download Links (Always use data)
  if (data.html_url) {
    btnDlHtml.href = data.html_url;
    btnDlHtml.classList.remove('hidden');
  } else {
    btnDlHtml.classList.add('hidden');
  }

  // PPTX Setup
  if (data.pptx_url && btnDlPptx) {
    btnDlPptx.href = data.pptx_url;
    btnDlPptx.classList.remove('hidden');
  } else if (btnDlPptx) {
    btnDlPptx.classList.add('hidden');
  }

  if (data.bg_url) {
    btnDlBg.href = data.bg_url;
    btnDlBg.setAttribute('download', 'image.png');
    btnDlBg.classList.remove('hidden');
  } else {
    btnDlBg.classList.add('hidden'); // Fix: hide if no bg_url
  }

  // Setup Display Content
  if (previewOverrideUrl) {
    // Show Override (e.g., Original Image)
    container.innerHTML = `<img src="${previewOverrideUrl}" style="width:100%; height:100%; object-fit:contain;">`;
  } else {
    // Default Logic
    if (data.html_url) {
      container.innerHTML = `<iframe src="${data.html_url}" style="width:100%; height:100%; border:none;"></iframe>`;
    } else if (data.bg_url) {
      container.innerHTML = `<img src="${data.bg_url}" style="width:100%; height:100%; object-fit:contain;">`;
    }
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('previewModal').classList.add('hidden');
  document.getElementById('modalPreviewContainer').innerHTML = '';
  document.body.style.overflow = '';
}
document.getElementById('previewModal').addEventListener('click', (e) => { if (e.target.id === 'previewModal') closeModal(); });
window.openModal = openModal;
window.closeModal = closeModal;

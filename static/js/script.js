document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // --- 1. Centralized Settings State ---
  const AppSettings = {
    vision_model: 'gemini-3-flash-preview',
    inpainting_model: 'opencv-telea',
    codegen_model: 'algorithmic',
    output_format: 'both',
    exclude_text: '',
    max_concurrent: 3,
    max_concurrent: 3,
    font_family: 'Malgun Gothic',
    refine_layout: false
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

  // Settings Elements (Legacy Global removed, now dynamic or scoped)
  // We don't need global references anymore for most things, but `loadSettings` will grab them by ID.
  const btnSaveDefaults = document.getElementById('btnSaveDefaults'); // This button might be removed or needs to be re-added to each tab if requested.
  // For now, let's remove the global bindings since elements are gone.


  // Combine Mode Elements
  const combineSection = document.getElementById('combineSection');
  const combineSourceInput = document.getElementById('combineSourceInput');
  const combineBgInput = document.getElementById('combineBgInput');
  const combineSourceList = document.getElementById('combineSourceList');
  const combineBgList = document.getElementById('combineBgList');
  const btnCombineStart = document.getElementById('btnCombineStart');

  let combineSourceFiles = [];
  let combineBgFiles = [];

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
  const btnPptxStart = document.getElementById('btnPptxStart');
  const btnDownloadPptxSimple = document.getElementById('btnDownloadPptxSimple'); // New Button

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
      // Use AppSettings, which we keep matched to the active tab's concurrent setting
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

      // --- Dynamic Settings Retrieval based on Job Context ---
      // Determine which tab/context this job originated from or use currentTab if job doesn't specify
      // JobQueue adds 'type' or we rely on 'currentTab' at the moment of submission? 
      // Issue: If batch is processing and user switches tabs, 'currentTab' changes.
      // Fix: Job object should store the settings snapshot OR the tab it belongs to.
      // Valid Tab Suffixes: 'reconstruct', 'pdf', 'combine', 'removeText'

      let tabSuffix = 'reconstruct'; // Default
      if (job.type === 'combine') tabSuffix = 'combine';
      else if (currentTab === 'pdf-to-pptx' || currentTab === 'pdf-to-png') tabSuffix = 'pdf';
      else if (currentTab === 'remove-text-photoroom') tabSuffix = 'removeText';
      else if (currentTab === 'reconstruct') tabSuffix = 'reconstruct';

      // Helper to safely get value by ID
      const getVal = (key) => {
        const el = document.getElementById(`${key}_${tabSuffix}`);
        return el ? el.value : (AppSettings[key] || ''); // Fallback to AppSettings defaults if element missing
      };

      // Construct Settings
      const vision_model = getVal('visionModel');
      const inpainting_model = getVal('inpaintingModel');
      const codegen_model = getVal('codegenModel');
      const output_format = getVal('outputFormat');
      const font_family = getVal('fontFamily');
      const refine_layout = getVal('refineLayout');
      // max_concurrent is global queue limit? Or per tab? 
      // JobQueue logic uses 'maxConcurrent' getter. We should update that getter to use valid source.
      // But for formData, we can send it.

      formData.append('vision_model', vision_model);
      formData.append('batch_folder', job.batchFolder);
      formData.append('exclude_text', AppSettings.exclude_text); // Keeping global for now or hidden
      formData.append('font_family', font_family);
      formData.append('max_concurrent', getVal('maxConcurrent'));
      formData.append('refine_layout', refine_layout);

      let endpoint = '/upload';
      if (job.type === 'combine') {
        endpoint = '/combine-upload';
        formData.append('source_file', job.sourceFile);
        formData.append('background_file', job.bgFile);
        formData.delete('file');
      } else if (currentTab === 'reconstruct') {
        endpoint = '/upload';
        formData.append('inpainting_model', inpainting_model);
        formData.append('codegen_model', codegen_model);
      } else if (currentTab === 'pdf-to-pptx') {
        // PDF is special, usually handled by handlePdf, not runJob directly for conversion?
        // Check handlePdf... PDF logic uses 'btnPptxStart' which calls 'uploadAndConvertPdf'.
        // So runJob here is mostly for 'reconstruct' (images) and 'combine'.
        // PDF tab uses its own logic. We need to update that too.
      } else if (currentTab === 'remove-text-photoroom') {
        // Photoroom uses its own embedded script? 
        // Yes, index.html has embedded script for Photoroom.
        // But we should support it here if we migrate control.
        // For now, Photoroom is separate.
      } else if (currentTab === 'remove-text') {
        endpoint = '/remove-text';
        formData.append('inpainting_model', inpainting_model);
      } else if (currentTab === 'remove-text-ai') {
        endpoint = '/remove-text-ai';
      } else if (currentTab === 'extract-text') {
        endpoint = '/extract-text';
      }


      try {
        const response = await fetch(endpoint, { method: 'POST', body: formData });
        if (!response.ok) throw new Error('서버 오류');
        const data = await response.json();

        // Check for processing status to start polling (Generic check)
        if (data.status === 'processing') {
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

        // Handle file reference for Preview/Original button
        const fileRef = job.file || job.sourceFile;
        const fileName = fileRef ? fileRef.name : 'unknown';
        let originalUrl = '';
        try {
          if (fileRef) originalUrl = URL.createObjectURL(fileRef);
        } catch (e) { console.warn("URL creation failed", e); }

        // Prepare safe data object for onclick
        const safeData = { html_url: data.html_url, bg_url: data.bg_url, pptx_url: data.pptx_url };
        const dataStr = JSON.stringify(safeData).replace(/"/g, "&quot;");

        actionsDiv.innerHTML += `<button class="btn-secondary small" onclick="openModal(${dataStr}, '${fileName} (원본)', '${originalUrl}')"><i data-lucide="image" size="14"></i> 원본</button>`;

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
          const fileRef = job.file || job.sourceFile;
          const fileName = fileRef ? fileRef.name : 'Preview';
          previewContainer.onclick = () => openModal(data, fileName);
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

      // Toggle visibility of status detail text & progress bar
      const progressWrapper = job.element.querySelector('.job-progress-wrapper');
      if (status === 'complete') {
        detail.style.display = 'none';
        if (progressWrapper) progressWrapper.style.display = 'none';
      } else {
        detail.style.display = 'block';
        if (progressWrapper) progressWrapper.style.display = 'block';
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

      // Hide progress bar if 100%
      const progressContainer = document.querySelector('.progress-container');
      if (progressContainer) {
        if (percent >= 100 && total > 0) {
          progressContainer.style.display = 'none';
        } else {
          progressContainer.style.display = 'block';
        }
      }

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

  // Helper: Update PDF UI from specific settings object
  function updatePdfUi(settingsObj) {
    if (!settingsObj) return;
    const setVal = (key, val) => {
      const el = document.getElementById(`${key}_pdf`);
      if (el) {
        if (key === 'refineLayout') el.value = val.toString();
        else el.value = val;
      }
    };
    if (settingsObj.vision_model) setVal('visionModel', settingsObj.vision_model);
    if (settingsObj.inpainting_model) setVal('inpaintingModel', settingsObj.inpainting_model);
    if (settingsObj.codegen_model) setVal('codegenModel', settingsObj.codegen_model);
    if (settingsObj.output_format) setVal('outputFormat', settingsObj.output_format);
    if (settingsObj.font_family) setVal('fontFamily', settingsObj.font_family);
    if (settingsObj.max_concurrent) setVal('maxConcurrent', settingsObj.max_concurrent);
    if (settingsObj.refine_layout !== undefined) setVal('refineLayout', settingsObj.refine_layout);

    if (settingsObj.pdf_quality) {
      const pq = document.getElementById('pdfQuality');
      if (pq) pq.value = settingsObj.pdf_quality;
    }
  }

  // Load Settings from Server
  // Load Settings from Server and Populate All Tabs
  async function loadSettings() {
    try {
      const res = await fetch('/settings');
      if (res.ok) {
        const settings = await res.json();

        // Helper to fill UI from a specific section
        const fillParam = (sectionName, suffix) => {
          const section = settings[sectionName] || {};
          const setVal = (key, val) => {
            const el = document.getElementById(`${key}_${suffix}`);
            if (el) {
              if (key === 'refineLayout') el.value = val.toString();
              else el.value = val;
            }
          };

          if (section.vision_model) setVal('visionModel', section.vision_model);
          if (section.inpainting_model) setVal('inpaintingModel', section.inpainting_model);
          if (section.codegen_model) setVal('codegenModel', section.codegen_model);
          if (section.output_format) setVal('outputFormat', section.output_format);
          if (section.font_family) setVal('fontFamily', section.font_family);
          if (section.max_concurrent) setVal('maxConcurrent', section.max_concurrent);
          if (section.refine_layout !== undefined) setVal('refineLayout', section.refine_layout);
        };

        // Fill Reconstruct Tab
        fillParam('reconstruct', 'reconstruct');
        // Fill PDF Tab (Default to stored current PDF tab or just PPTX)
        updatePdfUi(settings.pdf_pptx);

        // Combine Tab (uses reconstruct settings or common? historically reconstruct)
        fillParam('reconstruct', 'combine');

        // Common Settings handled? (None visible in UI yet except maybe exclude_text but no input for it)

        // Update Photoroom Mode
        if (settings.photoroom && settings.photoroom.mode) {
          const prMode = document.getElementById('textRemovalMode_photoroom');
          if (prMode) prMode.value = settings.photoroom.mode;
        }

        // Global Sync (Keep explicit split in AppSettings or just store raw?)
        // Let's store raw for reference
        Object.assign(AppSettings, settings);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }

  // Save Settings to Server
  async function saveSettings() {
    // Identify Context
    const tab = currentTab;
    let section = 'reconstruct'; // default
    // Explicit PDF Split
    if (tab === 'pdf-to-pptx') section = 'pdf_pptx';
    else if (tab === 'pdf-to-png') section = 'pdf_png';
    else if (tab.includes('photoroom') || tab === 'remove-text-photoroom') section = 'photoroom';

    // If we are in 'combine', we probably save to 'reconstruct' or 'common'? Let's stick to reconstruct for now.

    // Suffix resolution for UI Element ID
    let suffix = 'reconstruct';
    if (section === 'pdf_pptx' || section === 'pdf_png') suffix = 'pdf';

    // Helper to get value from UI
    const getVal = (key) => {
      const el = document.getElementById(`${key}_${suffix}`);
      return el ? el.value : null;
    };

    let payload = {};

    if (section === 'photoroom') {
      const prMode = document.getElementById('textRemovalMode_photoroom');
      payload = {
        "photoroom": {
          "mode": prMode ? prMode.value : "ai.all"
        }
      };
    } else {
      // Construct Section Payload
      const sectionData = {
        vision_model: getVal('visionModel'),
        inpainting_model: getVal('inpaintingModel'),
        codegen_model: getVal('codegenModel'),
        output_format: getVal('outputFormat'),
        max_concurrent: parseInt(getVal('maxConcurrent')) || 3,
        font_family: getVal('fontFamily'),
        refine_layout: getVal('refineLayout') === 'true'
      };
      // Exclude text is common?
      // if (AppSettings.common) payload.common = ...

      payload[section] = sectionData;
    }

    try {
      const res = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        // Calculate Changes and Show Toast
        const changes = [];
        const labelMap = {
          'vision_model': '비전 모델',
          'inpainting_model': '인페인팅 모델',
          'codegen_model': 'HTML생성 모델',
          'output_format': '출력 포맷',
          'max_concurrent': '동시 처리 개수',
          'font_family': '글꼴',
          'refine_layout': '정밀 분석 모드',
          'mode': '텍스트 제거 모드'
        };

        // Compare payload with current AppSettings[section]
        const targetSection = Object.keys(payload)[0]; // 'reconstruct', 'pdf', or 'photoroom'
        const newData = payload[targetSection];
        const oldData = AppSettings[targetSection] || {};

        for (const [key, val] of Object.entries(newData)) {
          if (oldData[key] != val) {
            const label = labelMap[key] || key;
            changes.push(`${label}: ${val}`);
          }
        }

        if (changes.length > 0) {
          showToast(`✅ [${targetSection}] ${changes.join(', ')} (으)로 저장되었습니다.`);
        } else {
          showToast('✅ 변경된 내용이 없습니다.');
        }

        // Update Local State
        if (!AppSettings[targetSection]) AppSettings[targetSection] = {};
        Object.assign(AppSettings[targetSection], newData);
      }
      else showToast('❌ 설정 저장 실패.');
    } catch (e) { showToast('❌ 설정 저장 중 오류가 발생했습니다.'); }
  }

  // Bind UI Changes? No, we read on demand in runJob.
  // Exception: maxConcurrent might change immediate queue behavior.
  // If we want dynamic maxConcurrent updates:
  const bindMaxConcurrent = (suffix) => {
    const el = document.getElementById(`maxConcurrent_${suffix}`);
    if (el) {
      el.addEventListener('change', (e) => {
        // Update AppSettings if checking globally? 
        // JobQueue checks 'AppSettings.max_concurrent'.
        // We should update that if the active tab changes it.
        if (getTabSuffix(currentTab) === suffix) {
          AppSettings.max_concurrent = parseInt(e.target.value);
          jobQueue.processQueue();
        }
      });
    }
  };
  ['reconstruct', 'pdf', 'combine'].forEach(bindMaxConcurrent);

  // Helper to get suffix from tab name
  function getTabSuffix(tab) {
    if (tab === 'combine') return 'combine';
    if (tab === 'pdf-to-pptx' || tab === 'pdf-to-png') return 'pdf';
    if (tab === 'remove-text-photoroom') return 'removeText';
    return 'reconstruct';
  }

  // Update AppSettings.max_concurrent on tab switch
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // ... existing logic ...
      const suffix = getTabSuffix(btn.dataset.tab);
      const el = document.getElementById(`maxConcurrent_${suffix}`);
      if (el) {
        AppSettings.max_concurrent = parseInt(el.value);
        jobQueue.processQueue();
      }
    });
  });



  // --- Initial Load ---
  loadSettings();

  // --- Combine Logic ---
  if (combineSourceInput) {
    combineSourceInput.addEventListener('change', (e) => {
      combineSourceFiles = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      updateCombineUI();
    });
  }
  if (combineBgInput) {
    combineBgInput.addEventListener('change', (e) => {
      combineBgFiles = Array.from(e.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      updateCombineUI();
    });
  }

  // Drag & Drop for Combine
  const setupCombineDragDrop = (boxId, updateFn) => {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.style.borderColor = 'var(--accent)';
      box.style.background = 'rgba(255,255,255,0.08)';
    });
    box.addEventListener('dragleave', () => {
      box.style.borderColor = 'var(--border)';
      box.style.background = 'rgba(255,255,255,0.03)';
    });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.style.borderColor = 'var(--border)';
      box.style.background = 'rgba(255,255,255,0.03)';
      if (e.dataTransfer.files.length) {
        updateFn(Array.from(e.dataTransfer.files));
        updateCombineUI();
      }
    });
  };

  setupCombineDragDrop('combineSourceBox', (files) => { combineSourceFiles = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); });
  setupCombineDragDrop('combineBgBox', (files) => { combineBgFiles = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); });

  function updateCombineUI() {
    const renderList = (files, container) => {
      container.innerHTML = files.map(f => {
        const isImage = f.type.startsWith('image/');
        let content = '';

        if (isImage) {
          const url = URL.createObjectURL(f);
          content = `<img src="${url}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; margin-bottom: 0.5rem;">`;
        } else {
          content = `<div style="width: 100%; height: 100px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 0.5rem;"><i data-lucide="file-text" size="32" style="color: var(--text-secondary)"></i></div>`;
        }

        return `
            <div class="file-thumb-card" title="${f.name}" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; text-align: center;">
                ${content}
                <div class="thumb-name" style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.name}</div>
            </div>`;
      }).join('');
    };

    renderList(combineSourceFiles, combineSourceList);
    renderList(combineBgFiles, combineBgList);
    lucide.createIcons();

    const isValid = combineSourceFiles.length > 0 && combineBgFiles.length > 0;
    btnCombineStart.disabled = !isValid;
  }

  if (btnCombineStart) {
    btnCombineStart.addEventListener('click', async () => {
      // Validation: Count Check
      // Logic: 
      // 1. If PDF vs PDF -> Page Count check (Hard to do client side without parsing, for now assume user responsibility or server fail)
      // 2. If Images -> Count match

      // Simple Count Check for Images
      const sourceIsPdf = combineSourceFiles.some(f => f.type === 'application/pdf');
      const bgIsPdf = combineBgFiles.some(f => f.type === 'application/pdf');

      if (!sourceIsPdf && !bgIsPdf) {
        if (combineSourceFiles.length !== combineBgFiles.length) {
          showCombineMismatchModal('count', [], `원본(${combineSourceFiles.length}개)과 배경(${combineBgFiles.length}개)의 파일 개수가 다릅니다.`);
          return;
        }

        // Name Matching Check (Optional but recommended)
        // Sort both and assume alignment or check names?
        // Implementation Plan says: "System compares count and names"
        // Let's do a loose name match check? Or just trust sorting? 
        // User requested "Show detailed mismatch in modal". 
        // Let's assume user expects 1:1 filename matching logic (ignoring extension or suffix).

        // BUT, user often has: slide_1.png vs slide_1_clean.png
        // Simple check: Sort and pair. If user wants name validation, we implement it. 
        // Plan said: "Name matching failure -> alert". 
        // So we should try to match.

        // Let's SKIP strict name matching for now to be flexible, OR warn if very different.
        // Actually, trusting sort is safer if naming is consistent.
        // We will just enforce Count Equality here.
      }

      // Start Processing using JobQueue directly? 
      // No, endpoint is /combine-upload. JobQueue is for /upload (single file per job).
      // We need to adapt JobQueue or create a wrapper. 
      // Strategy: "Combine" endpoint splits pairs and returns tasks?
      // Or we utilize JobQueue to send pairs?
      // The current JobQueue sends 1 file per request.
      // We need to send 2 files per request for Combine.

      // Solution: Extend JobQueue to handle "CombineJob".
      // Or simpler: Manually create jobs in queue that hit a different endpoint.

      // 1. Prepare Pairs
      let pairs = [];
      if (sourceIsPdf || bgIsPdf) {
        pairs.push({ source: combineSourceFiles[0], bg: combineBgFiles[0], name: combineSourceFiles[0].name });
      } else {
        // Image Case: Create N jobs
        const sortedSource = combineSourceFiles.sort((a, b) => a.name.localeCompare(b.name));
        const sortedBg = combineBgFiles.sort((a, b) => a.name.localeCompare(b.name));

        const mismatches = [];

        for (let i = 0; i < sortedSource.length; i++) {
          const s = sortedSource[i];
          const b = sortedBg[i];
          pairs.push({ source: s, bg: b, name: s.name });

          // Simple Name Check: Check if base names have significant overlap
          // Heuristic: remove extension, remove commonly used suffix like 'clean', 'bg', 'background'
          const cleanName = (name) => name.toLowerCase().replace(/\.(png|jpg|jpeg|webp)$/, '').replace(/(_clean|_bg|_background|_removed)$/, '');
          const sName = cleanName(s.name);
          const bName = cleanName(b.name);

          // Check inclusion or Levenshtein (too complex?) -> Check inclusion
          if (!sName.includes(bName) && !bName.includes(sName)) {
            mismatches.push(`${s.name} <-> ${b.name}`);
          }
        }

        // If mismatches found, warn user
        if (mismatches.length > 0) {
          showCombineMismatchModal('name', mismatches, "파일명이 서로 일치하지 않는 것 같습니다. 계속 진행하시겠습니까?", () => {
            // On Confirm
            closeModal();
            processCombinePairs(pairs);
          });
          return;
        }
      }

      // No issues, proceed
      processCombinePairs(pairs);
    });
  }

  function processCombinePairs(pairs) {
    if (jobQueue.queue.length === 0 && jobQueue.activeCount === 0) {
      combineSection.classList.add('hidden');
      batchControlPanel.classList.remove('hidden');
      jobListContainer.classList.remove('hidden');
    }

    // Batch Folder Name
    const now = new Date();
    const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const batchFolder = `combine_${timeStr}`;
    jobQueue.latestBatchFolder = batchFolder;

    pairs.forEach(pair => {
      const jobId = 'job-c-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      // Custom Job Object
      const job = {
        id: jobId,
        type: 'combine', // Marker
        sourceFile: pair.source,
        bgFile: pair.bg,
        status: 'pending',
        element: jobQueue.createJobCard(jobId, `[조합] ${pair.name}`),
        batchFolder: batchFolder
      };
      jobQueue.queue.push(job);
      jobListContainer.appendChild(job.element);
    });

    lucide.createIcons();
    jobQueue.updateGlobalProgress();
    jobQueue.processQueue();
  }

  // Mismatch Modal
  function showCombineMismatchModal(type, details, message, onConfirm = null) {
    const modal = document.getElementById('previewModal'); // Reuse preview modal or create new?
    // Reuse logic but custom content
    const modalTitle = document.getElementById('modalTitle');
    const modalContainer = document.getElementById('modalPreviewContainer');
    const modalFooter = document.querySelector('.modal-footer');

    modalTitle.textContent = "⚠️ 파일 매칭 주의";
    modalContainer.innerHTML = `
        <div style="text-align: center; padding: 1rem;">
            <p style="font-size: 1.1rem; font-weight: bold; margin-bottom: 1rem; color: #ef4444;">${message}</p>
            ${details.length > 0 ? `
                <div style="text-align: left; background: #fff1f2; padding: 1rem; border-radius: 8px; max-height: 200px; overflow-y: auto; text-align: left; border: 1px solid #fecaca;">
                    <strong style="color: #991b1b;">상세 내역 (원본 <-> 배경):</strong>
                    <ul style="margin-top: 0.5rem; padding-left: 1.5rem; color: #7f1d1d; font-size: 0.9rem;">
                        ${details.map(d => `<li>${d}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
      `;

    // Hide standard footer buttons, show simple confirm
    Array.from(modalFooter.children).forEach(c => c.classList.add('hidden'));

    // Clear previous custom buttons if any
    const existingCustoms = modalFooter.querySelectorAll('.custom-modal-btn');
    existingCustoms.forEach(c => c.remove());

    if (onConfirm) {
      let cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-secondary small custom-modal-btn';
      cancelBtn.innerText = '취소';
      cancelBtn.onclick = () => {
        closeModal();
        restoreFooter();
      };

      let confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn-primary small custom-modal-btn';
      confirmBtn.innerText = '계속 진행';
      confirmBtn.onclick = onConfirm;

      modalFooter.appendChild(cancelBtn);
      modalFooter.appendChild(confirmBtn);
    } else {
      let closeBtn = document.createElement('button');
      closeBtn.className = 'btn-secondary small custom-modal-btn';
      closeBtn.innerText = '확인';
      closeBtn.onclick = () => {
        closeModal();
        restoreFooter();
      };
      modalFooter.appendChild(closeBtn);
    }

    modal.classList.remove('hidden');

    function restoreFooter() {
      Array.from(modalFooter.children).forEach(c => {
        if (c.classList.contains('custom-modal-btn')) c.remove();
        else if (!c.id.includes('Download')) c.classList.remove('hidden');
      });
    }
  }



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

      // Switch PDF Settings UI based on tab
      if (currentTab === 'pdf-to-pptx') {
        updatePdfUi(AppSettings.pdf_pptx);
      } else if (currentTab === 'pdf-to-png') {
        updatePdfUi(AppSettings.pdf_png);
      }

      const titles = {
        'reconstruct': '재구성을 위한 슬라이드 이미지 업로드',
        'pdf-to-pptx': 'PDF 업로드 -> 이미지 변환 -> 슬라이드 재구성',
        'pdf-to-png': 'PDF to PNG 변환 (단순 변환)',
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
  window.showToast = showToast;

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
      // Fixed: Default to 3.0 (HD) if element is hidden/removed
      const scale = pdfQualitySelect ? parseFloat(pdfQualitySelect.value) : 3.0;

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

  // New Function for Simple PPTX Download
  if (btnDownloadPptxSimple) {
    btnDownloadPptxSimple.addEventListener('click', async () => {
      if (currentPdfBlobs.length === 0) {
        showToast('변환된 데이터가 없습니다.');
        return;
      }

      // Determine targets: Selected or All
      const selectedIndices = Array.from(document.querySelectorAll('.pdf-check-input:checked'))
        .map(cb => parseInt(cb.dataset.index));

      // If selections exist, filter. Else take ALL.
      let targetBlobs = [];
      if (selectedIndices.length > 0) {
        targetBlobs = currentPdfBlobs.filter(item => selectedIndices.includes(item.index));
      } else {
        targetBlobs = currentPdfBlobs;
      }

      if (targetBlobs.length === 0) {
        showToast('다운로드할 이미지가 없습니다.');
        return;
      }

      // UI Feedback
      const originalText = btnDownloadPptxSimple.innerHTML;
      btnDownloadPptxSimple.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> 생성 중...`;
      btnDownloadPptxSimple.disabled = true;

      try {
        // --- Client-Side PPTX Generation (PptxGenJS) ---
        // Requires: <script src="https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"></script>

        const pptx = new PptxGenJS();

        // Settings to match standard 16:9 
        // PptxGenJS default is 16:9 (10 x 5.625 inches)

        // Loop through images and add slides
        for (const item of targetBlobs) {
          const slide = pptx.addSlide();

          // Create Object URL for the blob
          const imgUrl = URL.createObjectURL(item.blob);

          // Add Image to Slide (Cover)
          // x, y, w, h in inches (or percentage '100%')
          // PptxGenJS supports data URLs or paths. Blob URL works in modern browsers.
          slide.addImage({
            path: imgUrl,
            x: 0,
            y: 0,
            w: '100%',
            h: '100%'
          });

          // Note: We should revoke URL later, but PptxGenJS needs it during generation. 
          // It's tricky to know when it's done reading. 
          // Usually fine to let browser handle cleanup on page unload or keep small number.
        }

        // Generate and Download
        const now = new Date();
        const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const filename = `PDF_Slides_${timeStr}.pptx`;

        await pptx.writeFile({ fileName: filename });

        showToast(`PPTX 다운로드 완료! (${targetBlobs.length} 페이지)`);

      } catch (e) {
        console.error(e);
        showToast('PPTX 생성 중 오류가 발생했습니다.');
      } finally {
        btnDownloadPptxSimple.innerHTML = originalText;
        btnDownloadPptxSimple.disabled = false;
        lucide.createIcons({ root: btnDownloadPptxSimple });
      }
    });
  }

  // Handle Tab Switch for PDF
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update Active State
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;

      // 1. HIDDEN ALL SECTIONS (Reset)
      const reconstructSection = document.getElementById('reconstructSection');
      const removeTextPhotoroomSection = document.getElementById('removeTextPhotoroomSection');

      if (reconstructSection) reconstructSection.classList.add('hidden');
      if (pdfSection) pdfSection.classList.add('hidden');
      if (combineSection) combineSection.classList.add('hidden');
      if (removeTextPhotoroomSection) removeTextPhotoroomSection.classList.add('hidden');

      if (batchControlPanel) batchControlPanel.classList.add('hidden');
      if (jobListContainer) jobListContainer.classList.add('hidden');

      // Update Title (Legacy support)
      const titles = {
        'reconstruct': '재구성을 위한 슬라이드 이미지 업로드',
        'pdf-to-pptx': 'PDF 업로드 -> 이미지 변환 -> 슬라이드 재구성',
        'pdf-to-png': 'PDF to PNG 변환 (단순 변환)',
        'remove-text': '텍스트 제거를 위한 이미지 업로드 (OpenCV)',
        'remove-text-ai': '텍스트 제거를 위한 이미지 업로드 (AI)',
        'remove-text-photoroom': '이미지 텍스트 제거 (Photoroom)',
        'extract-text': '텍스트 추출을 위한 이미지 업로드'
      };
      const titleEl = document.getElementById('uploadTitle');
      if (titleEl) titleEl.textContent = titles[currentTab] || '이미지 업로드';


      // 2. SHOW CURRENT SECTION
      if (currentTab === 'pdf-to-png') {
        // PDF Mode
        pdfSection.classList.remove('hidden');
        if (btnPptxStart) btnPptxStart.classList.add('hidden');

      } else if (currentTab === 'pdf-to-pptx') {
        // PDF to PPTX Mode
        pdfSection.classList.remove('hidden');
        if (btnPptxStart) btnPptxStart.classList.remove('hidden');

      } else if (currentTab === 'combine') {
        combineSection.classList.remove('hidden');

      } else if (currentTab === 'remove-text-photoroom') {
        if (removeTextPhotoroomSection) removeTextPhotoroomSection.classList.remove('hidden');

      } else {
        // Standard Reconstruction (reconstruct)
        // Ensure Parent is Visible
        if (reconstructSection) reconstructSection.classList.remove('hidden');

        // Ensure Child Settings is Visible (in case it was hidden previously)
        const reconstructSettings = document.getElementById('reconstructSettings');
        if (reconstructSettings) reconstructSettings.classList.remove('hidden');

        // Manage Upload vs Queue Visibility
        if (jobQueue.queue.length > 0) {
          // If jobs exist, show Queue, Hide Upload Panel
          batchControlPanel.classList.remove('hidden');
          jobListContainer.classList.remove('hidden');
          if (uploadZone) uploadZone.classList.add('hidden');
        } else {
          // If no jobs, Show Upload Panel
          if (uploadZone) uploadZone.classList.remove('hidden');
          jobListContainer.classList.remove('hidden'); // Keep list visible if empty? or hidden? Previously removed hidden.
        }
      }
    });

    // --- PDF to PPTX Trigger ---
    if (btnPptxStart) {
      btnPptxStart.addEventListener('click', () => {
        if (currentPdfBlobs.length === 0) {
          showToast('변환된 PDF 페이지가 없습니다.');
          return;
        }

        if (!confirm(`${currentPdfBlobs.length}개의 페이지를 슬라이드로 재구성하시겠습니까?`)) return;

        // Convert Blobs to Files
        const files = currentPdfBlobs.map(item => {
          return new File([item.blob], item.filename, { type: 'image/png' });
        });

        // Add to Queue
        jobQueue.addFiles(files);

        // Switch View similar to "reconstruct" tab
        // Note: we stay on "pdf-to-pptx" tab visually, but show the queue
        pdfSection.classList.add('hidden');
        batchControlPanel.classList.remove('hidden');
        jobListContainer.classList.remove('hidden');

        showToast('슬라이드 재구성 작업이 시작되었습니다.');
      });
    }

    // Initial UI Sync (Trigger click on default active tab)
    const initialActive = document.querySelector('.tab-btn.active');
    if (initialActive) initialActive.click();

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

  // --- API Key Settings Modal Logic ---
  ; (function () {
    const settingsModal = document.getElementById('settingsModal');
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const apiKeyCopyMsg = document.getElementById('apiKeyCopyMsg');

    // New Buttons
    const btnCopyApiKey = document.getElementById('btnCopyApiKey');
    const btnModEdit = document.getElementById('btnModEdit');
    const btnModSave = document.getElementById('btnModSave');
    const btnModCancel = document.getElementById('btnModCancel');

    let currentRealApiKey = "";

    // 1. Define Functions First (Assign to window for global access logic)

    window.closeSettingsModal = function () {
      settingsModal.classList.add('hidden');
      cancelEditApiKey();
    };

    window.openSettingsModal = async function () {
      settingsModal.classList.remove('hidden');
      apiKeyStatus.textContent = "API Key를 불러오는 중...";
      try {
        const res = await fetch('/api-key');
        if (res.ok) {
          const data = await res.json();
          currentRealApiKey = data.api_key || "";
          displayMaskedKey(currentRealApiKey);
          apiKeyStatus.textContent = "";
        } else {
          apiKeyStatus.textContent = "API Key 로드 실패";
        }
      } catch (e) {
        console.error(e);
        apiKeyStatus.textContent = "서버 통신 오류";
      }
    };

    window.saveApiKey = async function () {
      const newKey = apiKeyInput.value.trim();
      if (!newKey) {
        apiKeyStatus.textContent = "API Key를 입력해주세요.";
        return;
      }
      apiKeyStatus.textContent = "저장 중...";
      try {
        const res = await fetch('/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: newKey })
        });
        const data = await res.json();
        if (res.ok) {
          currentRealApiKey = newKey;
          // Go back to view mode
          cancelEditApiKey();
          displayMaskedKey(currentRealApiKey);
          apiKeyStatus.textContent = "저장되었습니다.";
          showToast("✅ API Key가 업데이트되었습니다.");
        } else {
          apiKeyStatus.textContent = `저장 실패: ${data.message}`;
        }
      } catch (e) {
        console.error(e);
        apiKeyStatus.textContent = "저장 중 오류 발생";
      }
    };

    // Test API Key Logic
    window.testApiKey = async function () {
      const keyToTest = apiKeyInput.readOnly ? currentRealApiKey : apiKeyInput.value.trim();
      const testResultBox = document.getElementById('apiTestResult');
      const testStatusIcon = document.getElementById('testStatusIcon');
      const testResponseText = document.getElementById('testResponseText');

      if (!keyToTest) {
        showToast("⚠️ 테스트할 API 키가 없습니다.");
        return;
      }

      // Get currently selected model name for display
      const selectedModel = document.getElementById('visionModel').value || "gemini-3-flash-preview";

      // UI Reset
      testResultBox.classList.remove('hidden');
      testStatusIcon.textContent = `⏳ API 연결 테스트 중... (${selectedModel})`;
      testStatusIcon.style.color = "var(--text-primary)";
      testResponseText.textContent = "";

      try {
        const res = await fetch('/test-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: keyToTest })
        });
        const data = await res.json();

        if (res.ok) {
          testStatusIcon.textContent = "✅ 테스트 성공";
          testStatusIcon.style.color = "var(--success)";
          testResponseText.textContent = `응답: "${data.response}"`;
        } else {
          testStatusIcon.textContent = "❌ 테스트 실패";
          testStatusIcon.style.color = "var(--error)";
          testResponseText.textContent = data.message + (data.details ? ` (${data.details})` : "");
        }
      } catch (e) {
        testStatusIcon.textContent = "❌ 통신 오류";
        testStatusIcon.style.color = "var(--error)";
        testResponseText.textContent = String(e);
      }
    };

    window.cancelEditApiKey = function () {
      displayMaskedKey(currentRealApiKey);
      apiKeyInput.readOnly = true;
      apiKeyInput.style.borderColor = "var(--border)";

      // UI Toggle: Hide Save/Cancel, Show Edit/Test
      btnModSave.classList.add('hidden');
      btnModCancel.classList.add('hidden');
      btnModEdit.classList.remove('hidden');
      const btnModTest = document.getElementById('btnModTest');
      if (btnModTest) btnModTest.classList.remove('hidden');

      // Hide Test Result on Cancel/Reset
      const resBox = document.getElementById('apiTestResult');
      if (resBox) resBox.classList.add('hidden');

      apiKeyStatus.textContent = "";
    };

    window.enableEditApiKey = function () {
      apiKeyInput.value = currentRealApiKey;
      apiKeyInput.readOnly = false;
      apiKeyInput.focus();
      apiKeyInput.style.borderColor = "var(--accent)";

      // UI Toggle: Show Save/Cancel, Hide Edit/Test
      btnModSave.classList.remove('hidden');
      btnModCancel.classList.remove('hidden');
      btnModEdit.classList.add('hidden');
      const btnModTest = document.getElementById('btnModTest');
      if (btnModTest) btnModTest.classList.add('hidden');

      // Hide Test Result when starting edit to avoid confusion
      const resBox = document.getElementById('apiTestResult');
      if (resBox) resBox.classList.add('hidden');

      apiKeyStatus.textContent = "새로운 키를 입력(수정)하세요.";
    };

    function copyApiKey() {
      if (!currentRealApiKey) return;
      navigator.clipboard.writeText(currentRealApiKey).then(() => {
        // Inline Feedback Message
        apiKeyCopyMsg.textContent = "API 키가 클립보드에 복사되었습니다";
        apiKeyCopyMsg.classList.add('fade-in');

        // Auto-hide after 2 seconds
        setTimeout(() => {
          apiKeyCopyMsg.classList.remove('fade-in');
          // Clear text after fade out (approx 300ms transition)
          setTimeout(() => { apiKeyCopyMsg.textContent = ""; }, 300);
        }, 2000);
      });
    }

    function displayMaskedKey(key) {
      if (!key) {
        apiKeyInput.value = "(설정된 키 없음)";
        return;
      }
      if (key.length < 10) {
        apiKeyInput.value = "******";
        return;
      }
      const prefix = key.substring(0, 6);
      const suffix = key.substring(key.length - 4);
      apiKeyInput.value = `${prefix}...${"•".repeat(10)}...${suffix}`;
    }

    // 2. Bind Listeners
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', window.openSettingsModal);
    }

    if (btnCopyApiKey) btnCopyApiKey.addEventListener('click', copyApiKey);

    // New Footer Button Listeners
    if (btnModEdit) btnModEdit.addEventListener('click', window.enableEditApiKey);
    if (btnModCancel) btnModCancel.addEventListener('click', window.cancelEditApiKey);
    if (btnModSave) btnModSave.addEventListener('click', window.saveApiKey);

    const btnModTest = document.getElementById('btnModTest');
    if (btnModTest) btnModTest.addEventListener('click', window.testApiKey);

    // Expose functions to global scope for HTML onclick access
    window.saveSettings = saveSettings;
    window.openSettingsModal = openSettingsModal;
    window.closeSettingsModal = closeSettingsModal;
    window.enableEditApiKey = enableEditApiKey;
    window.cancelEditApiKey = cancelEditApiKey;
    window.saveApiKey = saveApiKey;
    window.testApiKey = testApiKey;
    window.copyApiKey = copyApiKey;

  })();

});

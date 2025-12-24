document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons(); // Initialize static icons

  // --- Elements ---
  const uploadZone = document.getElementById('uploadSection');
  const fileInput = document.getElementById('fileInput');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const retryButtons = document.querySelectorAll('.btn-retry');
  const jobListContainer = document.getElementById('jobList');

  // Batch Controls
  const batchControlPanel = document.getElementById('batchControlPanel');
  const btnPause = document.getElementById('btnPause');
  const btnResume = document.getElementById('btnResume');
  const btnStop = document.getElementById('btnStop');
  const batchProgressBar = document.getElementById('batchProgressBar');
  const batchStatusText = document.getElementById('batchStatusText');

  // Settings
  const visionModelSelect = document.getElementById('visionModel');
  const inpaintingModelSelect = document.getElementById('inpaintingModel');
  const codegenModelSelect = document.getElementById('codegenModel');
  const btnSaveDefaults = document.getElementById('btnSaveDefaults');

  let currentTab = 'reconstruct'; // reconstruct, remove-text, remove-text-ai, extract-text

  // --- Job Queue Class ---
  class JobQueue {
    constructor(maxConcurrent = 3) {
      this.queue = [];      // Array of job objects {id, file, status, element, ...}
      this.activeCount = 0;
      this.maxConcurrent = maxConcurrent;
      this.isPaused = false;
    }

    addFiles(files) {
      if (this.queue.length === 0 && this.activeCount === 0) {
        // First batch, show UI
        uploadZone.classList.add('hidden');
        batchControlPanel.classList.remove('hidden');
      }

      // Unified Output Logic
      const now = new Date();
      const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
      const batchFolder = files.length > 1 ? `multi_${timeStr}` : 'single';

      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;

        const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const job = {
          id: jobId,
          file: file,
          status: 'pending', // pending, processing, complete, error
          element: this.createJobCard(jobId, file.name),
          batchFolder: batchFolder // Store for API call
        };

        this.queue.push(job);
        jobListContainer.appendChild(job.element);
      });

      lucide.createIcons(); // Refresh icons for new cards

      this.updateGlobalProgress();
      this.processQueue();
    }

    createJobCard(id, filename) {
      const div = document.createElement('div');
      div.className = 'job-card'; // Layout handles vertical automatically via CSS
      div.id = id;
      div.innerHTML = `
                <div class="job-header">
                    <div class="job-info">
                        <div class="job-title">${filename}</div>
                        <div class="job-meta">
                            <span class="job-badge pending"><i data-lucide="clock" size="14"></i> 대기 중</span>
                            <span class="status-detail">대기열 등록됨</span>
                        </div>
                        <div class="job-progress-wrapper">
                            <div class="job-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
                <div class="job-actions">
                    <!-- Actions injected dynamically -->
                </div>
                <!-- Preview Container (Initially Empty) -->
                <div class="job-preview-container hidden" style="display: none;"></div>
            `;
      return div;
    }

    async processQueue() {
      if (this.isPaused) return;
      if (this.activeCount >= this.maxConcurrent) return;

      // Find next pending job
      const nextJob = this.queue.find(j => j.status === 'pending');
      if (!nextJob) return; // No pending jobs

      // Start Job
      nextJob.status = 'processing';
      this.activeCount++;
      this.updateJobUI(nextJob, 'processing', '작업을 시작합니다...', 5);
      this.updateGlobalProgress();

      // Trigger API
      this.runJob(nextJob).finally(() => {
        this.activeCount--;
        this.updateGlobalProgress();
        this.processQueue(); // Chain next
      });

      // Try to start more if we have capacity
      this.processQueue();
    }

    async runJob(job) {
      const formData = new FormData();
      formData.append('file', job.file);
      formData.append('vision_model', visionModelSelect.value);
      formData.append('batch_folder', job.batchFolder);

      let endpoint = '/upload';
      // Configure based on tab (Logic similar to original handleUpload)
      if (currentTab === 'reconstruct') {
        endpoint = '/upload';
        formData.append('inpainting_model', inpaintingModelSelect.value);
        formData.append('codegen_model', codegenModelSelect.value);
      } else if (currentTab === 'remove-text') {
        endpoint = '/remove-text';
        formData.append('inpainting_model', inpaintingModelSelect.value);
      } else if (currentTab === 'remove-text-ai') {
        endpoint = '/remove-text-ai';
      } else if (currentTab === 'extract-text') {
        endpoint = '/extract-text';
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('서버 오류');
        const data = await response.json();

        // SSE handling for Reconstruct
        if (currentTab === 'reconstruct' && data.status === 'processing') {
          await this.monitorProgress(job, data.task_id);
        } else {
          // Immediate result (Remove text etc)
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

          if (pData.status === 'complete') {
            evtSource.close();
            this.completeJob(job, pData.data);
            resolve();
          } else if (pData.status === 'error') {
            evtSource.close();
            job.status = 'error';
            reject(new Error(pData.message));
          } else if (pData.status === 'cancelled') {
            evtSource.close();
            job.status = 'cancelled';
            this.updateJobUI(job, 'cancelled', '작업이 취소되었습니다.', 0);
            resolve(); // Resolve gracefully
          }
        };

        evtSource.onerror = () => {
          evtSource.close();
          reject(new Error("Connection Lost"));
        };
      });
    }

    completeJob(job, data) {
      job.status = 'complete';
      this.updateJobUI(job, 'complete', '처리 완료!', 100);

      // 1. Inject Actions into Header
      const actionsDiv = job.element.querySelector('.job-actions');
      if (actionsDiv) {
        actionsDiv.innerHTML = ''; // Clear prev

        // Original Image Button
        const originalUrl = URL.createObjectURL(job.file);
        actionsDiv.innerHTML += `<button class="btn-secondary small" onclick="openModal({bg_url: '${originalUrl}'}, '${job.file.name} (원본)')"><i data-lucide="image" size="14"></i> 원본</button>`;

        if (data.html_url) {
          actionsDiv.innerHTML += `<a href="${data.html_url}" class="btn-secondary small" target="_blank"><i data-lucide="eye" size="14"></i> 보기</a>`;
          actionsDiv.innerHTML += `<a href="${data.html_url}" class="btn-secondary small" download><i data-lucide="download" size="14"></i> DL</a>`;
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

      // 2. Inject Preview into Bottom Container
      const previewContainer = job.element.querySelector('.job-preview-container');
      if (previewContainer) {
        previewContainer.style.display = 'block'; // Show container
        previewContainer.classList.remove('hidden');

        let previewContent = '';
        if (data.html_url) {
          previewContent = `<iframe src="${data.html_url}" class="preview-iframe" scrolling="no"></iframe>`;
        } else if (data.bg_url) {
          previewContent = `<img src="${data.bg_url}" class="preview-img">`;
        }

        if (previewContent) {
          previewContainer.innerHTML = previewContent;
          // Bind Click for Modal
          previewContainer.onclick = () => openModal(data, job.file.name);
        }
      }
    }

    updateJobUI(job, status, message, percent = 0) {
      const badge = job.element.querySelector('.job-badge');
      const detail = job.element.querySelector('.status-detail');
      const progressBar = job.element.querySelector('.job-progress-fill');
      const card = job.element;

      // Keep processing status if we are just updating progress
      // But if status is cancelled, force it.

      let badgeClass = status;
      if (status === 'starting') badgeClass = 'pending';

      badge.className = `job-badge ${badgeClass}`;

      // Icon mapping
      let iconName = 'clock';
      if (status === 'processing') iconName = 'loader-2';
      if (status === 'complete') iconName = 'check-circle-2';
      if (status === 'error') iconName = 'alert-circle';
      if (status === 'cancelled') iconName = 'x-circle';
      if (status === 'paused') iconName = 'pause-circle';

      badge.innerHTML = `<i data-lucide="${iconName}" size="14"></i> ${this.getStatusText(status)}`;
      lucide.createIcons({
        root: badge,
        attrs: {
          class: status === 'processing' ? 'animate-spin' : ''
        }
      });

      detail.textContent = message;

      if (progressBar && percent !== undefined) {
        progressBar.style.width = `${percent}%`;
        // If cancelled, maybe gray out bar?
        if (status === 'cancelled') progressBar.style.backgroundColor = '#94a3b8';
      }

      card.className = `job-card ${badgeClass}`;
    }

    getStatusText(status) {
      const map = {
        'pending': '대기 중',
        'processing': '처리 중',
        'complete': '완료',
        'error': '오류',
        'cancelled': '취소됨',
        'paused': '일시정지됨'
      };
      return map[status] || status;
    }

    updateGlobalProgress() {
      const total = this.queue.length;
      const completed = this.queue.filter(j => j.status === 'complete' || j.status === 'error' || j.status === 'cancelled').length;
      const percent = total === 0 ? 0 : (completed / total) * 100;

      batchStatusText.textContent = `완료: ${completed} / ${total}`;
      batchProgressBar.style.width = `${percent}%`;
    }

    pause() {
      this.isPaused = true;
      document.getElementById('btnPause').classList.add('hidden');
      document.getElementById('btnResume').classList.remove('hidden');

      // Call Backend Pause
      fetch('/pause', { method: 'POST' }).then(() => {
        showToast('⏸️ 작업이 일시정지되었습니다. (현재 단계가 끝나면 멈춥니다)');
      });
    }

    resume() {
      this.isPaused = false;
      document.getElementById('btnPause').classList.remove('hidden');
      document.getElementById('btnResume').classList.add('hidden');

      // Call Backend Resume
      fetch('/resume', { method: 'POST' }).then(() => {
        showToast('▶️ 작업이 재개됩니다.');
        this.processQueue();
      });
    }

    stop() {
      if (!confirm('현재 진행 중인 모든 작업을 취소하시겠습니까?')) return;

      // 1. Cancel Active Jobs (Server-side)
      const processingJobs = this.queue.filter(j => j.status === 'processing');
      processingJobs.forEach(job => {
        // Send cancel signal
        fetch(`/cancel/${job.id}`, { method: 'POST' }).catch(console.error);

        // Optimistic UI update
        job.status = 'cancelled';
        this.updateJobUI(job, 'cancelled', '중단 요청됨...', 0);
      });

      // 2. Remove Pending Jobs (Client-side)
      // We keep processing/cancelled/complete jobs in the list for history
      // We only remove ones that haven't started yet
      // Actually user might want to CLEAR the list.
      // But typically "Stop" means "Stop Processing". Clearing is a separate action?
      // "Stop" usually cancels pending too.

      const pendingJobs = this.queue.filter(j => j.status === 'pending');
      pendingJobs.forEach(job => {
        job.status = 'cancelled';
        this.updateJobUI(job, 'cancelled', '대기열에서 취소됨');
      });

      // Update queue to keep cancelled ones but they won't be picked up by processQueue
      // because processQueue looks for 'pending'.

      this.updateGlobalProgress();

      if (this.activeCount === 0 && pendingJobs.length === 0) {
        showToast('작업이 중단되었습니다.');
      }
    }
  }

  const jobQueue = new JobQueue(3); // Max 3 Concurrent

  // --- Event Listeners ---

  // Add Files
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => { uploadZone.classList.remove('dragover'); });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) jobQueue.addFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) jobQueue.addFiles(e.target.files);
  });

  // Batch Controls
  // Event listeners are handled via onclick in HTML for robustness
  /* 
  btnPause.addEventListener('click', () => jobQueue.pause());
  btnResume.addEventListener('click', () => jobQueue.resume());
  btnStop.addEventListener('click', () => {
    jobQueue.stop();
  });
  */

  // Expose to window for HTML onclick access
  window.jobQueue = jobQueue;

  // Start-up Logic
  loadSettings();

  if (btnSaveDefaults) {
    btnSaveDefaults.addEventListener('click', saveSettings);
  }

  // Check old DOM elements to prevent null errors (Single view elements might still be needed if logic requires, but mostly replaced)

  // Tab Switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;

      // Update Title
      const titles = {
        'reconstruct': '재구성을 위한 슬라이드 이미지 업로드',
        'remove-text': '텍스트 제거를 위한 이미지 업로드 (OpenCV)',
        'remove-text-ai': '텍스트 제거를 위한 이미지 업로드 (AI)',
        'extract-text': '텍스트 추출을 위한 이미지 업로드'
      };
      document.getElementById('uploadTitle').textContent = titles[currentTab];
    });
  });

  async function loadSettings() {
    try {
      const res = await fetch('/settings');
      if (res.ok) {
        const settings = await res.json();
        if (settings.vision_model) visionModelSelect.value = settings.vision_model;
        if (settings.inpainting_model) inpaintingModelSelect.value = settings.inpainting_model;
        if (settings.codegen_model) codegenModelSelect.value = settings.codegen_model;
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }

  async function saveSettings() {
    const settings = {
      vision_model: visionModelSelect.value,
      inpainting_model: inpaintingModelSelect.value,
      codegen_model: codegenModelSelect.value
    };

    try {
      const res = await fetch('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        showToast('✅ 설정이 저장되었습니다!');
      } else {
        showToast('❌ 설정 저장 실패.');
      }
    } catch (e) {
      showToast('❌ 설정 저장 중 오류가 발생했습니다.');
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
});

// --- Modal Logic (Global Scope) ---
function openModal(data, title) {
  const modal = document.getElementById('previewModal');
  const modalTitle = document.getElementById('modalTitle');
  const container = document.getElementById('modalPreviewContainer');

  // Buttons
  const btnDlHtml = document.getElementById('btnDownloadHtml');
  const btnDlBg = document.getElementById('btnDownloadBg');

  modalTitle.textContent = title || "Slide Preview";
  container.innerHTML = ''; // Clear prev

  // 1. Set Content
  if (data.html_url) {
    container.innerHTML = `<iframe src="${data.html_url}" style="width:100%; height:100%; border:none;"></iframe>`;
    btnDlHtml.href = data.html_url;
    btnDlHtml.classList.remove('hidden');
  } else {
    btnDlHtml.classList.add('hidden');
  }

  if (data.bg_url) {
    if (!data.html_url) {
      container.innerHTML = `<img src="${data.bg_url}" style="width:100%; height:100%; object-fit:contain;">`;
    }
    btnDlBg.href = data.bg_url;
    // If it's a blob protocol, set download attribute to something default if missing, or user can just view.
    // For original image button, we passed title as filename so it might be okay.
    btnDlBg.setAttribute('download', 'image.png');
    btnDlBg.classList.remove('hidden');
  } else {
    btnDlBg.classList.add('hidden');
  }

  // 2. Show Modal
  modal.classList.remove('hidden');
  // Prevent background scroll
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('previewModal');
  modal.classList.add('hidden');
  document.getElementById('modalPreviewContainer').innerHTML = ''; // Clear iframe to stop media
  document.body.style.overflow = '';
}

// Close on outside click
document.getElementById('previewModal').addEventListener('click', (e) => {
  if (e.target.id === 'previewModal') closeModal();
});

// Remove local scope binding, keeping functions global for onclick events
window.openModal = openModal;
window.closeModal = closeModal;

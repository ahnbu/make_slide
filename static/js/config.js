
// static/js/config.js
// 설정값, 전역 상태, API 호출 함수

export const AppSettings = {
  vision_model: 'gemini-3-flash-preview',
  inpainting_model: 'opencv-telea',
  codegen_model: 'algorithmic',
  output_format: 'both',
  exclude_text: '',
  max_concurrent: 3,
  font_family: 'Malgun Gothic',
  refine_layout: false
};

// Current Active Tab State
let currentTab = 'reconstruct';

export function getCurrentTab() {
  return currentTab;
}

export function setCurrentTab(tab) {
  currentTab = tab;
}

// Helper to get suffix from tab name
export function getTabSuffix(tab) {
  if (tab === 'combine') return 'combine';
  if (tab === 'pdf-to-pptx') return 'pdf';
  if (tab === 'remove-text-photoroom') return 'removeText';
  return 'reconstruct';
}

// ---------------------------------------------------------
// Settings Management
// ---------------------------------------------------------

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

export async function loadSettings(processQueueCallback) {
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
      // Fill PDF Tab
      updatePdfUi(settings.pdf_pptx);
      // Combine Tab
      fillParam('reconstruct', 'combine');

      // Update Photoroom Mode
      if (settings.photoroom && settings.photoroom.mode) {
        const prMode = document.getElementById('textRemovalMode_photoroom');
        if (prMode) prMode.value = settings.photoroom.mode;
      }

      // Sync Global AppSettings
      Object.assign(AppSettings, settings);

      // If we need to re-process queue based on max_concurrent
      if (processQueueCallback) processQueueCallback();
    }
  } catch (e) {
    console.error("Failed to load settings", e);
  }
}

// Need access to showToast. Since ui.js depends on config.js? 
// No, usually main.js binds them. But saveSettings is called from UI.
// We can pass showToast as a callback or return result.
// Let's return result/message and let main.js show toast, OR import showToast from ui.js?
// Circular dependency risk: ui.js <-> config.js.
// Best practice: config.js is pure logic/data. ui.js is view.
// But saveSettings reads DOM.
// Let's import showToast dynamically or pass it.
// Simpler: config.js returns promise with result.

export async function saveSettings() {
  // Identify Context
  const tab = currentTab;
  let section = 'reconstruct'; // default

  // Explicit PDF Split
  if (tab === 'pdf-to-pptx') section = 'pdf_pptx';
  else if (tab.includes('photoroom') || tab === 'remove-text-photoroom') section = 'photoroom';

  // Suffix resolution for UI Element ID
  let suffix = 'reconstruct';
  if (section === 'pdf_pptx') suffix = 'pdf';

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
    payload[section] = sectionData;
  }

  try {
    const res = await fetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      // Calculation logic for changes for toast message
      // We can return the details to caller
      const targetSection = Object.keys(payload)[0];
      const newData = payload[targetSection];

      // Update Local State
      if (!AppSettings[targetSection]) AppSettings[targetSection] = {};
      Object.assign(AppSettings[targetSection], newData);

      return { success: true, section: targetSection, data: newData };
    } else {
      return { success: false, message: '서버 오류' };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
}

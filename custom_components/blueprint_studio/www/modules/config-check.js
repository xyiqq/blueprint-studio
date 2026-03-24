/** CONFIG-CHECK.JS | Purpose: Run HA config check and display results in a modal-style panel. */
import { API_BASE } from './constants.js';
import { fetchWithAuth } from './api.js';
import { showToast } from './ui.js';

/**
 * Runs `hass --script check_config` (or `ha core check`) via the backend
 * and shows the results in a floating panel.
 */
export async function runConfigCheck() {
  const btn = document.getElementById('btn-config-check');
  if (btn) {
    btn.disabled = true;
    btn.querySelector('span').textContent = 'hourglass_empty';
  }

  // Remove existing panel
  const existing = document.getElementById('config-check-panel');
  if (existing) existing.remove();

  try {
    const data = await fetchWithAuth(`${API_BASE}?action=run_config_check`);
    const result = data.result;

    if (!result) {
      showToast('Config check returned no result', 'error');
      return;
    }

    _showResultPanel(result);
  } catch (e) {
    showToast(`Config check failed: ${e.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'fact_check';
    }
  }
}

function _showResultPanel(result) {
  const { success, output, errors } = result;

  const panel = document.createElement('div');
  panel.id = 'config-check-panel';

  // Build error rows
  let errorsHtml = '';
  if (errors && errors.length > 0) {
    errorsHtml = errors.map((err, i) => {
      const fileRef = err.file
        ? `<button class="ccp-file-link" data-idx="${i}" title="Open file">
             <span class="material-icons" style="font-size:13px;vertical-align:middle;">open_in_new</span>
             ${_escHtml(err.file)}${err.line ? `:${err.line}` : ''}
           </button>`
        : '';
      return `<div class="ccp-error-row">
        <span class="material-icons ccp-err-icon">error_outline</span>
        <div class="ccp-error-body">
          ${fileRef}
          <span class="ccp-error-msg">${_escHtml(err.message)}</span>
        </div>
      </div>`;
    }).join('');
  }

  panel.innerHTML = `
    <div class="ccp-header">
      <span class="material-icons ccp-status-icon ${success ? 'ccp-ok' : 'ccp-fail'}">${success ? 'check_circle' : 'cancel'}</span>
      <span class="ccp-title">HA Config Check — ${success ? 'All good' : `${errors.length} error${errors.length !== 1 ? 's' : ''} found`}</span>
      <button class="ccp-close" title="Close">✕</button>
    </div>
    ${errorsHtml ? `<div class="ccp-errors">${errorsHtml}</div>` : ''}
    <details class="ccp-raw-details">
      <summary class="ccp-raw-toggle">Raw output</summary>
      <pre class="ccp-raw">${_escHtml(output || '(no output)')}</pre>
    </details>
  `;

  panel.style.cssText = `
    position: fixed;
    bottom: 32px;
    right: 16px;
    z-index: 9998;
    width: 520px;
    max-width: calc(100vw - 32px);
    max-height: 60vh;
    overflow-y: auto;
    background: var(--bg-primary, #1e1e2e);
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--text-primary, #cdd6f4);
  `;

  document.body.appendChild(panel);

  // Close button
  panel.querySelector('.ccp-close').addEventListener('click', () => panel.remove());

  // File link clicks — open file and scroll to line
  panel.querySelectorAll('.ccp-file-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const err = errors[idx];
      if (!err || !err.file) return;
      const line = err.line || 1;
      // Use the already-exported openFileAndScroll from global-search
      if (window.blueprintStudio && window.blueprintStudio.openFileAndScroll) {
        window.blueprintStudio.openFileAndScroll(err.file, line);
      }
      panel.remove();
    });
  });
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


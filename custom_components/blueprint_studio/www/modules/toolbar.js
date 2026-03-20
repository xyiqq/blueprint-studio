/** TOOLBAR.JS | Purpose: Manages toolbar button states (enabled/disabled) based on context. */
import { state, elements } from './state.js';

/**
 * Updates toolbar button states based on current editor state
 * Enables/disables save, undo, redo, and download buttons
 */
export function updateToolbarState() {
  const tab = state.activeTab;
  const hasEditor = !!state.editor && !!tab;
  const hasModified = state.openTabs.some((t) => t.modified);

  /*console.log*/ void("[Toolbar] updateToolbarState", { 
    activeTab: tab?.path, 
    isModified: tab?.modified, 
    hasModified,
    hasEditor 
  });

  // Save current file
  if (elements.btnSave) {
    const disabled = !tab || !tab.modified;
    elements.btnSave.disabled = disabled;
    if (disabled) elements.btnSave.setAttribute('disabled', 'disabled');
    else elements.btnSave.removeAttribute('disabled');
  }

  // Save all modified files
  if (elements.btnSaveAll) {
    const disabled = !hasModified;
    elements.btnSaveAll.disabled = disabled;
    if (disabled) elements.btnSaveAll.setAttribute('disabled', 'disabled');
    else elements.btnSaveAll.removeAttribute('disabled');
  }

  // Undo/Redo
  if (elements.btnUndo) {
    elements.btnUndo.disabled = !hasEditor || !state.editor?.historySize().undo;
  }
  if (elements.btnRedo) {
    elements.btnRedo.disabled = !hasEditor || !state.editor?.historySize().redo;
  }

  // Download file - should be enabled when any file is open
  if (elements.btnDownload) {
    if (hasEditor) {
      elements.btnDownload.disabled = false;
      elements.btnDownload.removeAttribute('disabled');
    } else {
      elements.btnDownload.disabled = true;
      elements.btnDownload.setAttribute('disabled', 'disabled');
    }
  }

  // "Use Blueprint" button — visible only when the active file is a blueprint
  const btnUseBlueprint = document.getElementById('btn-use-blueprint');
  if (btnUseBlueprint) {
    const isBlueprint = tab && tab.content && tab.content.includes('blueprint:');
    btnUseBlueprint.style.display = isBlueprint ? '' : 'none';
  }
}

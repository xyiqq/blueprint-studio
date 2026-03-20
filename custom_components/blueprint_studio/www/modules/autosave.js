/** AUTOSAVE.JS | Purpose: Automatic saving of modified files after configurable delay. */
import { state, elements } from './state.js';
import { showToast, setButtonLoading } from './ui.js';
import { eventBus } from './event-bus.js';
import { saveFile } from './file-operations.js';
import { t } from './translations.js';

// Auto-save timer reference
export let autoSaveTimer = null;

/**
 * Triggers auto-save for the current file
 * Called from handleEditorChange when content changes
 */
export function triggerAutoSave() {
  if (state.autoSave && state.activeTab && state.activeTab.modified) {
    // Clear existing timer
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    // Set new timer
    autoSaveTimer = setTimeout(() => {
      // Double-check state before saving
      if (state.autoSave && state.activeTab && state.activeTab.modified) {
        eventBus.emit('file:save-current', { isAutoSave: true });
      }
    }, state.autoSaveDelay);
  } else if (autoSaveTimer) {
    // If auto-save disabled OR not modified, clear any pending timer
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * Clears the auto-save timer
 */
export function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * Saves all modified files
 */
export async function saveAllFiles() {
  const modifiedTabs = state.openTabs.filter((t) => t.modified);

  if (elements.btnSaveAll) {
    setButtonLoading(elements.btnSaveAll, true);
  }

  for (const tab of modifiedTabs) {
    const success = await saveFile(tab.path, tab.content);
    if (success) {
      tab.originalContent = tab.content;
      tab.modified = false;
    }
  }

  if (elements.btnSaveAll) {
    setButtonLoading(elements.btnSaveAll, false);
  }

  eventBus.emit('ui:refresh-tabs');
  eventBus.emit('ui:refresh-tree');
  eventBus.emit('ui:update-toolbar-state');

  showToast(t("toast.saved_files", { count: modifiedTabs.length }), "success");
}

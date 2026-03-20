/** RESIZE.JS | Purpose: Sidebar drag-to-resize functionality. Allows user to adjust */
import { state, elements } from './state.js';
import { isMobile } from './utils.js';
import { eventBus } from './event-bus.js';

/**
 * Initialize the sidebar resize handle
 * Sets up drag handlers for resizing the sidebar
 */
export function initResizeHandle() {
  if (!elements.resizeHandle || isMobile()) return;

  let isResizing = false;

  elements.resizeHandle.addEventListener("mousedown", (e) => {
    isResizing = true;
    elements.resizeHandle.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 500) {
      elements.sidebar.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      elements.resizeHandle.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // Save sidebar width
      state.sidebarWidth = parseInt(elements.sidebar.style.width);
      eventBus.emit('settings:save');

      // Refresh editor after resize
      if (state.editor) {
        state.editor.refresh();
      }
    }
  });
}

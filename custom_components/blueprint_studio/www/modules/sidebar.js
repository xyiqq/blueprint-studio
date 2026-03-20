/** SIDEBAR.JS | Purpose: * Manages sidebar visibility, view switching (files/git/gitea/search/settings), */
import { state, elements } from './state.js';
import { isMobile } from './utils.js';
import { eventBus } from './event-bus.js';

/**
 * Shows the sidebar
 */
export function showSidebar() {
  state.sidebarVisible = true;
  if (isMobile()) {
    elements.sidebar.classList.add("visible");
    elements.sidebarOverlay.classList.add("visible");
  } else {
    elements.sidebar.classList.remove("hidden");
  }
}

/**
 * Hides the sidebar
 */
export function hideSidebar() {
  state.sidebarVisible = false;
  if (isMobile()) {
    elements.sidebar.classList.remove("visible");
    elements.sidebarOverlay.classList.remove("visible");
  } else {
    elements.sidebar.classList.add("hidden");
  }
}

/**
 * Switches sidebar view (explorer, search, etc.)
 * @param {string} viewName - Name of the view to switch to
 */
export function switchSidebarView(viewName) {
  state.activeSidebarView = viewName;
  eventBus.emit('settings:save');

  if (!state.sidebarVisible) {
    showSidebar();
  }

  if (elements.activityExplorer) elements.activityExplorer.classList.toggle("active", viewName === "explorer");
  if (elements.activitySearch) elements.activitySearch.classList.toggle("active", viewName === "search");
  if (elements.activitySftp) elements.activitySftp.classList.toggle("active", viewName === "sftp");

  if (elements.viewExplorer) {
    elements.viewExplorer.style.display = viewName === "explorer" ? "flex" : "none";
    elements.viewExplorer.classList.toggle("hidden", viewName !== "explorer");
  }
  if (elements.viewSearch) {
    elements.viewSearch.style.display = viewName === "search" ? "flex" : "none";
    elements.viewSearch.classList.toggle("hidden", viewName !== "search");

    if (viewName === "search" && elements.globalSearchInput) {
      setTimeout(() => elements.globalSearchInput.focus(), 100);
    }
  }
  if (elements.viewSftp) {
    elements.viewSftp.style.display = viewName === "sftp" ? "flex" : "none";
    elements.viewSftp.classList.toggle("hidden", viewName !== "sftp");
  }
}

/**
 * Toggles sidebar visibility
 */
export function toggleSidebar() {
  if (state.sidebarVisible) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

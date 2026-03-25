import { t } from './translations.js';
/** COMMAND-PALETTE.JS | Purpose: * Provides a unified quick-access command and file switcher (VS Code style) */
import { state, elements } from './state.js';
import { getTruePath, getFileIcon, copyToClipboard } from './utils.js';
import { eventBus } from './event-bus.js';
import { API_BASE } from './constants.js';
import { fetchWithAuth } from './api.js';
import { showToast, showConfirmDialog, showGlobalLoading, hideGlobalLoading } from './ui.js';

/**
 * Shows the unified command palette
 * @param {string} initialMode - optional initial character (e.g. '>')
 */
export function showCommandPalette(initialMode = "") {
  if (!elements.commandPaletteOverlay) elements.commandPaletteOverlay = document.getElementById("command-palette-overlay");
  if (!elements.commandPaletteInput) elements.commandPaletteInput = document.getElementById("command-palette-input");
  if (!elements.commandPaletteResults) elements.commandPaletteResults = document.getElementById("command-palette-results");

  if (!elements.commandPaletteOverlay) return;
  if (elements.commandPaletteOverlay.classList.contains("visible")) return;

  const commands = [
      { id: "save", label: t("palette.cmd_save"), icon: "save", shortcut: "Ctrl+S", action: () => { if (state.activeTab) eventBus.emit('file:save', { path: state.activeTab.path, content: state.activeTab.content }); } },
      { id: "save_all", label: t("palette.cmd_save_all"), icon: "save_alt", shortcut: "Ctrl+Shift+S", action: () => eventBus.emit('file:save-all') },
      { id: "new_file", label: t("palette.cmd_new_file"), icon: "note_add", action: () => eventBus.emit('file:new') },
      { id: "new_folder", label: t("palette.cmd_new_folder"), icon: "create_new_folder", action: () => eventBus.emit('folder:new') },
      { id: "new_blueprint", label: "New Blueprint", icon: "architecture", action: () => eventBus.emit('blueprint:new') },
      { id: "convert_to_blueprint", label: "Convert to Blueprint (or Selection)", icon: "architecture", action: () => { if (state.activeTab) eventBus.emit('blueprint:convert'); } },
      { id: "use_blueprint", label: "Use Blueprint (Instantiate)", icon: "architecture", action: () => { if (state.activeTab) eventBus.emit('blueprint:use'); } },
      { id: "generate_uuid", label: t("palette.cmd_generate_uuid"), icon: "fingerprint", shortcut: "Ctrl+Shift+U", action: () => eventBus.emit('editor:insert-uuid') },
      { id: "git_status", label: t("palette.cmd_git_status"), icon: "sync", action: () => eventBus.emit('git:status-check', { fetch: true }) },
      { id: "git_push", label: t("palette.cmd_git_push"), icon: "cloud_upload", action: () => eventBus.emit('git:push') },
      { id: "git_pull", label: t("palette.cmd_git_pull"), icon: "cloud_download", action: () => eventBus.emit('git:pull') },
      { id: "git_history", label: t("palette.cmd_git_history"), icon: "history", action: () => eventBus.emit('git:show-history') },
      { id: "validate", label: t("palette.cmd_validate"), icon: "check_circle", action: () => { if (state.activeTab) eventBus.emit('file:validate'); } },
      { id: "restart_ha", label: t("palette.cmd_restart_ha"), icon: "restart_alt", action: () => eventBus.emit('ha:restart') },
      { id: "dev_tools_actions", label: "Developer Tools: Actions", icon: "construction", action: () => eventBus.emit('ha:dev-tools', { tab: 'actions' }) },
      { id: "dev_tools_template", label: "Developer Tools: Template", icon: "construction", action: () => eventBus.emit('ha:dev-tools', { tab: 'template' }) },
      { id: "dev_tools_states", label: "Developer Tools: States", icon: "construction", action: () => eventBus.emit('ha:dev-tools', { tab: 'states' }) },
      { id: "dev_tools_config", label: "Developer Tools: Config", icon: "construction", action: () => eventBus.emit('ha:dev-tools', { tab: 'config' }) },
      { id: "toggle_sidebar", label: t("palette.cmd_toggle_sidebar"), icon: "menu", shortcut: "Ctrl+B", action: () => eventBus.emit('ui:toggle-sidebar') },
      { id: "shortcuts", label: t("palette.cmd_shortcuts"), icon: "keyboard", action: () => eventBus.emit('ui:show-shortcuts') },
      { id: "settings", label: t("palette.cmd_settings"), icon: "settings", action: () => eventBus.emit('ui:show-settings') },
      { id: "report_issue", label: t("palette.cmd_report_issue"), icon: "bug_report", action: () => eventBus.emit('ui:report-issue') },
      { id: "request_feature", label: t("palette.cmd_request_feature"), icon: "lightbulb", action: () => eventBus.emit('ui:request-feature') },
      { id: "clean_git_locks", label: t("palette.cmd_clean_git_locks"), icon: "delete_sweep", action: async () => {
          if (!await showConfirmDialog({ title: t("palette.cmd_clean_git_locks"), message: "Are you sure you want to clean Git lock files? This can fix stuck operations.", confirmText: "Clean Locks", isDanger: true })) return;
          try {
              showGlobalLoading("Cleaning locks...");
              const res = await fetchWithAuth(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "git_clean_locks" }) });
              hideGlobalLoading();
              if (res.success) showToast(res.message, "success"); else showToast(t("toast.clean_locks_failed", { error: res.message }), "error");
          } catch (e) { hideGlobalLoading(); showToast(t("toast.generic_error", { error: e.message }), "error"); }
      }},
      { id: "copy_path", label: t("palette.cmd_copy_path"), icon: "content_copy", action: () => {
          if (state.activeTab) {
              const path = getTruePath(state.activeTab.path);
              copyToClipboard(path);
          }
      }},
      { id: "download_file", label: t("palette.cmd_download_file"), icon: "download", action: () => {
          if (state.activeTab) eventBus.emit('file:download', { path: state.activeTab.path });
      }},
      { id: "toggle_word_wrap", label: t("palette.cmd_toggle_word_wrap"), icon: "wrap_text", action: () => {
          state.wordWrap = !state.wordWrap;
          if (state.editor) state.editor.setOption('lineWrapping', state.wordWrap);
          eventBus.emit('settings:save');
          showToast(`Word wrap ${state.wordWrap ? "enabled" : "disabled"}`, "info");
      }},
      { id: "fold_all", label: t("palette.cmd_fold_all"), icon: "unfold_less", action: () => { if (state.editor) state.editor.execCommand("foldAll"); } },
      { id: "unfold_all", label: t("palette.cmd_unfold_all"), icon: "unfold_more", action: () => { if (state.editor) state.editor.execCommand("unfoldAll"); } },
      { id: "close_others", label: t("palette.cmd_close_others"), icon: "close_fullscreen", action: () => { if (state.activeTab) { const tabs = state.openTabs.filter(t => t !== state.activeTab); tabs.forEach(t => eventBus.emit('tab:close', { tab: t })); } } },
      { id: "close_saved", label: t("palette.cmd_close_saved"), icon: "save", action: () => { if (state.activeTab) { const tabs = state.openTabs.filter(t => !t.modified && t !== state.activeTab); tabs.forEach(t => eventBus.emit('tab:close', { tab: t })); } } },
      { id: "theme_light", label: t("palette.cmd_theme_light"), icon: "light_mode", action: () => eventBus.emit('ui:set-theme-preset', { preset: "light" }) },
      { id: "theme_dark", label: t("palette.cmd_theme_dark"), icon: "dark_mode", action: () => eventBus.emit('ui:set-theme-preset', { preset: "dark" }) },
      { id: "theme_auto", label: t("palette.cmd_theme_auto"), icon: "brightness_auto", action: () => eventBus.emit('ui:set-theme-preset', { preset: "auto" }) },
  ];

  let selectedIndex = 0;
  let filteredItems = [];
  let currentMode = "file"; // "file", "command", "goto"

  const renderResults = () => {
      const query = elements.commandPaletteInput.value;
      
      if (query.startsWith(">")) {
          currentMode = "command";
          const filter = query.slice(1).toLowerCase().trim();
          filteredItems = commands.filter(c => c.label.toLowerCase().includes(filter));
          elements.commandPaletteInput.placeholder = t("palette.type_command");
      } else if (query.startsWith(":")) {
          currentMode = "goto";
          const lineNum = query.slice(1).trim();
          filteredItems = []; // No list for goto mode
          elements.commandPaletteInput.placeholder = t("palette.goto_line");
      } else {
          currentMode = "file";
          const filter = query.toLowerCase().trim();
          
          if (!filter) {
              // Show recent files
              filteredItems = (state.recentFiles || []).map(path => {
                  return state.files.find(f => f.path === path);
              }).filter(f => f).slice(0, 20);
              
              if (filteredItems.length < 5) {
                  const others = state.files.filter(f => !state.recentFiles?.includes(f.path));
                  filteredItems = filteredItems.concat(others.slice(0, 20 - filteredItems.length));
              }
          } else {
              filteredItems = state.files.filter(f => 
                  f.name.toLowerCase().includes(filter) || 
                  f.path.toLowerCase().includes(filter)
              ).slice(0, 50);
          }
          elements.commandPaletteInput.placeholder = t("palette.search_files");
      }

      elements.commandPaletteResults.innerHTML = "";
      
      if (currentMode === "goto") {
          elements.commandPaletteResults.innerHTML = `<div style="padding: 12px; font-size: 13px; color: var(--text-secondary);">${t("palette.goto_line_instruction")}</div>`;
          return;
      }

      if (filteredItems.length === 0) {
          elements.commandPaletteResults.innerHTML = `<div class="command-palette-no-results">${t("palette.no_results")}</div>`;
          return;
      }

      if (selectedIndex >= filteredItems.length) selectedIndex = 0;

      filteredItems.forEach((item, i) => {
          const div = document.createElement("div");
          div.className = `command-item ${i === selectedIndex ? "selected" : ""}`;
          
          if (currentMode === "command") {
              div.innerHTML = `
                  <div class="command-item-label">
                      <span class="material-icons command-item-icon">${item.icon}</span>
                      <span>${item.label}</span>
                  </div>
                  ${item.shortcut ? `<span class="command-item-shortcut">${item.shortcut}</span>` : ""}
              `;
              div.onclick = () => {
                  hide();
                  item.action();
              };
          } else {
              const fileIcon = getFileIcon(item.path);
              div.innerHTML = `
                  <div class="command-item-label">
                      <span class="material-icons command-item-icon ${fileIcon.class}">${fileIcon.icon}</span>
                      <div style="display: flex; flex-direction: column;">
                          <span class="quick-switcher-name">${item.name}</span>
                          <span style="font-size: 10px; opacity: 0.6;">${item.path}</span>
                      </div>
                  </div>
              `;
              div.onclick = () => {
                  hide();
                  eventBus.emit('file:open', { path: item.path });
              };
          }
          elements.commandPaletteResults.appendChild(div);
      });

      const selected = elements.commandPaletteResults.querySelector(".command-item.selected");
      if (selected) selected.scrollIntoView({ block: "nearest" });
  };

  const handleKeydown = (e) => {
      if (e.key === "ArrowDown") {
          e.preventDefault();
          if (filteredItems.length > 0) {
              selectedIndex = (selectedIndex + 1) % filteredItems.length;
              renderResults();
          }
      } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (filteredItems.length > 0) {
              selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
              renderResults();
          }
      } else if (e.key === "Enter") {
          e.preventDefault();
          
          if (currentMode === "goto") {
              const line = parseInt(elements.commandPaletteInput.value.slice(1));
              if (!isNaN(line) && state.editor) {
                  state.editor.setCursor({line: line - 1, ch: 0});
                  state.editor.scrollIntoView({line: line - 1, ch: 0}, 200);
                  state.editor.focus();
              }
              hide();
              return;
          }

          const item = filteredItems[selectedIndex];
          if (item) {
              hide();
              if (currentMode === "command") {
                  item.action();
              } else {
                  eventBus.emit('file:open', { path: item.path });
              }
          }
      } else if (e.key === "Escape") {
          hide();
      }
  };

  const handleInput = () => {
      selectedIndex = 0;
      renderResults();
  };

  const handleOverlayClick = (e) => {
      if (e.target === elements.commandPaletteOverlay) hide();
  };

  const hide = () => {
      elements.commandPaletteOverlay.classList.remove("visible");
      cleanup();
  };

  const cleanup = () => {
      elements.commandPaletteInput.removeEventListener("input", handleInput);
      elements.commandPaletteInput.removeEventListener("keydown", handleKeydown);
      elements.commandPaletteOverlay.removeEventListener("click", handleOverlayClick);
  };

  elements.commandPaletteInput.addEventListener("input", handleInput);
  elements.commandPaletteInput.addEventListener("keydown", handleKeydown);
  elements.commandPaletteOverlay.addEventListener("click", handleOverlayClick);
  
  elements.commandPaletteOverlay.classList.add("visible");
  elements.commandPaletteInput.value = initialMode;
  selectedIndex = 0;
  renderResults();
  
  setTimeout(() => {
      elements.commandPaletteInput.focus();
      // If we have an initial mode, move cursor to end
      if (initialMode) {
          elements.commandPaletteInput.setSelectionRange(initialMode.length, initialMode.length);
      }
  }, 10);
}

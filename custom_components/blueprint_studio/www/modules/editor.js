/** EDITOR.JS | Purpose: * Handles CodeMirror editor initialization, configuration, editor-specific */
import { state, elements } from './state.js';
import { eventBus } from './event-bus.js';
import { validateYaml, validateByFileType } from './file-operations.js';
import { homeAssistantHint, HA_ENTITIES } from './ha-autocomplete.js';
import { enableSplitView, disableSplitView } from './split-view.js';
import { showToast } from './ui.js';

// CodeMirror is loaded globally via script tags

/**
 * Shows a floating entity info popup near the given screen coordinates.
 * Dismissed on outside click or Escape.
 */
function _showEntityPopup(entity, clientX, clientY) {
  // Remove any existing popup
  const existing = document.getElementById('entity-inspect-popup');
  if (existing) existing.remove();

  const iconName = entity.icon ? entity.icon.replace('mdi:', '') : null;
  const iconHtml = iconName
    ? `<span class="mdi mdi-${iconName}" style="margin-right:6px;font-size:1.2em;vertical-align:middle;"></span>`
    : `<span class="material-icons" style="margin-right:6px;font-size:1.1em;vertical-align:middle;color:var(--accent-color);">device_hub</span>`;

  const stateVal = entity.state !== undefined ? String(entity.state) : '—';
  const domain = entity.entity_id.split('.')[0];

  // Build a few key attribute rows (skip bulky ones)
  const skipAttrs = new Set(['friendly_name', 'icon', 'entity_picture', 'supported_features', 'supported_color_modes', 'color_mode']);
  const attrRows = Object.entries(entity.attributes || {})
    .filter(([k]) => !skipAttrs.has(k))
    .slice(0, 6)
    .map(([k, v]) => {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `<div class="eip-attr"><span class="eip-attr-key">${k}</span><span class="eip-attr-val">${valStr}</span></div>`;
    })
    .join('');

  const popup = document.createElement('div');
  popup.id = 'entity-inspect-popup';
  popup.innerHTML = `
    <div class="eip-header">
      ${iconHtml}<span class="eip-entity-id">${entity.entity_id}</span>
      <button class="eip-close" title="Close">✕</button>
    </div>
    ${entity.friendly_name ? `<div class="eip-name">${entity.friendly_name}</div>` : ''}
    <div class="eip-state-row">
      <span class="eip-domain-chip">${domain}</span>
      <span class="eip-state ${stateVal === 'on' ? 'eip-state-on' : stateVal === 'off' ? 'eip-state-off' : ''}">${stateVal}</span>
    </div>
    ${attrRows ? `<div class="eip-attrs">${attrRows}</div>` : ''}
    <div class="eip-actions">
      <button class="eip-btn" id="eip-copy-btn">
        <span class="material-icons" style="font-size:14px;vertical-align:middle;">content_copy</span> Copy ID
      </button>
    </div>
  `;

  // Position near click, keep within viewport
  popup.style.cssText = `
    position: fixed;
    z-index: 99999;
    top: ${clientY + 10}px;
    left: ${clientX}px;
    min-width: 260px;
    max-width: 360px;
    background: var(--bg-primary, #1e1e2e);
    border: 1px solid var(--border-color, #333);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    padding: 12px;
    font-size: 13px;
    color: var(--text-primary, #cdd6f4);
    font-family: var(--font-mono, monospace);
  `;

  document.body.appendChild(popup);

  // Clamp to viewport
  const rect = popup.getBoundingClientRect();
  if (rect.right > window.innerWidth - 8) {
    popup.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight - 8) {
    popup.style.top = `${clientY - rect.height - 10}px`;
  }

  // Close button
  popup.querySelector('.eip-close').addEventListener('click', () => popup.remove());

  // Copy ID button
  popup.querySelector('#eip-copy-btn').addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(entity.entity_id).then(() => showToast(`Copied: ${entity.entity_id}`, 'success')).catch(() => _fallbackCopy(entity.entity_id));
    } else {
      _fallbackCopy(entity.entity_id);
    }
  });

  // Dismiss on outside click or Escape
  const dismiss = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('mousedown', dismiss, true);
    }
  };
  const dismissKey = (e) => {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', dismissKey, true);
      document.removeEventListener('mousedown', dismiss, true);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss, true);
    document.addEventListener('keydown', dismissKey, true);
  }, 50);
}

function _fallbackCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-999px;left:-999px;';
  document.body.appendChild(el);
  el.select();
  try { document.execCommand('copy'); showToast(`Copied: ${text}`, 'success'); } catch { showToast('Copy failed', 'error'); }
  document.body.removeChild(el);
}

/**
 * Inserts a random UUID v4 at the current cursor position
 */
export function insertUUID() {
    const cm = state.splitView?.enabled ? 
        (state.splitView.activePane === 'secondary' ? state.secondaryEditor : state.primaryEditor) : 
        state.primaryEditor;
    
    if (!cm) return;

    // Generate UUID v4
    const uuid = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    cm.replaceSelection(uuid);
    cm.focus();
}

/**
 * Creates and initializes the CodeMirror editor
 * @param {HTMLElement} container - Optional container element (defaults to primary editor container)
 * @param {boolean} isPrimary - Whether this is the primary editor (default: true)
 */
export function createEditor(container = null, isPrimary = true) {
  const targetContainer = container || elements.editorContainer;
  const wrapper = document.createElement("div");
  wrapper.style.height = "100%";
  wrapper.style.width = "100%";
  wrapper.id = isPrimary ? "codemirror-wrapper" : "codemirror-wrapper-secondary";
  targetContainer.appendChild(wrapper);

  const cmTheme = state.theme === "dark" ? "material-darker" : "default";

  const editor = CodeMirror(wrapper, {
    value: "",
    mode: null,
    theme: cmTheme,
    lineNumbers: state.showLineNumbers,
    lineWrapping: state.wordWrap,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    foldGutter: true,
    indentUnit: state.tabSize || 2,
    tabSize: state.tabSize || 2,
    indentWithTabs: state.indentWithTabs || false,
    gutters: state.showLineNumbers ? ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"] : ["CodeMirror-foldgutter", "CodeMirror-lint-markers"],
    hintOptions: {
      hint: homeAssistantHint,
      completeSingle: false,
      closeOnUnfocus: true,
      alignWithWord: true,
      closeCharacters: /[\s()\[\]{};:>,]/
    },
    extraKeys: {
      "Cmd-D": (cm) => selectNextOccurrence(cm),
      "Ctrl-D": (cm) => selectNextOccurrence(cm),
      // These are no-ops to block CodeMirror's built-in handlers.
      // The actual logic lives in the global keydown handler (coordinators/index.js).
      "Ctrl-F": () => {},
      "Cmd-F": () => {},
      "Ctrl-H": () => {},
      "Cmd-Option-F": () => {},
      "Ctrl-K": () => {},
      "Cmd-K": () => {},
      "Ctrl-E": () => {},
      "Cmd-E": () => {},
      "Ctrl-/": () => {},
      "Cmd-/": () => {},
      "Ctrl-G": () => {
        const activeEditor = state.splitView.enabled ?
          (state.splitView.activePane === 'primary' ? state.primaryEditor : state.secondaryEditor) :
          editor;
        if (activeEditor) activeEditor.execCommand("jumpToLine");
      },
      "Cmd-G": () => {
        const activeEditor = state.splitView.enabled ?
          (state.splitView.activePane === 'primary' ? state.primaryEditor : state.secondaryEditor) :
          editor;
        if (activeEditor) activeEditor.execCommand("jumpToLine");
      },
      // Line Operations
      "Alt-Up": (cm) => moveLines(cm, -1),
      "Alt-Down": (cm) => moveLines(cm, 1),
      "Shift-Ctrl-Up": (cm) => moveLines(cm, -1),
      "Shift-Cmd-Up": (cm) => moveLines(cm, -1),
      "Shift-Ctrl-Down": (cm) => moveLines(cm, 1),
      "Shift-Cmd-Down": (cm) => moveLines(cm, 1),
      "Shift-Alt-Up": (cm) => duplicateLines(cm, "up"),
      "Shift-Alt-Down": (cm) => duplicateLines(cm, "down"),
      "Ctrl-Alt-Up": (cm) => duplicateLines(cm, "up"),
      "Cmd-Alt-Up": (cm) => duplicateLines(cm, "up"),
      "Ctrl-Alt-Down": (cm) => duplicateLines(cm, "down"),
      "Cmd-Alt-Down": (cm) => duplicateLines(cm, "down"),

      "Ctrl-Alt-[": (cm) => cm.execCommand("foldAll"),
      "Cmd-Alt-[": (cm) => cm.execCommand("foldAll"),
      "Ctrl-Alt-]": (cm) => cm.execCommand("unfoldAll"),
      "Cmd-Alt-]": (cm) => cm.execCommand("unfoldAll"),

      "Ctrl-Space": (cm) => {
        cm.showHint({ hint: homeAssistantHint });
      },

      // Split View shortcuts
      "Cmd-\\": () => {
        if (!state.enableSplitView) return; // Feature must be enabled
        if (state.openTabs.length < 2) return; // Need at least 2 tabs
        if (state.splitView.enabled) {
          disableSplitView();
        } else {
          enableSplitView('vertical');
        }
      },
      "Ctrl-\\": () => {
        if (!state.enableSplitView) return;
        if (state.openTabs.length < 2) return;
        if (state.splitView.enabled) {
          disableSplitView();
        } else {
          enableSplitView('vertical');
        }
      },
    },
    inputStyle: "contenteditable",
  });

  // Set state references
  if (isPrimary) {
    state.primaryEditor = editor;
    state.editor = editor; // state.editor always points to primary initially
  } else {
    state.secondaryEditor = editor;
  }

  // Apply font and custom syntax settings via events
  eventBus.emit('ui:refresh-editor');

  // Aggressive Global Capture Listener for Shortcuts (Move/Duplicate Lines)
  // Only set up once for primary editor
  if (isPrimary) {
    // GLOBAL TAB HANDLER - Bypass CodeMirror's keymap system
    const handleGlobalTab = (e) => {
      // Only handle Tab key
      if (e.key !== "Tab" && e.keyCode !== 9) return;

      // Get active editor (primary or secondary)
      const activeEditor = state.splitView?.enabled && state.splitView?.activePane === 'secondary'
        ? state.secondaryEditor
        : state.primaryEditor;

      // Only handle if editor has focus
      if (!activeEditor || !activeEditor.hasFocus()) return;

      e.preventDefault();
      e.stopPropagation();

      const spaces = activeEditor.getOption("indentUnit");
      const useTab = activeEditor.getOption("indentWithTabs");

      if (e.shiftKey) {
        // Shift+Tab = unindent
        if (activeEditor.somethingSelected()) {
          activeEditor.indentSelection("subtract");
        }
      } else {
        // Tab = indent
        if (activeEditor.somethingSelected()) {
          activeEditor.indentSelection("add");
        } else {
          const indent = useTab ? "\t" : " ".repeat(spaces);
          activeEditor.replaceSelection(indent);
        }
      }
    };

    document.addEventListener("keydown", handleGlobalTab, true); // Use capture phase

    const handleGlobalShortcuts = (e) => {
      if (!state.editor || !state.editor.hasFocus()) return;

      const isUp = e.key === "ArrowUp" || e.keyCode === 38;
      const isDown = e.key === "ArrowDown" || e.keyCode === 40;

      if (!isUp && !isDown) return;

      let handled = false;

      // Move Line: Alt/Option + Arrow
      if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        moveLines(state.editor, isUp ? -1 : 1);
        handled = true;
      }

      // Duplicate Line: Shift + Alt/Option + Arrow
      else if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        duplicateLines(state.editor, isUp ? "up" : "down");
        handled = true;
      }

      // Backup: Cmd + Shift + Arrow (Mac override)
      else if (e.metaKey && e.shiftKey) {
        moveLines(state.editor, isUp ? -1 : 1);
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    // Remove previous listener if exists
    if (state._globalShortcutHandler) {
      window.removeEventListener("keydown", state._globalShortcutHandler, true);
    }
    state._globalShortcutHandler = handleGlobalShortcuts;
    window.addEventListener("keydown", handleGlobalShortcuts, true);
  }

  // Track changes
  editor.on("change", () => handleEditorChange(editor));

  // Track cursor position and scroll
  editor.on("cursorActivity", () => {
    eventBus.emit('ui:update-status-bar');
    eventBus.emit('settings:save-workspace-state');
  });

  editor.on("scroll", () => {
    eventBus.emit('settings:save-workspace-state');
  });

  // Focus handler - set active pane when editor is focused
  editor.on("focus", () => {
    if (state.splitView.enabled) {
      if (isPrimary) {
        state.splitView.activePane = 'primary';
        state.editor = state.primaryEditor;
      } else {
        state.splitView.activePane = 'secondary';
        state.editor = state.secondaryEditor;
      }
      eventBus.emit('editor:update-pane-active-state');
    }
  });

  // Block Scope Highlighting Logic
  let highlightedLines = [];

  const clearBlockHighlight = () => {
    highlightedLines.forEach(lh => {
      editor.removeLineClass(lh, "wrap", "cm-block-highlight-line");
      editor.removeLineClass(lh, "wrap", "cm-block-highlight-start");
      editor.removeLineClass(lh, "wrap", "cm-block-highlight-end");
    });
    highlightedLines = [];
    if (editor) {
      editor.getWrapperElement().style.removeProperty("--block-indent");
    }
  };

  editor.on("mousedown", (cm, e) => {
    // Clear existing on any click
    if (highlightedLines.length > 0) {
      clearBlockHighlight();
    }

    // Only handle left clicks
    if (e.button !== 0) return;

    // Ctrl/Cmd+click — jump to entity definition / inspect entity
    if ((e.ctrlKey || e.metaKey) && HA_ENTITIES.length > 0) {
      const pos = cm.coordsChar({ left: e.clientX, top: e.clientY });
      if (pos) {
        const lineText = cm.getLine(pos.line) || '';
        // Find entity_id token under cursor: domain.entity pattern
        const entityRe = /[a-z_]+\.[a-z0-9_]+/g;
        let m;
        while ((m = entityRe.exec(lineText)) !== null) {
          if (pos.ch >= m.index && pos.ch <= m.index + m[0].length) {
            const entityId = m[0];
            const entity = HA_ENTITIES.find(e => e.entity_id === entityId);
            if (entity) {
              e.preventDefault();
              e.codemirrorIgnore = true;
              _showEntityPopup(entity, e.clientX, e.clientY);
              return;
            }
            break;
          }
        }
      }
    }

    const pos = cm.coordsChar({left: e.clientX, top: e.clientY});
    if (!pos) return;

    const lineText = cm.getLine(pos.line);

    // Robust detection: Any line that looks like a key definition (e.g. "key:", "- key:", "  key:")
    // We ignore comments
    if (lineText.trim().startsWith("#")) return;

    const isKeyLine = /^\s*(- )?[\w_]+:/.test(lineText);

    if (isKeyLine) {
      const lineNum = pos.line;

      // Calculate base indentation
      const indentMatch = lineText.match(/^\s*/);
      const baseIndent = indentMatch ? indentMatch[0].length : 0;

      const totalLines = cm.lineCount();
      let endLine = lineNum;

      // Find scope
      for (let i = lineNum + 1; i < totalLines; i++) {
        const nextLineText = cm.getLine(i);

        if (nextLineText.trim().length === 0) {
          if (i < totalLines - 1) continue;
          else break;
        }

        const nextIndentMatch = nextLineText.match(/^\s*/);
        const nextIndent = nextIndentMatch ? nextIndentMatch[0].length : 0;

        // Block continues if indentation is deeper or it's a list item at same level
        const isNextListItem = /^\s*- /.test(nextLineText);
        const startIsListItem = /^\s*- /.test(lineText);

        if (nextIndent > baseIndent || (nextIndent === baseIndent && isNextListItem && !startIsListItem)) {
          endLine = i;
        } else {
          break;
        }
      }

      // Apply highlight
      if (endLine >= lineNum) {
        clearBlockHighlight(); // Ensure clear

        // Set indentation variable
        const coords = cm.charCoords({line: lineNum, ch: baseIndent}, "local");
        editor.getWrapperElement().style.setProperty("--block-indent", `${coords.left}px`);

        for (let i = lineNum; i <= endLine; i++) {
          const lineHandle = cm.addLineClass(i, "wrap", "cm-block-highlight-line");
          if (i === lineNum) cm.addLineClass(i, "wrap", "cm-block-highlight-start");
          if (i === endLine) cm.addLineClass(i, "wrap", "cm-block-highlight-end");
          highlightedLines.push(lineHandle);
        }
      }
    }
  });

  // Auto-trigger autocomplete for YAML files
  editor.on("inputRead", (cm, changeObj) => {
    // Only auto-complete in YAML mode
    const mode = cm.getOption("mode");
    if (mode !== "ha-yaml" && mode !== "yaml") return;

    // Don't autocomplete if we're in the middle of completing
    if (cm.state.completionActive) return;

    // Get the character that was just typed
    const text = changeObj.text[0];

    // Auto-trigger on certain characters
    const autoTriggerChars = [':', ' ', '-', '!', '.'];
    const lastChar = text[text.length - 1];

    // Auto-trigger after typing certain characters or when starting a new word
    if (autoTriggerChars.includes(lastChar) ||
        (text.match(/^[a-zA-Z]$/) && changeObj.origin === "+input")) {

      // Small delay to make it feel more natural
      setTimeout(() => {
        if (!cm.state.completionActive) {
          cm.showHint({
            hint: homeAssistantHint,
            completeSingle: false
          });
        }
      }, 100);
    }
  });

  // Initial refresh
  editor.refresh();

  return editor;
}

/**
 * Creates secondary editor instance
 */
export function createSecondaryEditor() {
  const container = document.getElementById('secondary-editor-container');
  if (!container) {
    console.error('Secondary editor container not found');
    return null;
  }

  return createEditor(container, false);
}

/**
 * Destroys secondary editor instance
 */
export function destroySecondaryEditor() {
  if (state.secondaryEditor) {
    const wrapper = state.secondaryEditor.getWrapperElement();
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
    state.secondaryEditor = null;
  }
}

/**
 * Generic linter function that validates by file type
 * @param {string} fileName - The name of the file being edited
 * @returns {Function} A linter function for CodeMirror
 */
export function createLinter(fileName) {
  return function(content, updateLinting) {
    validateByFileType(fileName, content).then((result) => {
      const annotations = [];

      // Handle errors
      if (!result.valid && result.errors) {
        result.errors.forEach((error) => {
          const line = (error.line || 1) - 1;
          const column = error.column || 0;
          annotations.push({
            from: CodeMirror.Pos(line, column),
            to: CodeMirror.Pos(line, 100),
            message: error.message || error.error || "Syntax error",
            severity: "error",
          });
        });
      }

      // Handle warnings
      if (result.warnings) {
        result.warnings.forEach((warning) => {
          const line = (warning.line || 1) - 1;
          const column = warning.column || 0;
          annotations.push({
            from: CodeMirror.Pos(line, column),
            to: CodeMirror.Pos(line, 100),
            message: warning.message || "Warning",
            severity: "warning",
          });
        });
      }

      // Handle legacy error format (for backwards compatibility)
      if (!result.valid && result.error && !result.errors) {
        const match = result.error.match(/line (\d+)/);
        if (match) {
          const line = parseInt(match[1]) - 1;
          annotations.push({
            from: CodeMirror.Pos(line, 0),
            to: CodeMirror.Pos(line, 100),
            message: result.error,
            severity: "error",
          });
        }
      }

      updateLinting(annotations);
    });
  };
}

/**
 * YAML linter function (legacy - kept for backwards compatibility)
 */
export function yamlLinter(content, updateLinting) {
  validateYaml(content).then((result) => {
    const annotations = [];
    if (!result.valid && result.error) {
      const match = result.error.match(/line (\d+)/);
      if (match) {
        const line = parseInt(match[1]) - 1;
        annotations.push({
          from: CodeMirror.Pos(line, 0),
          to: CodeMirror.Pos(line, 100),
          message: result.error,
          severity: "error",
        });
      }
    }
    updateLinting(annotations);
  });
}

/**
 * Detects indentation style and size from content
 */
export function detectIndentation(content) {
  if (!content) {
    return { tabs: state.indentWithTabs, size: state.tabSize };
  }

  const lines = content.split("\n").slice(0, 100); // Check first 100 lines
  let tabs = 0;
  let spaces = 0;
  const spaceCounts = {};

  lines.forEach(line => {
    const indentMatch = line.match(/^(\s+)/);
    if (indentMatch) {
      const indent = indentMatch[1];
      if (indent.includes("\t")) {
        tabs++;
      } else {
        // Ignore lines that are just whitespace
        if (indent.length === line.length) return;

        spaces++;
        const count = indent.length;
        if (count > 0) {
          spaceCounts[count] = (spaceCounts[count] || 0) + 1;
        }
      }
    }
  });

  if (tabs > spaces) {
    return { tabs: true, size: 4 }; // Default tab size 4
  }

  // Find most common indentation jump
  let bestSize = state.tabSize || 2;  // Default to user preference, not hardcoded 2
  let maxFreq = 0;
  for (const [size, freq] of Object.entries(spaceCounts)) {
    if (freq > maxFreq) {
      maxFreq = freq;
      bestSize = parseInt(size);
    }
  }

  // Home Assistant standard is 2, so if it's 0 or weird, default to user preference
  return { tabs: false, size: bestSize || state.tabSize };
}

/**
 * Handles editor content changes
 * @param {CodeMirror} editor - The editor that changed (optional, defaults to state.editor)
 */
export function handleEditorChange(editor = null) {
  const targetEditor = editor || state.editor;
  if (!targetEditor) return;

  // Determine which tab to update based on which editor changed
  let targetTab = state.activeTab;

  if (state.splitView.enabled) {
    if (targetEditor === state.primaryEditor) {
      targetTab = state.splitView.primaryActiveTab;
    } else if (targetEditor === state.secondaryEditor) {
      targetTab = state.splitView.secondaryActiveTab;
    }
  }

  if (!targetTab) return;

  const currentContent = targetEditor.getValue();
  targetTab.content = currentContent;
  targetTab.modified = currentContent !== targetTab.originalContent;

  eventBus.emit('ui:update-toolbar-state');
  eventBus.emit('ui:refresh-tabs');
  eventBus.emit('ui:refresh-tree');

  // Handle auto-save
  eventBus.emit('file:trigger-autosave');
}

/**
 * Selects next occurrence of current selection (multi-cursor)
 */
export function selectNextOccurrence(cm) {
  const selections = cm.listSelections();
  if (selections.length === 0) return;

  // Use the last selection (the most recently added one) as the reference
  const lastSelection = selections[selections.length - 1];

  // If text is not selected, select the word under cursor
  if (lastSelection.empty()) {
    const word = cm.findWordAt(lastSelection.head);
    // Replace the last empty cursor with the word selection
    const newSelections = selections.slice(0, -1);
    newSelections.push({ anchor: word.anchor, head: word.head });
    cm.setSelections(newSelections);
    return;
  }

  // Get the selection range ordered (important for getRange)
  const anchor = lastSelection.anchor;
  const head = lastSelection.head;
  const isHeadAfterAnchor = (head.line > anchor.line || (head.line === anchor.line && head.ch > anchor.ch));
  const from = isHeadAfterAnchor ? anchor : head;
  const to = isHeadAfterAnchor ? head : anchor;

  // Get the text to match
  const query = cm.getRange(from, to);
  if (!query) return;

  // Check if searchcursor addon is loaded
  if (!cm.getSearchCursor) {
    console.warn("CodeMirror searchcursor addon not loaded");
    return;
  }

  // Find next occurrence starting from the end of the last selection
  const cursor = cm.getSearchCursor(query, to, { caseFold: false });

  if (cursor.findNext()) {
    cm.addSelection(cursor.from(), cursor.to());
    cm.scrollIntoView(cursor.to(), 20);
  }
}

/**
 * Moves selected lines up or down
 * @param {CodeMirror} cm - CodeMirror instance
 * @param {number} direction - -1 for up, 1 for down
 */
function moveLines(cm, direction) {
  cm.operation(() => {
    const range = cm.listSelections()[0];
    const startLine = Math.min(range.head.line, range.anchor.line);
    const endLine = Math.max(range.head.line, range.anchor.line);

    if (direction === -1) { // Up
      if (startLine === 0) return;
      const textToMove = cm.getRange({line: startLine, ch: 0}, {line: endLine, ch: cm.getLine(endLine).length});
      const textAbove = cm.getLine(startLine - 1);

      cm.replaceRange(textToMove + "\n" + textAbove,
        {line: startLine - 1, ch: 0},
        {line: endLine, ch: cm.getLine(endLine).length}
      );

      cm.setSelection(
        {line: range.anchor.line - 1, ch: range.anchor.ch},
        {line: range.head.line - 1, ch: range.head.ch}
      );
    } else { // Down
      if (endLine === cm.lastLine()) return;
      const textToMove = cm.getRange({line: startLine, ch: 0}, {line: endLine, ch: cm.getLine(endLine).length});
      const textBelow = cm.getLine(endLine + 1);

      cm.replaceRange(textBelow + "\n" + textToMove,
        {line: startLine, ch: 0},
        {line: endLine + 1, ch: cm.getLine(endLine + 1).length}
      );

      cm.setSelection(
        {line: range.anchor.line + 1, ch: range.anchor.ch},
        {line: range.head.line + 1, ch: range.head.ch}
      );
    }
  });
}

/**
 * Duplicates selected lines up or down
 * @param {CodeMirror} cm - CodeMirror instance
 * @param {string} direction - "up" or "down"
 */
function duplicateLines(cm, direction) {
  cm.operation(() => {
    const range = cm.listSelections()[0];
    const startLine = Math.min(range.head.line, range.anchor.line);
    const endLine = Math.max(range.head.line, range.anchor.line);
    const text = cm.getRange({line: startLine, ch: 0}, {line: endLine, ch: cm.getLine(endLine).length});

    if (direction === "up") {
      cm.replaceRange(text + "\n", {line: startLine, ch: 0});
      const lineCount = endLine - startLine + 1;
      cm.setSelection(
        {line: range.anchor.line + lineCount, ch: range.anchor.ch},
        {line: range.head.line + lineCount, ch: range.head.ch}
      );
    } else { // Down
      cm.replaceRange("\n" + text, {line: endLine, ch: cm.getLine(endLine).length});
    }
  });
}

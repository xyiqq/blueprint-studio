/** EDITOR.JS | Purpose: * Handles CodeMirror editor initialization, configuration, editor-specific */
import { state, elements } from './state.js';
import { eventBus } from './event-bus.js';
import { validateYaml, validateByFileType } from './file-operations.js';
import { homeAssistantHint } from './ha-autocomplete.js';
import { enableSplitView, disableSplitView } from './split-view.js';

// CodeMirror is loaded globally via script tags


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

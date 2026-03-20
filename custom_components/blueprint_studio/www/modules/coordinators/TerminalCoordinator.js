/**
 * TERMINAL-COORDINATOR.JS | Purpose:
 * Coordinates all terminal-related operations, including visibility and command execution.
 * This is a "piece" of the decomposed app.js.
 */

import { state } from '../state.js';
import { eventBus } from '../event-bus.js';

// Functions provided via callbacks during initialization
let functions = {
    toggleTerminal: null,
    openTerminalTab: null,
    closeTerminalTab: null,
    onTerminalTabClosed: null,
    runCommand: null,
    fitTerminal: null,
    getAuthToken: null,
    applyTerminalVisibility: null
};

/**
 * Initializes the Terminal Coordinator by registering event listeners
 * @param {Object} callbacks - Implementation functions from app.js
 */
export function initTerminalCoordinator(callbacks) {
    functions = { ...functions, ...callbacks };

    // Terminal Visibility
    eventBus.on("terminal:toggle", (data) => {
        if (functions.toggleTerminal) {
            functions.toggleTerminal(data);
        } else {
            console.warn("[TerminalCoordinator] toggleTerminal implementation not registered");
        }
    });

    eventBus.on("terminal:apply-visibility", () => {
        if (functions.applyTerminalVisibility) functions.applyTerminalVisibility();
    });

    eventBus.on("terminal:fit", () => {
        if (functions.fitTerminal) functions.fitTerminal();
    });

    eventBus.on("terminal:open", () => {
        if (functions.toggleTerminal && !state.terminalVisible) {
            functions.toggleTerminal();
        }
    });

    eventBus.on("terminal:open-tab", () => {
        if (functions.openTerminalTab) functions.openTerminalTab();
    });

    eventBus.on("terminal:close-tab", () => {
        if (functions.closeTerminalTab) functions.closeTerminalTab();
    });

    eventBus.on("tab:close", (data) => {
        const tab = (data && data.tab) ? data.tab : data;
        if (tab.isTerminal && functions.onTerminalTabClosed) {
            functions.onTerminalTabClosed();
        }
    });

    // Command Execution
    eventBus.on('terminal:run', (data) => {
        if (state.terminalIntegrationEnabled && functions.runCommand) {
            // If caller already built the command string, use it directly
            if (data.cmd) {
                functions.runCommand(data.cmd);
                return;
            }

            // SFTP paths can't run locally — skip for now
            if (data.isSftp) return;

            // Build command from path + isFolder
            let cmd = "";
            if (data.isFolder) {
                cmd = `ls -la "${data.path}"`;
            } else {
                const ext = data.path.split('.').pop().toLowerCase();
                if (ext === 'py') {
                    cmd = `python3 "${data.path}"`;
                } else {
                    cmd = `cat "${data.path}"`;
                }
            }
            functions.runCommand(cmd);
        }
    });
}

/**
 * Gets auth token via registered callback
 */
export async function getAuthToken() {
    if (functions.getAuthToken) {
        return await functions.getAuthToken();
    }
    return null;
}

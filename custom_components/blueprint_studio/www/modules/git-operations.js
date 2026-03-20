import { state, elements, gitState, giteaState } from './state.js';
import { fetchWithAuth } from './api.js';
import { eventBus } from './event-bus.js';
import { API_BASE } from './constants.js';
import {
  showToast,
  showGlobalLoading,
  hideGlobalLoading,
  showConfirmDialog,
  showModal,
  setButtonLoading
} from './ui.js';
import { t } from './translations.js';

/**
 * Check if Git integration is enabled
 */
export function isGitEnabled() {
  return localStorage.getItem("gitIntegrationEnabled") !== "false";
}

/**
 * Check git status if enabled (wrapper for both Git and Gitea)
 */
export async function checkGitStatusIfEnabled(shouldFetch = false, silent = false) {
  if (isGitEnabled()) {
    await gitStatus(shouldFetch, silent);
  }
  if (state.giteaIntegrationEnabled) {
    eventBus.emit('gitea:status-check', { fetch: shouldFetch, silent: silent });
  }
}

/**
 * Get git status from server
 */
export async function gitStatus(shouldFetch = false, silent = false) {
  if (!isGitEnabled()) return;

  try {
    if (!silent) {
      if (elements.btnGitStatus) elements.btnGitStatus.classList.add("pulsing");
    }

    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "git_status",
        fetch: shouldFetch
      }),
    });

    if (!silent) {
      if (elements.btnGitStatus) elements.btnGitStatus.classList.remove("pulsing");
    }

    if (data.success) {
      const currentChangesList = JSON.stringify(data.files);
      const hasMeaningfulChange = state._lastGitChanges && state._lastGitChanges !== currentChangesList;
      state._lastGitChanges = currentChangesList;

      gitState.isInitialized = data.is_initialized;
      gitState.hasRemote = data.has_remote;
      gitState.currentBranch = data.current_branch || "unknown";
      gitState.localBranches = data.local_branches || [];
      gitState.remoteBranches = data.remote_branches || [];
      gitState.ahead = data.ahead || 0;
      gitState.behind = data.behind || 0;
      gitState.status = data.status || "";

      gitState.files = data.files || {
        modified: [], added: [], deleted: [], untracked: [], staged: [], unstaged: []
      };

      gitState.totalChanges = [
        ...gitState.files.modified,
        ...gitState.files.added,
        ...gitState.files.deleted,
        ...gitState.files.untracked
      ].length;

      eventBus.emit('git:refresh');

      if (!silent) {
        if (data.has_changes) {
          showToast(t("toast.git_changes_detected", {count: gitState.totalChanges}), "success");
        } else {
          showToast(t("toast.git_tree_clean"), "success");
        }
      }
    }
  } catch (error) {
    if (!silent) {
      if (elements.btnGitStatus) elements.btnGitStatus.classList.remove("pulsing");
      showToast(t("toast.git_error", { error: error.message }), "error");
    }
  }
}

/**
 * Initialize a new Git repository
 */
export async function gitInit(skipConfirm = false) {
  if (!skipConfirm) {
    const confirmed = await showConfirmDialog({
      title: t("modal.move_file_title"),
      message: t("modal.new_folder_hint"),
      confirmText: t("modal.confirm_button"),
      cancelText: t("modal.cancel_button")
    });
    if (!confirmed) return false;
  }

  try {
    showToast(t("toast.git_init_started"), "success");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_init" }),
    });

    if (data.success) {
      showToast(t("toast.git_init_success"), "success");
      try {
        await fetchWithAuth(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "git_rename_branch", old_name: "master", new_name: "main" }),
        });
      } catch (e) {}
      gitState.isInitialized = True;
      await gitStatus();
      return true;
    } else {
      showToast(t("toast.git_init_failed") + ": " + (data.message || "Unknown error"), "error");
    }
  } catch (error) {
    showToast(t("toast.git_init_failed") + ": " + error.message, "error");
  }
  return false;
}

/**
 * Abort current rebase or merge operation
 */
export async function abortGitOperation() {
  const confirmed = await showConfirmDialog({
    title: t("gitea.abort_title"),
    message: t("gitea.abort_message"),
    confirmText: t("gitea.abort_confirm"),
    cancelText: t("modal.cancel_button")
  });

  if (!confirmed) return;

  try {
    showGlobalLoading("Aborting operation...");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_abort" }),
    });
    hideGlobalLoading();

    if (data.success) {
      showToast(t("toast.git_abort_success"), "success");
      await gitStatus();
    } else {
      showToast(t("toast.git_abort_fail", { error: data.message }), "error");
    }
  } catch (e) {
    hideGlobalLoading();
    showToast(t("toast.git_error", { error: e.message }), "error");
  }
}

/**
 * Force push to remote
 */
export async function forcePush() {
  const confirmed = await showConfirmDialog({
    title: t("gitea.force_push_title"),
    message: t("gitea.force_push_message"),
    confirmText: t("sidebar.commit"),
    cancelText: t("modal.cancel_button")
  });

  if (!confirmed) return;

  try {
    showGlobalLoading(t("modal.confirm") + "...");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_force_push" }),
    });
    hideGlobalLoading();

    if (data.success) {
      showToast(t("toast.git_push_success"), "success");
      await gitStatus(true);
    } else {
      showToast(t("toast.git_force_push_fail", { error: data.message }), "error");
    }
  } catch (e) {
    hideGlobalLoading();
    showToast(t("toast.git_error", { error: e.message }), "error");
  }
}

/**
 * Hard reset to remote
 */
export async function hardReset() {
  const confirmed = await showConfirmDialog({
    title: t("gitea.hard_reset_title"),
    message: t("gitea.hard_reset_message"),
    confirmText: t("toolbar.refresh"),
    cancelText: t("modal.cancel_button")
  });

  if (!confirmed) return;

  try {
    showGlobalLoading(t("modal.confirm") + "...");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_hard_reset", branch: gitState.currentBranch }),
    });
    hideGlobalLoading();

    if (data.success) {
      showToast(t("toast.git_reset_success"), "success");
      eventBus.emit('ui:reload-files');
      await gitStatus(true);
    } else {
      showToast(t("toast.git_reset_fail", { error: data.message }), "error");
    }
  } catch (e) {
    hideGlobalLoading();
    showToast(t("toast.git_error", { error: e.message }), "error");
  }
}

/**
 * Delete a remote branch
 */
export async function deleteRemoteBranch(branchName) {
  const confirmed = await showConfirmDialog({
    title: "Delete GitHub Branch",
    message: `<p>Are you sure you want to delete the branch <b>${branchName}</b> from GitHub?</p><p>This cannot be undone.</p>`,
    confirmText: "Delete Branch",
    cancelText: "Cancel"
  });

  if (!confirmed) return;

  try {
    showGlobalLoading(`Deleting branch ${branchName}...`);
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_delete_remote_branch", branch: branchName }),
    });
    hideGlobalLoading();

    if (data.success) {
      showToast(data.message, "success");
      await gitStatus(true);
    }
  } catch (e) {
    hideGlobalLoading();
    let errorMsg = e.message || "Unknown error";
    if (errorMsg.includes("refusing to delete the current branch")) {
      const autoFix = await showConfirmDialog({
        title: "Switch Default Branch?",
        message: `<p>GitHub won't let us delete <b>${branchName}</b> because it is currently the Default Branch.</p><br><p>Would you like to make <b>main</b> default and then delete <b>${branchName}</b>?</p>`,
        confirmText: "Yes, Fix Automatically",
        cancelText: "No"
      });

      if (autoFix) {
        try {
          showGlobalLoading("Setting 'main' as default branch...");
          const patchData = await fetchWithAuth(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "github_set_default_branch", branch: "main" }),
          });

          if (patchData.success) {
            const deleteData = await fetchWithAuth(API_BASE, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "git_delete_remote_branch", branch: branchName }),
            });
            hideGlobalLoading();
            if (deleteData.success) {
              showToast(t("toast.success"), "success");
              await gitStatus(true);
            }
          }
        } catch (err) {
          hideGlobalLoading();
          showToast(t("toast.autofix_failed", { error: err.message }), "error");
        }
      }
    } else {
      showToast(t("toast.delete_failed_msg", { error: errorMsg }), "error");
    }
  }
}

/**
 * Get list of git remotes
 */
export async function gitGetRemotes() {
  try {
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_get_remotes" }),
    });
    if (data.success) return data.remotes || {};
  } catch (error) {
    return {};
  }
}

/**
 * Set git credentials
 */
export async function gitSetCredentials(username, token, rememberMe = true) {
  try {
    showToast(t("toast.git_creds_started"), "success");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_set_credentials", username, token, remember_me: rememberMe }),
    });
    if (data.success) {
      showToast(t("toast.git_creds_saved"), "success");
      return true;
    }
  } catch (error) {
    showToast(t("toast.git_conn_failed") + ": " + error.message, "error");
    return false;
  }
}

/**
 * Stage files
 */
export async function gitStage(files) {
  if (!files || files.length === 0) return;
  try {
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_stage", files }),
    });

    if (data.success) {
      showToast(data.message, "success");
      await gitStatus();
    } else {
      const errorMsg = data.message || "";
      if (errorMsg.includes("index.lock") || errorMsg.includes("File exists")) {
        showToast(t("toast.git_lock_fail"), "error", 0, {
          text: t("gitea.clean_locks"),
          callback: async () => { await handleGitLockAndRetry(files); }
        });
      } else {
        showToast(t("toast.git_stage_fail", { error: errorMsg }), "error");
      }
    }
  } catch (error) {
    showToast(t("toast.git_stage_fail", { error: error.message }), "error");
  }
}

/**
 * Clean locks and retry staging
 */
export async function handleGitLockAndRetry(files) {
  const cleaned = await gitCleanLocks();
  if (cleaned) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const retryData = await fetchWithAuth(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "git_stage", files }),
      });
      if (retryData.success) {
        showToast(retryData.message, "success");
        await gitStatus();
      } else {
        showToast(t("toast.git_lock_fail"), "error");
      }
    } catch (e) {
      showToast(t("toast.git_lock_fail"), "error");
    }
  } else {
    showToast(t("toast.github_clean_locks_fail"), "error");
  }
}

/**
 * Clean Git lock files
 */
export async function gitCleanLocks() {
  try {
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_clean_locks" }),
    });
    if (data.success) {
      showToast(data.message, "success");
      return true;
    } else {
      showToast(t("toast.github_clean_locks_fail"), "error");
      return false;
    }
  } catch (error) {
    showToast(t("toast.github_clean_locks_fail") + ": " + error.message, "error");
    return false;
  }
}

/**
 * Repair Git Index
 */
export async function gitRepairIndex() {
  try {
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_repair_index" }),
    });
    if (data.success) {
      showToast(data.message, "success");
      return true;
    } else {
      showToast(t("toast.github_repair_failed", { error: "Unknown error" }), "error");
      return false;
    }
  } catch (error) {
    showToast(t("toast.github_repair_failed", { error: error.message }), "error");
    return false;
  }
}

/**
 * Unstage files
 */
export async function gitUnstage(files) {
  if (!files || files.length === 0) return;
  try {
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_unstage", files }),
    });
    if (data.success) {
      showToast(data.message, "success");
      await gitStatus();
    }
  } catch (error) {
    showToast(t("toast.git_unstage_fail", { error: error.message }), "error");
  }
}

/**
 * Reset changes to files
 */
export async function gitReset(files) {
  if (!files || files.length === 0) return;
  const confirmed = await showConfirmDialog({
    title: "Discard Changes",
    message: `Are you sure you want to discard changes to ${files.length} file(s)?`,
    confirmText: "Discard",
    cancelText: "Cancel",
    isDanger: true
  });
  if (!confirmed) return;
  try {
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_reset", files }),
    });
    if (data.success) {
      showToast(data.message, "success");
      await gitStatus();
    }
  } catch (error) {
    showToast(t("toast.git_reset_fail", { error: error.message }), "error");
  }
}

/**
 * Commit staged changes
 */
export async function gitCommit(commitMessage) {
  try {
    showToast(t("toast.git_commit_started"), "success");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_commit", commit_message: commitMessage }),
    });
    if (data.success) {
      showToast(t("toast.git_commit_success"), "success");
      await gitStatus();
      return true;
    }
  } catch (error) {
    const errorMsg = error.message || "";
    if (errorMsg.includes("lock")) {
      showToast(t("toast.git_lock_fail"), "error", 0, {
        text: t("gitea.clean_locks"),
        callback: async () => { await gitCleanLocks(); }
      });
    } else {
      showToast(t("toast.git_commit_fail", { error: error.message }), "error");
    }
    return false;
  }
}

/**
 * Pull changes from remote
 */
export async function gitPull() {
  const confirmed = await showConfirmDialog({
    title: t("sidebar.git_changes"),
    message: t("gitea.pull_confirm"),
    confirmText: t("toolbar.upload"),
    cancelText: t("modal.cancel_button")
  });
  if (!confirmed) return;
  try {
    setButtonLoading(elements.btnGitPull, true);
    showToast(t("toast.git_pull_started"), "success");
    const data = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_pull" }),
    });
    setButtonLoading(elements.btnGitPull, false);
    if (data.success) {
      showToast(t("toast.git_pull_success"), "success");
      await new Promise(resolve => setTimeout(resolve, 500));
      eventBus.emit('ui:reload-files');
      eventBus.emit('git:status-check');
      if (state.activeTab) eventBus.emit('file:open', { path: state.activeTab.path, forceReload: true });
    }
  } catch (error) {
    setButtonLoading(elements.btnGitPull, false);
    showToast(t("toast.gitea_pull_failed", { error: error.message }), "error");
  }
}

/**
 * Push changes to remote
 */
export async function gitPush() {
  try {
    if (gitState.files.staged.length > 0) {
      const shouldCommit = await showConfirmDialog({
        title: t("sidebar.git_changes"),
        message: t("gitea.pull_confirm"),
        confirmText: t("sidebar.commit"),
        cancelText: t("modal.cancel_button")
      });
      if (shouldCommit) eventBus.emit('git:commit-staged');
    }

    setButtonLoading(elements.btnGitPush, true);
    showToast(t("toast.git_push_started"), "info");

    const pushData = await fetchWithAuth(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "git_push_only" }),
    });

    if (pushData.success) {
      setButtonLoading(elements.btnGitPush, false);
      showToast(t("toast.git_push_success"), "success");
      await gitStatus();
      return;
    }

    const errorMessage = pushData.message || pushData.error || "Unknown error";
    if (errorMessage.includes("uncommitted changes")) {
      setButtonLoading(elements.btnGitPush, false);
      const commitMessage = await showModal({
        title: t("sidebar.commit"),
        placeholder: "Commit message",
        value: "Update configuration via Blueprint Studio",
        hint: errorMessage,
      });
      if (!commitMessage) return;
      setButtonLoading(elements.btnGitPush, true);
      showToast(t("toast.git_commit_started"), "info");
      const data = await fetchWithAuth(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "git_push", commit_message: commitMessage }),
      });
      setButtonLoading(elements.btnGitPush, false);
      if (data.success) {
        showToast(t("toast.git_push_success"), "success");
        await gitStatus();
      } else {
        showToast(t("toast.gitea_push_failed", { error: data.message }), "error");
      }
    } else {
      setButtonLoading(elements.btnGitPush, false);
      showToast(t("toast.gitea_push_failed", { error: errorMessage }), "error");
    }
  } catch (error) {
    setButtonLoading(elements.btnGitPush, false);
    showToast(t("toast.gitea_push_failed", { error: error.message }), "error");
  }
}

"use strict";

(function initSettingsTabMdownManager(root) {
  let state = null;
  let helpers = null;
  let ops = null;

  const view = {
    status: null,
    statusSeq: 0,
    statusLoading: false,
    apiKeyDraft: "",
    baseUrlDraft: null, // null = show the stored value
    savePending: false,
  };

  function t(key) {
    return helpers.t(key);
  }

  function currentConfig() {
    const cfg = state.snapshot && state.snapshot.mdownManager;
    return {
      baseUrl: cfg && typeof cfg.baseUrl === "string" && cfg.baseUrl ? cfg.baseUrl : "http://127.0.0.1:7734",
      apiKey: cfg && typeof cfg.apiKey === "string" ? cfg.apiKey : "",
    };
  }

  function isEnabled() {
    const agents = state.snapshot && state.snapshot.agents;
    const entry = agents && agents["mdown-manager"];
    return !!(entry && entry.enabled === true);
  }

  function callCommand(action, payload) {
    if (!window.settingsAPI || typeof window.settingsAPI.command !== "function") {
      ops.showToast(t("toastSaveFailed") + "settings API unavailable", { error: true });
      return Promise.resolve({ status: "error" });
    }
    return window.settingsAPI.command(action, payload).catch((err) => ({
      status: "error",
      message: err && err.message,
    }));
  }

  function refreshStatus({ forceRender = false } = {}) {
    if (view.statusLoading) return;
    view.statusLoading = true;
    const hadStatus = !!view.status;
    const seq = ++view.statusSeq;
    callCommand("mdownManager.status").then((result) => {
      if (seq !== view.statusSeq) return;
      view.statusLoading = false;
      const updated = result && result.status === "ok";
      if (updated) view.status = result.state;
      if ((forceRender || (updated && !hadStatus)) && state.activeTab === "mdown-manager") {
        ops.requestRender({ content: true });
      }
    });
  }

  function render(parent) {
    refreshStatus();

    const h1 = document.createElement("h1");
    h1.textContent = t("mdownManagerTitle");
    parent.appendChild(h1);

    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = t("mdownManagerSubtitle");
    parent.appendChild(subtitle);

    parent.appendChild(buildStatusRow());
    parent.appendChild(helpers.buildSection(t("mdownManagerConnectionSectionTitle"), [
      buildBaseUrlRow(),
      buildApiKeyRow(),
    ]));
    parent.appendChild(helpers.buildSection(t("mdownManagerEnableSectionTitle"), [
      buildEnableRow(),
    ]));
  }

  function buildStatusRow() {
    const row = document.createElement("div");
    row.className = "row mdown-manager-status-row";
    const text = document.createElement("span");
    text.className = "row-desc";
    text.textContent = describeStatus();
    row.appendChild(text);
    return row;
  }

  function describeStatus() {
    const s = view.status;
    if (!s) return t("mdownManagerStatusChecking");
    if (!s.configured) return t("mdownManagerStatusNotConfigured");
    if (s.connected) return t("mdownManagerStatusConnected");
    if (s.reason === "unauthorized") return t("mdownManagerStatusUnauthorized");
    return t("mdownManagerStatusOffline");
  }

  function buildBaseUrlRow() {
    const cfg = currentConfig();
    const row = document.createElement("div");
    row.className = "row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("mdownManagerBaseUrlLabel");
    text.appendChild(label);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.className = "tg-approval-input";
    input.value = view.baseUrlDraft != null ? view.baseUrlDraft : cfg.baseUrl;
    input.addEventListener("input", () => {
      view.baseUrlDraft = input.value;
    });
    ctrl.appendChild(input);
    row.appendChild(ctrl);
    return row;
  }

  function buildApiKeyRow() {
    const cfg = currentConfig();
    const row = document.createElement("div");
    row.className = "row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("mdownManagerApiKeyLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("mdownManagerApiKeyHint");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control tg-approval-input-row";
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = cfg.apiKey
      ? t("mdownManagerApiKeyConfiguredPlaceholder")
      : t("mdownManagerApiKeyPlaceholder");
    input.className = "tg-approval-input";
    input.value = view.apiKeyDraft;
    input.addEventListener("input", () => {
      view.apiKeyDraft = input.value;
    });
    ctrl.appendChild(input);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "soft-btn accent";
    saveBtn.textContent = view.savePending ? t("mdownManagerSaving") : t("mdownManagerSave");
    saveBtn.disabled = view.savePending;
    saveBtn.addEventListener("click", saveConfig);
    ctrl.appendChild(saveBtn);

    row.appendChild(ctrl);
    return row;
  }

  function saveConfig() {
    const baseUrl = (view.baseUrlDraft != null ? view.baseUrlDraft : currentConfig().baseUrl).trim();
    if (!baseUrl) {
      ops.showToast(t("mdownManagerBaseUrlEmpty"), { error: true });
      return;
    }
    view.savePending = true;
    ops.requestRender({ content: true });
    callCommand("mdownManager.saveConfig", { baseUrl, apiKey: view.apiKeyDraft }).then((result) => {
      view.savePending = false;
      if (!result || result.status !== "ok") {
        ops.showToast((result && result.message) || t("toastSaveFailed"), { error: true });
        ops.requestRender({ content: true });
        return;
      }
      ops.showToast(t("mdownManagerConfigSaved"));
      view.apiKeyDraft = "";
      view.baseUrlDraft = null;
      view.status = null;
      refreshStatus({ forceRender: true });
    });
  }

  function buildEnableRow() {
    const enabled = isEnabled();
    const row = document.createElement("div");
    row.className = "row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("mdownManagerEnableLabel");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("mdownManagerEnableDesc");
    text.appendChild(label);
    text.appendChild(desc);
    row.appendChild(text);

    const ctrl = document.createElement("div");
    ctrl.className = "row-control";
    const sw = document.createElement("div");
    sw.className = "switch";
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    helpers.setSwitchVisual(sw, enabled, { pending: false });
    const toggle = () => {
      callCommand("setAgentFlag", { agentId: "mdown-manager", flag: "enabled", value: !enabled }).then((result) => {
        if (!result || result.status !== "ok") {
          ops.showToast((result && result.message) || t("toastSaveFailed"), { error: true });
        }
        ops.requestRender({ content: true });
      });
    };
    sw.addEventListener("click", toggle);
    sw.addEventListener("keydown", (ev) => {
      if (ev.key === " " || ev.key === "Enter") {
        ev.preventDefault();
        toggle();
      }
    });
    ctrl.appendChild(sw);
    row.appendChild(ctrl);
    return row;
  }

  function init(core) {
    state = core.state;
    helpers = core.helpers;
    ops = core.ops;
    core.tabs["mdown-manager"] = { render };
  }

  root.DeskBuddySettingsTabMdownManager = { init };
})(globalThis);

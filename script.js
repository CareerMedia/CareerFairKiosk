/**
 * IFRAME-ONLY kiosk logic (optimized):
 * - Adaptive polling (slow idle, fast active)
 * - Keeps iframe warm (no destroy/recreate)
 * - Pauses polling when tab is hidden
 */

const CONFIG = {
  ACTIVE_ENDPOINT: "https://cc-rep-info.careermedia.workers.dev/active",

  // Adaptive polling
  IDLE_POLL_MS: 3000,    // 3s when idle
  ACTIVE_POLL_MS: 500,   // fast when active

  // GitHub-side auto timeout back to idle:
  ACTIVE_TIMEOUT_MS: 120000, // 2 minutes

  SHOW_DEBUG_BADGE: true,
};

const els = {
  idle: document.getElementById("idle"),
  active: document.getElementById("active"),
  loading: document.getElementById("loading"),
  frame: document.getElementById("formFrame"),
  badge: document.getElementById("badge"),
};

let state = {
  lastItemId: null,
  lastFormUrl: null,
  activeTimer: null,
  pollTimer: null,
  currentPollMs: CONFIG.IDLE_POLL_MS,
  isActive: false,
};

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setBadge(text) {
  if (!CONFIG.SHOW_DEBUG_BADGE) return;
  els.badge.textContent = text;
  show(els.badge);
}

function startPolling(interval) {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.currentPollMs = interval;
  state.pollTimer = setInterval(pollOnce, interval);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function resetActiveTimer() {
  if (state.activeTimer) clearTimeout(state.activeTimer);
  state.activeTimer = setTimeout(() => {
    showIdle();
  }, CONFIG.ACTIVE_TIMEOUT_MS);
}

function showIdle() {
  if (!state.isActive && !els.idle.classList.contains("hidden")) return;

  state.isActive = false;
  state.lastItemId = null;
  state.lastFormUrl = null;

  if (state.activeTimer) clearTimeout(state.activeTimer);
  state.activeTimer = null;

  // Do NOT destroy iframe — just hide it (keeps it warm)
  hide(els.frame);
  hide(els.loading);

  show(els.idle);
  hide(els.active);

  setBadge("Idle");
  startPolling(CONFIG.IDLE_POLL_MS);
}

function showActive(formUrl, itemId) {
  // If same form already showing, just keep timers alive
  if (state.isActive && state.lastItemId === itemId && state.lastFormUrl === formUrl) {
    resetActiveTimer();
    return;
  }

  state.isActive = true;
  state.lastItemId = itemId;
  state.lastFormUrl = formUrl;

  hide(els.idle);
  show(els.active);

  show(els.loading);

  els.frame.onload = () => {
    hide(els.loading);
    setBadge(`Active • ${itemId}`);
  };

  // Only update src if it changed
  if (els.frame.src !== formUrl) {
    els.frame.src = formUrl;
  }

  show(els.frame);

  resetActiveTimer();
  startPolling(CONFIG.ACTIVE_POLL_MS);
  setBadge(`Active (loading) • ${itemId}`);
}

async function fetchActive() {
  const res = await fetch(CONFIG.ACTIVE_ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`Active endpoint HTTP ${res.status}`);
  return res.json();
}

async function pollOnce() {
  try {
    const data = await fetchActive();

    if (!data || data.active !== true) {
      showIdle();
      return;
    }

    const itemId = data.itemId || "unknown";
    const formUrl = data.formUrl;

    if (!formUrl) {
      // If active but no formUrl yet, stay idle visually
      showIdle();
      setBadge(`Idle (waiting for form) • ${itemId}`);
      return;
    }

    showActive(formUrl, itemId);
  } catch (err) {
    showIdle();
    setBadge("Idle (fetch error)");
    console.error(err);
  }
}

// Pause polling when tab is hidden (saves requests)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else {
    startPolling(state.isActive ? CONFIG.ACTIVE_POLL_MS : CONFIG.IDLE_POLL_MS);
  }
});

// Start
showIdle();
startPolling(CONFIG.IDLE_POLL_MS);
pollOnce();

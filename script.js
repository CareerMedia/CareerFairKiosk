/**
 * IFRAME-ONLY kiosk logic:
 * - Polls Cloudflare Worker /active
 * - If active:false => idle background
 * - If active:true => load formUrl into iframe full-screen
 * - Local timeout returns to idle after ACTIVE_TIMEOUT_MS
 */

const CONFIG = {
  ACTIVE_ENDPOINT: "https://cc-rep-info.careermedia.workers.dev/active",
  POLL_INTERVAL_MS: 1000,

  // GitHub-side auto timeout back to idle:
  ACTIVE_TIMEOUT_MS: 120000, // 2 minutes

  // Optional debug badge in bottom-right
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
};

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setBadge(text) {
  if (!CONFIG.SHOW_DEBUG_BADGE) return;
  els.badge.textContent = text;
  show(els.badge);
}

function resetActiveTimer() {
  if (state.activeTimer) clearTimeout(state.activeTimer);
  state.activeTimer = setTimeout(() => {
    showIdle();
  }, CONFIG.ACTIVE_TIMEOUT_MS);
}

function showIdle() {
  if (state.activeTimer) clearTimeout(state.activeTimer);
  state.activeTimer = null;

  state.lastItemId = null;
  state.lastFormUrl = null;

  els.frame.removeAttribute("src");
  hide(els.frame);
  hide(els.loading);

  show(els.idle);
  hide(els.active);

  setBadge("Idle");
}

function showActive(formUrl, itemId) {
  // Prevent flicker / reload if same form is already displayed
  if (state.lastItemId === itemId && state.lastFormUrl === formUrl) {
    resetActiveTimer();
    return;
  }

  state.lastItemId = itemId;
  state.lastFormUrl = formUrl;

  hide(els.idle);
  show(els.active);

  // Show loading until iframe fires onload
  show(els.loading);

  els.frame.onload = () => {
    hide(els.loading);
    setBadge(`Active • item ${itemId}`);
  };

  els.frame.src = formUrl;
  show(els.frame);

  resetActiveTimer();
  setBadge(`Active (loading) • item ${itemId}`);
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
      // Safe default: idle if we can’t load a form
      showIdle();
      setBadge(`Idle (no formUrl) • item ${itemId}`);
      return;
    }

    showActive(formUrl, itemId);
  } catch (err) {
    showIdle();
    setBadge("Idle (fetch error)");
    console.error(err);
  }
}

// Start
showIdle();
setInterval(pollOnce, CONFIG.POLL_INTERVAL_MS);
pollOnce();

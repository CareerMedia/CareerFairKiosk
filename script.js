/**
 * Kiosk logic:
 * - Polls Cloudflare Worker /active
 * - If active:false => show idle background
 * - If active:true => show form (iframe if possible, otherwise redirect)
 * - Local timeout returns to idle after ACTIVE_TIMEOUT_MS
 */

const CONFIG = {
  // Your Cloudflare Worker endpoint:
  ACTIVE_ENDPOINT: "https://cc-rep-info.careermedia.workers.dev/active",

  // How often the kiosk checks for changes:
  POLL_INTERVAL_MS: 1000,

  // Local timeout while active (GitHub-side reset):
  // Example: 2 minutes = 120000
  ACTIVE_TIMEOUT_MS: 120000,

  // If iframe doesn't appear to load within this window, assume it's blocked and redirect:
  IFRAME_LOAD_GRACE_MS: 2500,

  // Optional: show a little debug badge at bottom right
  SHOW_DEBUG_BADGE: true,
};

const els = {
  idle: document.getElementById("idle"),
  active: document.getElementById("active"),
  loading: document.getElementById("loading"),
  frame: document.getElementById("formFrame"),
  redirectMode: document.getElementById("redirectMode"),
  openFormLink: document.getElementById("openFormLink"),
  badge: document.getElementById("badge"),
};

let state = {
  lastItemId: null,
  lastFormUrl: null,
  activeSince: null,
  activeTimer: null,
  iframeLoadTimer: null,
  redirecting: false,
};

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setBadge(text) {
  if (!CONFIG.SHOW_DEBUG_BADGE) return;
  els.badge.textContent = text;
  show(els.badge);
}

function clearBadge() {
  hide(els.badge);
}

function showIdle() {
  // Clear timers
  if (state.activeTimer) clearTimeout(state.activeTimer);
  if (state.iframeLoadTimer) clearTimeout(state.iframeLoadTimer);
  state.activeTimer = null;
  state.iframeLoadTimer = null;

  state.lastItemId = null;
  state.lastFormUrl = null;
  state.activeSince = null;
  state.redirecting = false;

  // Reset active UI
  els.frame.removeAttribute("src");
  hide(els.frame);
  hide(els.redirectMode);
  hide(els.loading);

  // Show idle screen
  show(els.idle);
  hide(els.active);

  if (CONFIG.SHOW_DEBUG_BADGE) setBadge("Idle");
}

function showActive(formUrl, itemId) {
  // If already showing same form, do nothing (prevents flicker)
  if (state.lastItemId === itemId && state.lastFormUrl === formUrl) {
    // keep alive timer running
    return;
  }

  state.lastItemId = itemId;
  state.lastFormUrl = formUrl;
  state.activeSince = Date.now();
  state.redirecting = false;

  // Switch to active screen
  hide(els.idle);
  show(els.active);

  // Show loading while we attempt iframe
  show(els.loading);
  hide(els.redirectMode);

  // Attempt iframe mode first
  els.frame.src = formUrl;
  show(els.frame);

  // If the form is blocked from embedding, iframe often stays blank.
  // We'll use a grace timer and then switch to redirect mode.
  if (state.iframeLoadTimer) clearTimeout(state.iframeLoadTimer);
  state.iframeLoadTimer = setTimeout(() => {
    // If we are still "loading" after grace period, assume embed is blocked
    // and switch to redirect mode.
    // (We keep this simple—reliable across browsers.)
    if (!state.redirecting) {
      switchToRedirect(formUrl);
    }
  }, CONFIG.IFRAME_LOAD_GRACE_MS);

  // If iframe does load, remove loading state
  // Note: load event can still fire even when some content is blocked, but this is still useful.
  els.frame.onload = () => {
    hide(els.loading);
    if (CONFIG.SHOW_DEBUG_BADGE) setBadge(`Active (iframe) • item ${itemId}`);
    if (state.iframeLoadTimer) {
      clearTimeout(state.iframeLoadTimer);
      state.iframeLoadTimer = null;
    }
  };

  // Local timeout back to idle
  if (state.activeTimer) clearTimeout(state.activeTimer);
  state.activeTimer = setTimeout(() => {
    showIdle();
  }, CONFIG.ACTIVE_TIMEOUT_MS);

  if (CONFIG.SHOW_DEBUG_BADGE) setBadge(`Active (loading) • item ${itemId}`);
}

function switchToRedirect(formUrl) {
  state.redirecting = true;
  hide(els.frame);
  hide(els.loading);
  show(els.redirectMode);

  els.openFormLink.href = formUrl;

  if (CONFIG.SHOW_DEBUG_BADGE) setBadge("Active (redirect)");

  // Full takeover: navigate the tab to the form
  // If you prefer NOT to navigate automatically, comment this out.
  window.location.href = formUrl;
}

async function fetchActive() {
  const res = await fetch(CONFIG.ACTIVE_ENDPOINT, { cache: "no-store" });
  if (!res.ok) throw new Error(`Active endpoint HTTP ${res.status}`);
  return res.json();
}

async function pollLoop() {
  try {
    const data = await fetchActive();

    if (!data || data.active !== true) {
      showIdle();
      return;
    }

    // Active = true
    const itemId = data.itemId || "unknown";
    const formUrl = data.formUrl;

    // If Worker says active but no formUrl, treat as idle for UI purposes
    // (You can choose to show a "loading" message instead.)
    if (!formUrl) {
      showIdle();
      if (CONFIG.SHOW_DEBUG_BADGE) setBadge(`Idle (no formUrl) • item ${itemId}`);
      return;
    }

    showActive(formUrl, itemId);
  } catch (err) {
    // On errors, stay idle (safe default). Keep polling.
    showIdle();
    if (CONFIG.SHOW_DEBUG_BADGE) setBadge(`Idle (fetch error)`);
    // Optional: log errors during setup
    console.error(err);
  }
}

// Start
showIdle();
setInterval(pollLoop, CONFIG.POLL_INTERVAL_MS);
pollLoop();

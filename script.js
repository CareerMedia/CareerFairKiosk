/**
 * RE-OPTIMIZED Kiosk Logic
 * - Faster Idle Polling (1s)
 * - Immediate "Fast Mode" when Monday.com triggers
 * - Cache-busting requests
 */

const CONFIG = {
  ACTIVE_ENDPOINT: "https://cc-rep-info.careermedia.workers.dev/active",

  // Faster polling for better responsiveness
  IDLE_POLL_MS: 1000,    // 1s check (Standard for kiosks)
  ACTIVE_POLL_MS: 500,   // 0.5s check (When we know an update is coming)

  ACTIVE_TIMEOUT_MS: 120000, 
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
  // Only update UI if we are actually changing states
  if (state.isActive) {
    state.isActive = false;
    state.lastItemId = null;
    state.lastFormUrl = null;
    if (state.activeTimer) clearTimeout(state.activeTimer);
    hide(els.frame);
    hide(els.loading);
    show(els.idle);
    hide(els.active);
    startPolling(CONFIG.IDLE_POLL_MS);
  }
  setBadge("Idle (Waiting for Monday.com)");
}

function showActive(formUrl, itemId) {
  state.isActive = true;
  
  // If we have the URL, show the frame
  if (formUrl) {
    if (state.lastFormUrl !== formUrl) {
      state.lastFormUrl = formUrl;
      state.lastItemId = itemId;
      hide(els.idle);
      show(els.active);
      show(els.loading);
      
      els.frame.onload = () => {
        hide(els.loading);
        setBadge(`Active • ${itemId}`);
      };
      
      if (els.frame.src !== formUrl) {
        els.frame.src = formUrl;
      }
      show(els.frame);
    }
  } else {
    // We are ACTIVE but waiting for the URL (the "loading" phase)
    hide(els.idle);
    show(els.active);
    show(els.loading);
    setBadge(`Triggered! Fetching URL... • ${itemId}`);
  }

  resetActiveTimer();
  // Switch to FAST polling because the data is changing
  if (state.currentPollMs !== CONFIG.ACTIVE_POLL_MS) {
    startPolling(CONFIG.ACTIVE_POLL_MS);
  }
}

async function pollOnce() {
  try {
    // Add timestamp to URL to bypass ANY browser/ISP caching
    const cacheBuster = `?t=${Date.now()}`;
    const res = await fetch(CONFIG.ACTIVE_ENDPOINT + cacheBuster, { 
      cache: "no-store",
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // If active property is true (even if formUrl is still null)
    if (data && data.active === true) {
      showActive(data.formUrl, data.itemId);
    } else {
      showIdle();
    }
  } catch (err) {
    setBadge("Connection Error - Retrying...");
    console.error(err);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else {
    startPolling(state.isActive ? CONFIG.ACTIVE_POLL_MS : CONFIG.IDLE_POLL_MS);
  }
});

// Init
state.isActive = true; // Set true initially so showIdle runs once correctly
showIdle();
pollOnce();

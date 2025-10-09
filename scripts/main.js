// === Налаштування ===
function genLeadId() {
  try {
    if (crypto && crypto.randomUUID) return 'ld_' + crypto.randomUUID();
  } catch (e) {}
  return 'ld_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

window.__leadId = null;
const WEBHOOK_URL = "https://hook.eu2.make.com/qkjm77ab8dwde3lfyq41iaadon8dzpd1";

// === Елементи ===
const form = document.getElementById('leadForm');
const statusEl = document.getElementById('status');
const btn = document.getElementById('submitBtn');
const catalogs = document.getElementById('catalogs');
const afterSubmit = document.getElementById('afterSubmit');
const phoneInput = document.getElementById('phone');

const CONFIRM_PAGE_URL = 'pages/confirm-phone.html';
const CATALOG_LANDING_PAGE = 'pages/catalogs.html';
const VERIFY_CONTEXT_KEY = 'dolota_catalog_context';
const VERIFY_CONTEXT_PERSIST_KEY = 'dolota_catalog_context_persist';
const VERIFY_RESULT_KEY = 'dolota_catalog_verified';
const VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 хвилин
const PENDING_CATALOG_KEY = 'dolota_catalog_pending';

const COMPANY_PHONE = '+380933332212';
const PHONE_PREFIX = '+38';
const PHONE_DIGITS_REQUIRED = 10;

let currentVerificationContext = null;
let lastSubmitPayload = null;
let catalogsHandlerAttached = false;

function resolveLandingUrl() {
  try {
    const base = (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : location.href;
    return new URL(CATALOG_LANDING_PAGE, base).toString();
  } catch (err) {
    return CATALOG_LANDING_PAGE;
  }
}

function isOnCatalogLandingPage() {
  try {
    return document.body && document.body.classList && document.body.classList.contains('catalog-landing');
  } catch (err) {
    return false;
  }
}

function storePendingCatalog(url) {
  if (!url) return;
  try {
    sessionStorage.setItem(PENDING_CATALOG_KEY, url);
  } catch (err) {}
}

function consumePendingCatalog() {
  try {
    const pending = sessionStorage.getItem(PENDING_CATALOG_KEY);
    if (!pending) return null;
    sessionStorage.removeItem(PENDING_CATALOG_KEY);
    return pending;
  } catch (err) {
    return null;
  }
}

function maybeOpenPendingCatalog() {
  if (!isOnCatalogLandingPage()) return;
  const pending = consumePendingCatalog();
  if (!pending) return;
  setTimeout(() => {
    try {
      const win = window.open(pending, '_blank');
      if (win) {
        try {
          win.opener = null;
        } catch (e) {}
        return;
      }
      window.location.href = pending;
    } catch (err) {
      window.location.href = pending;
    }
  }, 300);
}


try {
  window.addEventListener('storage', (event) => {
    if (event && event.key === VERIFY_RESULT_KEY) {
      if (event.newValue) {
        try {
          sessionStorage.setItem(VERIFY_RESULT_KEY, event.newValue);
        } catch (err) {}
      } else {
        try {
          sessionStorage.removeItem(VERIFY_RESULT_KEY);
        } catch (err) {}
      }
    }
  });
} catch (err) {}

function sanitizePhoneDigits(raw = '') {
  return String(raw)
    .replace(/\D/g, '')
    .slice(0, PHONE_DIGITS_REQUIRED);
}

function readContextFrom(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      storage.removeItem(key);
      return null;
    }
    return data;
  } catch (err) {
    try {
      storage.removeItem(key);
    } catch (e) {}
    return null;
  }
}

function loadStoredCatalogContext() {
  let ctx = null;
  try {
    ctx = readContextFrom(sessionStorage, VERIFY_CONTEXT_KEY);
  } catch (err) {
    ctx = null;
  }
  if (ctx) return ctx;
  try {
    ctx = readContextFrom(localStorage, VERIFY_CONTEXT_KEY);
  } catch (err) {
    ctx = null;
  }
  if (ctx) return ctx;
  try {
    ctx = readContextFrom(localStorage, VERIFY_CONTEXT_PERSIST_KEY);
    if (ctx) {
      try {
        sessionStorage.setItem(VERIFY_CONTEXT_KEY, JSON.stringify(ctx));
      } catch (err) {}
    }
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

function persistCatalogContext(context) {
  if (!context || typeof context !== 'object') return;
  try {
    sessionStorage.setItem(VERIFY_CONTEXT_KEY, JSON.stringify(context));
  } catch (err) {}
  try {
    localStorage.setItem(VERIFY_CONTEXT_PERSIST_KEY, JSON.stringify(context));
  } catch (err) {}
}

function hydrateContextFromStorage() {
  const stored = loadStoredCatalogContext();
  if (!stored) return;
  currentVerificationContext = {
    leadId: stored.leadId || window.__leadId || null,
    phoneDigits: stored.phoneDigits || stored.phone_digits || null,
    phoneDisplay:
      stored.phoneDisplay ||
      stored.phone_display ||
      (stored.phoneDigits || stored.phone_digits ? `${PHONE_PREFIX}${stored.phoneDigits || stored.phone_digits}` : null),
  };
  if (!window.__leadId && currentVerificationContext.leadId) {
    window.__leadId = currentVerificationContext.leadId;
  }
}

hydrateContextFromStorage();

function enforceCatalogAccess() {
  if (!isOnCatalogLandingPage()) return;

  const redirectToIndex = () => {
    let target = '../index.html';
    try {
      target = new URL('../index.html', location.href).toString();
    } catch (err) {}
    try {
      window.location.replace(target);
    } catch (err) {
      window.location.href = target;
    }
  };

  const context = loadStoredCatalogContext();
  const verification = getStoredVerification();
  const digits = context ? sanitizePhoneDigits(context.phoneDigits || context.phone_digits || '') : '';

  if (!digits || digits.length !== PHONE_DIGITS_REQUIRED) {
    redirectToIndex();
    return;
  }

  const normalizedContext = {
    ...(context && typeof context === 'object' ? context : {}),
    leadId: (context && (context.leadId || context.lead_id)) || window.__leadId || null,
    phoneDigits: digits,
    phoneDisplay:
      (context && (context.phoneDisplay || context.phone_display)) ||
      (digits ? `${PHONE_PREFIX}${digits}` : null),
  };

  currentVerificationContext = normalizedContext;
  if (!window.__leadId && normalizedContext.leadId) {
    window.__leadId = normalizedContext.leadId;
  }

  if (!verification || !isVerificationValidForCurrentContact(verification)) {
    redirectToIndex();
    return;
  }
}

enforceCatalogAccess();

function updateVerificationContext(payload = {}) {
  try {
    const digits = payload.phone_digits || sanitizePhoneDigits(payload.phone || (phoneInput && phoneInput.value) || '');
    const display = payload.phone_display || payload.phone || (digits ? `${PHONE_PREFIX}${digits}` : '');
    const leadId = window.__leadId || payload.leadId || null;
    const previous = currentVerificationContext;
    currentVerificationContext = {
      leadId,
      phoneDigits: digits || null,
      phoneDisplay: display || null,
    };
    if (
      previous &&
      (previous.phoneDigits !== currentVerificationContext.phoneDigits || previous.leadId !== currentVerificationContext.leadId)
    ) {
      sessionStorage.removeItem(VERIFY_RESULT_KEY);
      try {
        localStorage.removeItem(VERIFY_RESULT_KEY);
      } catch (err) {}
    }
  } catch (e) {
    currentVerificationContext = {
      leadId: window.__leadId || payload.leadId || null,
      phoneDigits: null,
      phoneDisplay: null,
    };
    sessionStorage.removeItem(VERIFY_RESULT_KEY);
    try {
      localStorage.removeItem(VERIFY_RESULT_KEY);
    } catch (err) {}
  }
}

function readVerificationFrom(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(VERIFY_RESULT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.verifiedAt) {
      storage.removeItem(VERIFY_RESULT_KEY);
      return null;
    }
    const ts = new Date(data.verifiedAt).getTime();
    if (Number.isNaN(ts)) {
      storage.removeItem(VERIFY_RESULT_KEY);
      return null;
    }
    if (Date.now() - ts > VERIFICATION_TTL_MS) {
      storage.removeItem(VERIFY_RESULT_KEY);
      return null;
    }
    return data;
  } catch (err) {
    try {
      storage.removeItem(VERIFY_RESULT_KEY);
    } catch (e) {}
    return null;
  }
}

function getStoredVerification() {
  let sessionData = null;
  try {
    sessionData = readVerificationFrom(sessionStorage);
  } catch (err) {
    sessionData = null;
  }
  if (sessionData) return sessionData;
  let localData = null;
  try {
    localData = readVerificationFrom(localStorage);
  } catch (err) {
    localData = null;
  }
  if (localData) {
    try {
      sessionStorage.setItem(VERIFY_RESULT_KEY, JSON.stringify(localData));
    } catch (err) {}
    return localData;
  }
  return null;
}

function isVerificationValidForCurrentContact(verification) {
  if (!verification) return false;
  const ctx = currentVerificationContext;
  if (ctx) {
    if (ctx.phoneDigits && verification.phoneDigits && ctx.phoneDigits !== verification.phoneDigits) {
      return false;
    }
    if (ctx.leadId && verification.leadId && ctx.leadId !== verification.leadId) {
      return false;
    }
  }
  return true;
}

function openCatalogAfterVerification({ url, landingUrl }) {
  if (!url) return;
  let opened = false;
  try {
    const win = window.open(url, '_blank');
    if (win) {
      try {
        win.opener = null;
      } catch (e) {}
      opened = true;
    }
  } catch (err) {
    opened = false;
  }
  if (!opened) {
    storePendingCatalog(url);
  }
  if (isOnCatalogLandingPage()) return;
  const destination = landingUrl || resolveLandingUrl();
  try {
    window.location.href = destination;
  } catch (err) {
    window.location.assign(destination);
  }
}

function redirectToConfirm(context) {
  if (!context || !context.catalogUrl) return;
  try {
    sessionStorage.setItem(VERIFY_CONTEXT_KEY, JSON.stringify(context));
    sessionStorage.removeItem(VERIFY_RESULT_KEY);
  } catch (e) {}
  try {
    localStorage.setItem(VERIFY_CONTEXT_PERSIST_KEY, JSON.stringify(context));
  } catch (e) {}
  try {
    localStorage.removeItem(VERIFY_RESULT_KEY);
  } catch (e) {}
  try {
    window.location.href = CONFIRM_PAGE_URL;
  } catch (err) {
    window.location.assign(CONFIRM_PAGE_URL);
  }
}

function ensureVerificationContextFromForm() {
  if (!currentVerificationContext || !currentVerificationContext.phoneDigits) {
    if (phoneInput) {
      updateVerificationContext({});
    }
  }
  if (!currentVerificationContext || !currentVerificationContext.phoneDigits) {
    const stored = loadStoredCatalogContext();
    if (stored) {
      currentVerificationContext = {
        leadId: stored.leadId || window.__leadId || null,
        phoneDigits: stored.phoneDigits || stored.phone_digits || null,
        phoneDisplay:
          stored.phoneDisplay ||
          stored.phone_display ||
          (stored.phoneDigits || stored.phone_digits ? `${PHONE_PREFIX}${stored.phoneDigits || stored.phone_digits}` : null),
      };
    }
  }
  if (!currentVerificationContext) {
    currentVerificationContext = {
      leadId: window.__leadId || null,
      phoneDigits: null,
      phoneDisplay: null,
    };
  }
  if (currentVerificationContext && !currentVerificationContext.leadId && window.__leadId) {
    currentVerificationContext.leadId = window.__leadId;
  }
  return currentVerificationContext;
}

function promptForMissingContext() {
  if (statusEl) {
    statusEl.textContent = 'Спочатку заповніть форму та вкажіть номер телефону, щоб відкрити каталог.';
    statusEl.className = 'status err';
  }
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (phoneInput) {
    try {
      phoneInput.focus();
    } catch (e) {}
  }
}

function handleCatalogClick(ev) {
  const a = ev.target.closest('#catalogs a[data-category], #catalogs a[href], #catalogs a[data-url]');
  if (!a) return;
  if (a.hasAttribute('data-skip-verification')) {
    return;
  }
  ev.preventDefault();
  const rawHref = a.getAttribute('href');
  const dataUrl = a.getAttribute('data-url') || a.dataset.url;
  const hasDirectHref = rawHref && rawHref !== '#';
  const baseHref = hasDirectHref ? rawHref : dataUrl;
  if (!baseHref) {
    promptForMissingContext();
    return;
  }
  const name = a.getAttribute('data-category') || a.textContent.trim();
  let url;
  if (hasDirectHref) {
    url = a.href;
  } else {
    try {
      url = new URL(baseHref, location.href).toString();
    } catch (err) {
      url = baseHref;
    }
  }
  window.__selectedCategory = name;
  const ctx = ensureVerificationContextFromForm();
  const phoneDigits = ctx && ctx.phoneDigits;
  const leadId = window.__leadId || (ctx && ctx.leadId) || null;
  if (!leadId || !phoneDigits || phoneDigits.length !== PHONE_DIGITS_REQUIRED) {
    promptForMissingContext();
    return;
  }
  const phoneDisplay = ctx && ctx.phoneDisplay ? ctx.phoneDisplay : `${PHONE_PREFIX}${phoneDigits}`;
  currentVerificationContext = {
    leadId,
    phoneDigits,
    phoneDisplay,
  };
  window.__leadId = leadId;

  const landingUrl = resolveLandingUrl();
  const contextPayload = {
    ...currentVerificationContext,
    catalogName: name,
    catalogUrl: url,
    landingUrl,
  };
  persistCatalogContext(contextPayload);
  const verification = getStoredVerification();
  if (verification && isVerificationValidForCurrentContact(verification)) {
    openCatalogAfterVerification({ url, landingUrl });
    return;
  }
  redirectToConfirm(contextPayload);
}

function ensureCatalogHandler() {
  if (!catalogs || catalogsHandlerAttached) return;
  if (isOnCatalogLandingPage()) return;
  catalogs.addEventListener('click', handleCatalogClick);
  catalogsHandlerAttached = true;
}

if (phoneInput) {
  const enforceDigits = () => {
    const digits = sanitizePhoneDigits(phoneInput.value);
    phoneInput.value = digits;
  };
  enforceDigits();
  phoneInput.addEventListener('input', enforceDigits);
  phoneInput.addEventListener('blur', enforceDigits);
}

ensureCatalogHandler();

// === Відправка подій (трекінг) ===
async function track(eventName, data) {
  try {
    const params = new URLSearchParams(location.search);
    const tag = params.get('tag') || 'nfc_unknown';
    const body = Object.assign({ event: eventName, leadId: window.__leadId || null, tag, ts: new Date().toISOString() }, data || {});
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (e) {
    /* noop */
  }
}

// === UTM/Geo helpers ===
const UTM_BASE = { source: 'nfc', medium: 'booth', campaign: 'expo_2025' };
const TAG_UTM_MAP = {
  A1X9: { content: 'zone_a1', term: 'left_pillar' },
  B2Y3: { content: 'zone_b2', term: 'rig_demo' },
};
function timeBucket(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

// Wait for user to confirm geolocation permission and try to acquire position (up to 15s)
function getGeoWait(maxWaitMs = 15000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let done = false;
    const opts = { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs };
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, maxWaitMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc_m: pos.coords.accuracy });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(null);
      },
      opts,
    );
  });
}

async function getGeoPermissionState() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return null;
    const p = await navigator.permissions.query({ name: 'geolocation' });
    return (p && p.state) || null;
  } catch (_) {
    return null;
  }
}

async function buildUtm() {
  try {
    if (statusEl) {
      statusEl.textContent = 'Будь ласка, підтвердьте доступ до геолокації…';
      statusEl.className = 'status';
    }
  } catch (e) {}
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag') || 'nfc_unknown';
  const geo = await getGeoWait(15000).catch(() => null);
  const now = new Date();
  const tb = timeBucket(now);
  const map = TAG_UTM_MAP[tag] || { content: `zone_${tag}`, term: 'generic' };
  const utm = {
    utm_source: UTM_BASE.source,
    utm_medium: UTM_BASE.medium,
    utm_campaign: UTM_BASE.campaign,
    utm_content: `${map.content}_${tb}`,
    utm_term: map.term,
  };
  return { utm, geo, tag, iso: now.toISOString(), tz: getTimezone() };
}

function augmentCatalogLinks(meta) {
  try {
    const links = document.querySelectorAll('#catalogs a[data-category]');
    links.forEach((a) => {
      const rawHref = a.getAttribute('href');
      const dataUrl = a.getAttribute('data-url') || a.dataset.url;
      const storedBase = a.getAttribute('data-base');
      const baseHref = dataUrl || storedBase || (rawHref && rawHref !== '#' ? rawHref : null);
      if (!baseHref) return;
      a.setAttribute('data-base', baseHref);
      let url;
      try {
        url = new URL(baseHref, location.href);
      } catch (err) {
        return;
      }
      Object.entries(meta.utm || {}).forEach(([k, v]) => url.searchParams.set(k, v));
      if (meta.geo && typeof meta.geo.lat === 'number') {
        url.searchParams.set('lat', String(meta.geo.lat));
        url.searchParams.set('lon', String(meta.geo.lon));
        url.searchParams.set('acc_m', String(meta.geo.acc_m));
      }
      url.searchParams.set('tag', meta.tag || 'nfc_unknown');
      url.searchParams.set('tz', meta.tz || 'UTC');
      url.searchParams.set('ts', meta.iso || new Date().toISOString());
      a.setAttribute('href', url.toString());
    });
  } catch (e) {
    /* noop */
  }
}

// === ТЕХНІЧНІ ДАНІ КЛІЄНТА ===
async function collectTech() {
  const nav = navigator || {};
  const scr = screen || {};
  const doc = document || {};
  const con = nav && nav.connection ? nav.connection : {};
  const mem = nav.deviceMemory;
  const hw = nav.hardwareConcurrency;
  const tz = Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const uaCH =
    nav.userAgentData && nav.userAgentData.getHighEntropyValues
      ? await nav.userAgentData
          .getHighEntropyValues(['architecture', 'bitness', 'model', 'platform', 'platformVersion', 'uaFullVersion', 'fullVersionList'])
          .catch(() => null)
      : null;
  let battery = null;
  try {
    if (nav.getBattery) {
      battery = await nav.getBattery();
    }
  } catch (e) {}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    url: location.href,
    referrer: doc.referrer || null,
    lang: nav.language,
    languages: nav.languages,
    tz,
    userAgent: nav.userAgent,
    uaData: uaCH || null,
    platform: nav.platform,
    vendor: nav.vendor,
    cookiesEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    screen: {
      width: scr.width,
      height: scr.height,
      availWidth: scr.availWidth,
      availHeight: scr.availHeight,
      colorDepth: scr.colorDepth,
      pixelDepth: scr.pixelDepth,
    },
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    connection: { effectiveType: con.effectiveType, rtt: con.rtt, downlink: con.downlink, saveData: con.saveData },
    memoryGB: mem,
    hardwareConcurrency: hw,
    prefersDark,
    prefersReducedMotion,
    orientation: (screen.orientation && screen.orientation.type) || null,
    online: navigator.onLine,
    battery: battery
      ? {
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
        }
      : null,
  };
}

// === ПОВЕДІНКОВІ ПОДІЇ ===
function initBehaviorTracking() {
  const start = Date.now();
  let lastActivity = start;
  let maxScroll = 0;
  let clicks = 0;
  let keypress = 0;
  let focusCount = 0;
  let blurCount = 0;
  let visibleTime = 0;
  let hiddenSince = null;
  const events = [];
  function pushEvt(type, meta) {
    if (events.length < 200) {
      events.push({ t: new Date().toISOString(), type, ...(meta || {}) });
    }
  }
  document.addEventListener(
    'click',
    (e) => {
      clicks++;
      lastActivity = Date.now();
      pushEvt('click', { x: e.clientX, y: e.clientY, tag: e.target && e.target.tagName });
    },
    { passive: true },
  );
  document.addEventListener('keydown', () => {
    keypress++;
    lastActivity = Date.now();
    pushEvt('keydown');
  });
  window.addEventListener('focus', () => {
    focusCount++;
    pushEvt('focus');
  });
  window.addEventListener('blur', () => {
    blurCount++;
    pushEvt('blur');
  });
  document.addEventListener(
    'scroll',
    () => {
      const sc = Math.max(document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
      const h = Math.max(document.documentElement.scrollHeight || 1, 1);
      const vh = window.innerHeight || 1;
      const depth = Math.min(100, Math.round(((sc + vh) / h) * 100));
      maxScroll = Math.max(maxScroll, depth);
      lastActivity = Date.now();
    },
    { passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      pushEvt('hidden');
    } else {
      if (hiddenSince) {
        visibleTime += Date.now() - hiddenSince;
        hiddenSince = null;
      }
      pushEvt('visible');
    }
  });
  function getIdleMs() {
    return Date.now() - lastActivity;
  }
  function snapshot() {
    const now = Date.now();
    const totalMs = now - start;
    const effectiveVisible = hiddenSince ? visibleTime : visibleTime + (now - (hiddenSince || now));
    return {
      totalMs,
      maxScrollPct: maxScroll,
      clicks,
      keypress,
      focusCount,
      blurCount,
      idleMs: getIdleMs(),
      effectiveVisibleMs: effectiveVisible,
      events,
    };
  }
  return { snapshot };
}
const behaviorTracker = initBehaviorTracking();

// === Автозаповнення з URL ===
(function autofillFromURL() {
  const p = new URLSearchParams(location.search);
  const map = { lastName: 'lastName', firstName: 'firstName', phone: 'phone', email: 'email', company: 'company' };
  Object.entries(map).forEach(([q, id]) => {
    const v = p.get(q);
    if (v) {
      const el = document.getElementById(id);
      if (!el || el.value) return;
      if (id === 'phone') {
        const digits = sanitizePhoneDigits(String(v).trim().replace(/^\+?38/, ''));
        el.value = digits;
      } else {
        el.value = v;
      }
    }
  });
})();

// === Telegram bot deep link ===
const DEFAULT_TELEGRAM_BOT_URL = 'https://t.me/dolota_pr_bot';
let TELEGRAM_BOT_URL = DEFAULT_TELEGRAM_BOT_URL;
try {
  const _bp = new URLSearchParams(location.search).get('bot');
  if (_bp) TELEGRAM_BOT_URL = _bp;
} catch (e) {}
const tgCta = document.getElementById('tgCta');
if (tgCta && tgCta.dataset) {
  tgCta.dataset.base = TELEGRAM_BOT_URL;
}
function augmentTelegramCTA(meta) {
  try {
    if (!tgCta) return;
    const base = tgCta.getAttribute('data-base') || TELEGRAM_BOT_URL;
    const url = new URL(base, location.href);
    const payload = {
      tag: meta.tag || 'nfc_unknown',
      ts: meta.iso,
      tz: meta.tz,
      category: window.__selectedCategory || null,
      leadId: window.__leadId || null,
    };
    const start = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    url.searchParams.set('start', window.__leadId || '');
    tgCta.setAttribute('href', url.toString());
  } catch (e) {
    /* noop */
  }
}

// === vCard helpers ===
function buildVCard(meta) {
  const family = 'ТОВ ДОЛОТА';
  const given = 'Відділ';
  const additional = 'Продажів';
  const org = 'ТОВ "ДОЛОТА"';
  const tel = COMPANY_PHONE;
  const site = 'https://dolota.ua';
  const email = 'info@dolota.ua';
  const chatbot = 'https://t.me/dolota_pr_bot';
  const note = 'ЗБЕРЕЖІТЬ НОВИЙ КОНТАКТ ▼▼▼ Бурові машини, компресори, бурове обладнання та інструмент. Чатбот: ' + chatbot;
  const fn = `${family} ${given} ${additional}`.trim();
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${family};${given};${additional};;`,
    `FN:${fn}`,
    `ORG:${org}`,
    `TEL;TYPE=work,voice:${tel}`,
    `EMAIL;TYPE=work:${email}`,
    `URL:${site}`,
    `NOTE:${note}`,
    'END:VCARD',
  ].join('\r\n');
}
function triggerVcfDownload(vcard, filename = 'DOLOTA.vcf') {
  try {
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  } catch (e) {
    console.warn('VCF download failed', e);
  }
}
function autoOpenVCard(meta) {
  try {
    const vcf = buildVCard(meta);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DOLOTA.vcf';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 3000);
    if (isIOS) {
      setTimeout(() => {
        const dataUrl = 'data:text/vcard;charset=utf-8,' + encodeURIComponent(vcf);
        try {
          window.open(dataUrl, '_blank');
        } catch (e) {
          location.href = dataUrl;
        }
      }, 150);
    }
  } catch (e) {
    console.warn('autoOpenVCard failed', e);
  }
}

// === Валідація форми та нормалізація ===
function normalizePhone(raw) {
  const cleaned = String(raw || '').replace(/\D/g, '');
  if (cleaned.length !== PHONE_DIGITS_REQUIRED) {
    return { ok: false, e164: null, cleaned: cleaned };
  }
  const digits = cleaned.slice(0, PHONE_DIGITS_REQUIRED);
  const full = PHONE_PREFIX + digits;
  return { ok: true, e164: full, cleaned: digits, display: full };
}
function isValidEmail(raw) {
  if (!raw) return true;
  const s = String(raw).trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  return re.test(s);
}
function validate(fd) {
  const lastName = fd.get('lastName')?.trim();
  const firstName = fd.get('firstName')?.trim();
  const phone = fd.get('phone')?.trim();
  const email = fd.get('email')?.trim();
  const phoneCheck = normalizePhone(phone);
  if (!(lastName && firstName && phone)) return { ok: false, msg: 'Будь ласка, заповніть обов’язкові поля.' };
  if (!phoneCheck.ok)
    return {
      ok: false,
      msg: `Невірний номер телефону. Введіть рівно ${PHONE_DIGITS_REQUIRED} цифр після префіксу +38.`,
    };
  if (!isValidEmail(email)) return { ok: false, msg: 'Невірний формат e‑mail.' };
  return { ok: true, phoneCheck };
}

// === Відправка вебхуків ===
async function sendContactNow(payloadObj) {
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag') || 'nfc_unknown';
  const body = {
    ...payloadObj,
    tag,
    source: 'expo_nfc',
    timestamp: new Date().toISOString(),
    event: 'contact_submitted',
  };
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
  const contentType = response.headers ? response.headers.get('content-type') || '' : '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
    try {
      data = data && typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {
      /* ignore */
    }
  }
  if (!response.ok) {
    const error = new Error(`Webhook responded with status ${response.status}`);
    error.response = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

// === Збереження контакту локально ===
function saveVisitor(payload) {
  try {
    localStorage.setItem(
      'dolota_visitor',
      JSON.stringify({
        lastName: payload.lastName || '',
        firstName: payload.firstName || '',
        phone: payload.phone || '',
        email: payload.email || '',
        company: payload.company || '',
      }),
    );
  } catch (e) {}
}
function loadVisitor() {
  try {
    const raw = localStorage.getItem('dolota_visitor');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// === Submit handler ===
if (form && btn && statusEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.textContent = '';
    const fd = new FormData(form);
    const v = validate(fd);
    if (!window.__leadId) window.__leadId = genLeadId();
    if (!v.ok) {
      statusEl.textContent = v.msg;
      statusEl.className = 'status err';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Запитуємо геолокацію…';

    const payload = Object.fromEntries(fd.entries());
    if (v.phoneCheck) {
      payload.phone = v.phoneCheck.display || payload.phone;
      payload.phone_digits = v.phoneCheck.cleaned;
      if (v.phoneCheck.e164) payload.phone_e164 = v.phoneCheck.e164;
    }
    updateVerificationContext(payload);
    lastSubmitPayload = payload;
    const meta = await buildUtm(); // тут чекаємо підтвердження/позицію
    const geoPerm = await getGeoPermissionState();
    const tech = await collectTech();
    const behavior = initBehaviorTracking().snapshot(); // короткий знімок на момент сабміту
    payload.leadId = window.__leadId;
    payload.tag = meta.tag;
    payload.source = 'expo_nfc';
    payload.timestamp = meta.iso;
    payload.utm = meta.utm;
    if (meta.geo) payload.geo = meta.geo;
    payload.tz = meta.tz;
    payload.tech = tech;
    payload.behavior = behavior;
    payload.geo_permission = geoPerm;

    try {
      const webhookResponse = await sendContactNow(payload);
      statusEl.textContent = 'Дякуємо! Дані успішно надіслані.';
      autoOpenVCard(meta);
      statusEl.className = 'status ok';
      saveVisitor(payload);
      if (afterSubmit) afterSubmit.style.display = 'block';
      if (catalogs) {
        catalogs.style.display = 'block';
        catalogs.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      augmentCatalogLinks(meta);
      augmentTelegramCTA(meta);
      try {
        const tg = document.getElementById('tgCta');
        if (tg) tg.addEventListener('click', () => {
          track('tg_cta_click', { leadId: window.__leadId });
        }, { once: true });
        const call = document.getElementById('callCta');
        if (call) call.addEventListener('click', () => {
          track('call_click', { leadId: window.__leadId });
        }, { once: true });
      } catch (e) {}
      ensureCatalogHandler();
      const saveBtn = document.getElementById('saveVCardBtn');
      if (saveBtn) {
        saveBtn.onclick = () => {
          track('vcard_click', { leadId: window.__leadId });
          const vcf = buildVCard(meta);
          triggerVcfDownload(vcf);
        };
      }
    } catch (err) {
      statusEl.textContent = 'Помилка відправлення. Спробуйте ще раз або перевірте інтернет.';
      statusEl.className = 'status err';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Надіслати';
    }
  });
} else {
  const saveBtn = document.getElementById('saveVCardBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const vcf = buildVCard({});
      triggerVcfDownload(vcf);
    });
  }
}

function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  const inputs = document.querySelectorAll('#leadForm input, #leadForm button');
  const statusElLocal = document.getElementById('status');
  if (!isOnline) {
    inputs.forEach((el) => {
      el.disabled = true;
      el.style.backgroundColor = '#444';
    });
    if (statusElLocal) {
      statusElLocal.textContent = 'Немає з’єднання з інтернетом. Будь ласка, підключіться до мережі.';
      statusElLocal.className = 'status err';
    }
  } else {
    inputs.forEach((el) => {
      el.disabled = false;
      el.style.backgroundColor = '';
    });
    if (statusElLocal) {
      statusElLocal.textContent = '';
      statusElLocal.className = 'status';
    }
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
document.addEventListener('DOMContentLoaded', updateOnlineStatus);
document.addEventListener('DOMContentLoaded', () => {
  enforceCatalogAccess();
  maybeOpenPendingCatalog();
});

(function initCallCta() {
  const callBtn = document.getElementById('callCta');
  if (!callBtn) return;
  const telUrl = `tel:${COMPANY_PHONE}`;
  callBtn.setAttribute('href', telUrl);
  callBtn.addEventListener(
    'click',
    () => {
      try {
        callBtn.setAttribute('href', telUrl);
        window.location.href = telUrl;
      } catch (e) {}
    },
    { passive: true },
  );
})();

(function initCopyPhone() {
  const copyEl = document.querySelector('[data-copy-phone]');
  if (!copyEl) return;
  const number = copyEl.getAttribute('data-copy-phone') || COMPANY_PHONE;
  async function copyToClipboard() {
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(number);
        success = true;
      } catch (e) {}
    }
    if (!success) {
      try {
        const tmp = document.createElement('input');
        tmp.value = number;
        document.body.appendChild(tmp);
        tmp.select();
        success = document.execCommand('copy');
        tmp.remove();
      } catch (e) {}
    }
    if (success) {
      copyEl.classList.add('copied');
      setTimeout(() => copyEl.classList.remove('copied'), 2000);
    }
  }
  const triggerCopy = (event) => {
    event.preventDefault();
    copyToClipboard();
  };
  copyEl.addEventListener('click', triggerCopy);
  copyEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      triggerCopy(event);
    }
  });
})();

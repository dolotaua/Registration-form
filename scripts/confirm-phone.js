const WEBHOOK_URL = 'https://hook.eu2.make.com/q6frdvkglswb72umh7jbjercc7gd2eqv';

const CONTEXT_KEY = 'dolota_catalog_context';
const CONTEXT_PERSIST_KEY = 'dolota_catalog_context_persist';
const VERIFIED_KEY = 'dolota_catalog_verified';
const VERIFICATION_TTL_MS = 10 * 60 * 1000;

const PENDING_CATALOG_KEY = 'dolota_catalog_pending';
const phoneInput = document.getElementById('phoneDisplay');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const loader = document.getElementById('verificationLoader');
const codeSection = document.getElementById('codeSection');
const codeInput = document.getElementById('codeInput');
const verifyCodeBtn = document.getElementById('verifyCodeBtn');
const resendCodeWrapper = document.getElementById('resendCodeWrapper');
const resendCodeLink = document.getElementById('resendCodeLink');
const resendCountdownText = document.getElementById('resendCountdown');
const RESEND_DELAY_SECONDS = 40;
let resendCountdownTimer = null;
let resendCountdownExpiresAt = null;
const RESEND_DEFAULT_TEXT = resendCodeLink
  ? resendCodeLink.textContent.trim()
  : 'Надіслати код повторно';

const statusEl = document.getElementById('confirmStatus');

let context = null;

function readVerificationFrom(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(VERIFIED_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.verifiedAt) {
      storage.removeItem(VERIFIED_KEY);
      return null;
    }
    const ts = new Date(data.verifiedAt).getTime();
    if (Number.isNaN(ts)) {
      storage.removeItem(VERIFIED_KEY);
      return null;
    }
    if (Date.now() - ts > VERIFICATION_TTL_MS) {
      storage.removeItem(VERIFIED_KEY);
      return null;
    }
    return data;
  } catch (err) {
    try {
      storage.removeItem(VERIFIED_KEY);
    } catch (e) {}
    return null;
  }
}

function parseContext() {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err) {
    return null;
  }
}

function consumePersistedContext() {
  try {
    const raw = localStorage.getItem(CONTEXT_PERSIST_KEY);
    if (!raw) return null;
    localStorage.removeItem(CONTEXT_PERSIST_KEY);
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    try {
      sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(data));
    } catch (err) {}
    return data;
  } catch (err) {
    return null;
  }
}

function parseVerified() {
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
      sessionStorage.setItem(VERIFIED_KEY, JSON.stringify(localData));
    } catch (err) {}
    return localData;
  }
  return null;
}

function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('ok', 'err');
  if (type) statusEl.classList.add(type);
}

function sanitizeCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 4);
}

function toggleCodeSection(visible) {
  if (!codeSection) return;
  if (visible) {
    codeSection.classList.remove('hidden');
    codeSection.setAttribute('aria-hidden', 'false');
  } else {
    codeSection.classList.add('hidden');
    codeSection.setAttribute('aria-hidden', 'true');
  }
}


function toggleResendLink(visible) {
  if (!resendCodeWrapper) return;
  if (visible) {
    resendCodeWrapper.classList.remove('hidden');
    resendCodeWrapper.setAttribute('aria-hidden', 'false');
    setResendLinkText(RESEND_DEFAULT_TEXT);
    if (!isResendCountdownActive()) {
      setResendCountdownText('');
      setResendDisabledState(false);
    }
  } else {
    resendCodeWrapper.classList.add('hidden');
    resendCodeWrapper.setAttribute('aria-hidden', 'true');
    stopResendCountdown();
  }
}

function setResendLinkText(text) {
  if (!resendCodeLink) return;
  resendCodeLink.textContent = text;
}

function setResendCountdownText(text) {
  if (!resendCountdownText) return;
  resendCountdownText.textContent = text;
}

function setResendDisabledState(disabled) {
  if (!resendCodeLink) return;
  resendCodeLink.disabled = disabled;
  if (disabled) {
    resendCodeLink.setAttribute('aria-disabled', 'true');
    resendCodeLink.classList.add('is-disabled');
  } else {
    resendCodeLink.removeAttribute('aria-disabled');
    resendCodeLink.classList.remove('is-disabled');
  }
}

function stopResendCountdown({ resetState = true } = {}) {
  if (resendCountdownTimer) {
    clearInterval(resendCountdownTimer);
    resendCountdownTimer = null;
  }
  resendCountdownExpiresAt = null;
  if (resetState && resendCodeLink) {
    setResendDisabledState(false);
    setResendLinkText(RESEND_DEFAULT_TEXT);
    setResendCountdownText('');
  }
}

function formatCountdown(secondsLeft) {
  const clamped = Math.max(0, Math.ceil(secondsLeft));
  return clamped.toString();
}

function updateResendCountdownDisplay() {
  if (!resendCodeLink || !resendCountdownExpiresAt) return false;
  const millisecondsLeft = resendCountdownExpiresAt - Date.now();
  if (millisecondsLeft <= 0) {
    stopResendCountdown();
    return false;
  }
  const secondsLeft = millisecondsLeft / 1000;
  setResendLinkText(RESEND_DEFAULT_TEXT);
  setResendCountdownText(formatCountdown(secondsLeft));
  return true;
}

function startResendCountdown() {
  if (!resendCodeLink) return;
  stopResendCountdown({ resetState: false });
  resendCountdownExpiresAt = Date.now() + RESEND_DELAY_SECONDS * 1000;
  setResendDisabledState(true);
  if (!updateResendCountdownDisplay()) {
    stopResendCountdown();
    return;
  }
  resendCountdownTimer = setInterval(() => {
    if (!updateResendCountdownDisplay()) {
      stopResendCountdown();
    }
  }, 500);
}

function isResendCountdownActive() {
  return Boolean(resendCountdownExpiresAt && resendCountdownExpiresAt > Date.now());
}

function showLoader() {
  if (!loader) return;
  loader.classList.remove('hidden');
  loader.setAttribute('aria-hidden', 'false');
}

function hideLoader() {
  if (!loader) return;
  loader.classList.add('hidden');
  loader.setAttribute('aria-hidden', 'true');
}

function contextMatchesVerification(ctx, verification) {
  if (!ctx || !verification) return false;
  if (ctx.phoneDigits && verification.phoneDigits && ctx.phoneDigits !== verification.phoneDigits) return false;
  if (ctx.leadId && verification.leadId && ctx.leadId !== verification.leadId) return false;
  return true;
}

function resolveCatalogLandingUrl() {
  try {
    const base = (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : location.href;
    return new URL('catalogs.html', base).toString();
  } catch (err) {
    return 'catalogs.html';
  }
}

function openCatalogTarget(ctx) {
  if (!ctx || !ctx.catalogUrl) return;
  const url = ctx.catalogUrl;
  const landingUrl = ctx.landingUrl || resolveCatalogLandingUrl();
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
    try {
      sessionStorage.setItem(PENDING_CATALOG_KEY, url);
    } catch (err) {}
  }
  try {
    window.location.href = landingUrl;
  } catch (err) {
    window.location.assign(landingUrl);
  }
}

function hideSendCodeButton() {
  if (!sendCodeBtn) return;
  sendCodeBtn.classList.add('hidden');
  sendCodeBtn.setAttribute('aria-hidden', 'true');
}

function showSendCodeButton() {
  if (!sendCodeBtn) return;
  sendCodeBtn.classList.remove('hidden');
  sendCodeBtn.removeAttribute('aria-hidden');
}

async function sendVerificationCode({ resend = false, displayValue }) {
  if (!context) return;
  const payload = {
    action: 'send_code',
    leadId: context.leadId,
    phone: displayValue,
    phoneDigits: context.phoneDigits || null,
  };

  if (resend) {
    startResendCountdown();
    setStatus('Надсилаємо код повторно…');
  } else {
    if (sendCodeBtn) {
      sendCodeBtn.disabled = true;
      hideSendCodeButton();
    }
    setStatus('Надсилаємо код підтвердження…');
  }

  try {
    await callWebhook(payload);
    toggleCodeSection(true);
    toggleResendLink(true);
    if (!resend) {
      startResendCountdown();
    }
    setStatus(resend ? 'Код повторно надіслано. Перевірте повідомлення.' : 'Код надіслано. Введіть 4 цифри з повідомлення.', 'ok');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  } catch (err) {
    setStatus('Не вдалося надіслати код. Спробуйте ще раз.', 'err');
    if (!resend) {
      if (sendCodeBtn) {
        showSendCodeButton();
      }
      toggleCodeSection(false);
      toggleResendLink(false);
    }
    if (resend) {
      stopResendCountdown();
    }
  } finally {
    if (sendCodeBtn) sendCodeBtn.disabled = false;
    if (resendCodeLink && !isResendCountdownActive()) {
      setResendDisabledState(false);
      setResendLinkText(RESEND_DEFAULT_TEXT);
      setResendCountdownText('');
    }
  }
}

async function callWebhook(body) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

async function checkRemoteVerification(ctx, displayValue) {
  if (!ctx || !displayValue) return { verified: false, error: false };
  showLoader();
  hideSendCodeButton();
  setStatus('Перевіряємо статус підтвердження…');
  let verified = false;
  try {
    const response = await callWebhook({
      phone: displayValue,
      status: 'check_verification',
    });
    const statusValue = (() => {
      if (!response) return '';
      if (typeof response === 'string') return response;
      if (typeof response === 'object') {
        if (response && typeof response.status !== 'undefined') return response.status;
        const alt = response.verification || response.verified || response['підтвердження'];
        return typeof alt !== 'undefined' ? alt : '';
      }
      return '';
    })();
    if (String(statusValue).toLowerCase() === 'true') {
      const verifiedPayload = {
        ...ctx,
        verifiedAt: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
      } catch (err) {}
      try {
        localStorage.setItem(CONTEXT_PERSIST_KEY, JSON.stringify(ctx));
      } catch (err) {}
      try {
        sessionStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedPayload));
      } catch (err) {}
      try {
        localStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedPayload));
      } catch (err) {}
      setStatus('Номер вже підтверджено. Відкриваємо каталог…', 'ok');
      verified = true;
      openCatalogTarget(ctx);
      return { verified: true, error: false };
    }
    return { verified: false, error: false };
  } catch (err) {
    setStatus('Не вдалося автоматично перевірити номер. Спробуйте надіслати код.', 'err');
    return { verified: false, error: true };
  } finally {
    if (!verified) {
      hideLoader();
    }
  }
}

async function init() {
  toggleCodeSection(false);
  toggleResendLink(false);
  context = parseContext();
  if (!context) {
    context = consumePersistedContext();
  } else {
    try {
      localStorage.removeItem(CONTEXT_PERSIST_KEY);
    } catch (err) {}
  }
  if (!context || !context.leadId || (!context.phoneDigits && !context.phoneDisplay)) {
    setStatus('Не знайдено даних для підтвердження. Поверніться до каталогу та оберіть матеріал ще раз.', 'err');
    hideLoader();
    hideSendCodeButton();
    if (sendCodeBtn) sendCodeBtn.disabled = true;
    setResendDisabledState(true);
    return;
  }

  const displayValue = context.phoneDisplay || (context.phoneDigits ? `+38${context.phoneDigits}` : '');
  if (phoneInput) {
    phoneInput.value = displayValue;
  }

  const verified = parseVerified();
  if (contextMatchesVerification(context, verified)) {
    setStatus('Номер вже підтверджено. Відкриваємо каталог…', 'ok');
    setTimeout(() => {
      openCatalogTarget(context);
    }, 150);

    return;
  }

  const remoteResult = await checkRemoteVerification(context, displayValue);
  if (remoteResult.verified) {
    return;
  }

  hideLoader();
  showSendCodeButton();

  if (!remoteResult.error) {
    if (context.catalogName) {
      setStatus(`Для доступу до «${context.catalogName}» підтвердіть номер телефону.`, '');
    } else {
      setStatus('Введіть код, який ми надішлемо на вказаний номер телефону.', '');
    }
  }

  toggleCodeSection(false);
  toggleResendLink(false);

  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = sanitizeCode(codeInput.value);
    });
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (verifyCodeBtn && !verifyCodeBtn.disabled) {
          verifyCodeBtn.click();
        }
      }
    });
  }

  if (sendCodeBtn) {
    sendCodeBtn.addEventListener('click', async () => {
      if (!context) return;

      await sendVerificationCode({ resend: false, displayValue });
    });
  }

  if (resendCodeLink) {
    resendCodeLink.addEventListener('click', async () => {
      if (!context) return;
      await sendVerificationCode({ resend: true, displayValue });
    });
  }

  if (verifyCodeBtn) {
    verifyCodeBtn.addEventListener('click', async () => {
      if (!context) return;
      const code = sanitizeCode(codeInput ? codeInput.value : '');
      if (code.length !== 4) {
        setStatus('Введіть 4-значний код підтвердження.', 'err');
        if (codeInput) codeInput.focus();
        return;
      }
      try {
        verifyCodeBtn.disabled = true;
        if (sendCodeBtn) sendCodeBtn.disabled = true;
        setStatus('Перевіряємо код…');
        const payload = {
          action: 'verify_code',
          leadId: context.leadId,
          phone: displayValue,
          code,
        };
        const response = await callWebhook(payload);
        const confirmationValue = (() => {
          if (!response) return '';
          if (typeof response === 'string') return response;
          if (typeof response === 'object') {
            const value = response['підтвердження'];
            return typeof value === 'string' ? value : '';
          }
          return '';
        })();
        if (String(confirmationValue).toLowerCase() === 'true') {
          const verifiedPayload = {
            ...context,
            code,
            verifiedAt: new Date().toISOString(),
          };
          try {
            sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
          } catch (err) {}
          try {
            localStorage.setItem(CONTEXT_PERSIST_KEY, JSON.stringify(context));
          } catch (err) {}
          try {
            sessionStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedPayload));
          } catch (err) {}
          try {
            localStorage.setItem(VERIFIED_KEY, JSON.stringify(verifiedPayload));
          } catch (err) {}
          setStatus('Номер підтверджено! Відкриваємо каталог…', 'ok');
          openCatalogTarget(context);
        } else {
          setStatus('Код не підходить. Перевірте цифри та спробуйте ще раз.', 'err');
          if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
          }
        }
      } catch (err) {
        setStatus('Сталася помилка під час перевірки. Спробуйте пізніше.', 'err');
      } finally {
        verifyCodeBtn.disabled = false;
        if (sendCodeBtn) sendCodeBtn.disabled = false;
      }
    });
  }
}

init();

/*!
 * lgpd-consent — banner de cookies para a LGPD com bloqueio real de scripts
 * e Google Consent Mode v2. Script clássico (sem módulos) para rodar no
 * <head> antes do Google Tag Manager. MIT.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'lgpd-consent';
  var COOKIE_NAME = 'lgpd_consent';
  var DAY = 86400000;

  var CATEGORIES = [
    { id: 'necessary', locked: true, name: 'Necessários', description: 'Essenciais para o site funcionar (login, carrinho, segurança). Não podem ser desativados.' },
    { id: 'analytics', name: 'Estatísticas', description: 'Medem visitas e uso do site de forma agregada (ex.: Google Analytics).' },
    { id: 'marketing', name: 'Marketing', description: 'Personalizam anúncios e medem campanhas (ex.: Meta Pixel, Google Ads).' },
  ];

  // ---------- Regras puras (testadas no Node) ----------

  function normalizeChoices(choices) {
    var out = { necessary: true };
    CATEGORIES.forEach(function (c) {
      if (!c.locked) out[c.id] = Boolean(choices && choices[c.id]);
    });
    return out;
  }

  function createConsent(choices, options) {
    options = options || {};
    var now = options.now || new Date();
    return {
      version: String(options.version || '1'),
      choices: normalizeChoices(choices),
      timestamp: now.toISOString(),
      id: options.id || randomId(),
    };
  }

  function randomId() {
    var c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /**
   * Precisa perguntar de novo? Sim se não há consentimento, se a política
   * mudou de versão ou se ele é mais velho que maxAgeDays (padrão 12 meses).
   */
  function needsConsent(consent, options) {
    options = options || {};
    if (!consent || !consent.choices || !consent.timestamp) return true;
    if (String(consent.version) !== String(options.version || '1')) return true;
    var age = (options.now || new Date()) - new Date(consent.timestamp);
    return !(age >= 0 && age < (options.maxAgeDays || 365) * DAY);
  }

  /** Estado para o Google Consent Mode v2. */
  function googleConsentState(choices) {
    var c = normalizeChoices(choices);
    var g = function (on) { return on ? 'granted' : 'denied'; };
    return {
      ad_storage: g(c.marketing),
      ad_user_data: g(c.marketing),
      ad_personalization: g(c.marketing),
      analytics_storage: g(c.analytics),
      functionality_storage: 'granted',
      security_storage: 'granted',
    };
  }

  function serialize(consent) {
    return JSON.stringify(consent);
  }

  function parse(raw) {
    try {
      var v = JSON.parse(raw);
      return v && typeof v === 'object' && v.choices ? v : null;
    } catch (e) {
      return null;
    }
  }

  /** Valor curto do cookie, legível pelo servidor: "1.analytics.marketing". */
  function cookieValue(consent) {
    var granted = Object.keys(consent.choices).filter(function (k) { return k !== 'necessary' && consent.choices[k]; });
    return [consent.version].concat(granted).join('.');
  }

  var core = {
    CATEGORIES: CATEGORIES,
    normalizeChoices: normalizeChoices,
    createConsent: createConsent,
    needsConsent: needsConsent,
    googleConsentState: googleConsentState,
    serialize: serialize,
    parse: parse,
    cookieValue: cookieValue,
  };

  if (typeof document === 'undefined') {
    root.LGPDConsent = core;
    return;
  }

  // ---------- Navegador ----------

  var currentScript = document.currentScript;
  var data = (currentScript && currentScript.dataset) || {};
  var config = Object.assign({
    version: data.version || '1',
    policyUrl: data.policyUrl || '',
    maxAgeDays: Number(data.maxAgeDays || 365),
    color: data.color || '#2563eb',
    reopenButton: data.reopenButton !== 'false',
    title: 'Sua privacidade',
    text: 'Usamos cookies para o site funcionar e, com a sua permissão, para estatísticas e marketing. Você pode mudar sua escolha quando quiser.',
  }, root.lgpdConsentConfig || {});

  function readStored() {
    try { return parse(root.localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  function store(consent) {
    try { root.localStorage.setItem(STORAGE_KEY, serialize(consent)); } catch (e) { /* modo privado */ }
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = COOKIE_NAME + '=' + encodeURIComponent(cookieValue(consent))
      + '; Max-Age=' + config.maxAgeDays * 86400 + '; Path=/; SameSite=Lax' + secure;
  }

  function gtag() {
    root.dataLayer = root.dataLayer || [];
    root.dataLayer.push(arguments);
  }

  // Consent Mode: tudo negado por padrão, antes de qualquer tag carregar
  gtag('consent', 'default', Object.assign(googleConsentState({}), { wait_for_update: 500 }));

  /** Ativa <script type="text/plain" data-consent="..."> e iframes com data-src. */
  function activate(choices) {
    document.querySelectorAll('script[type="text/plain"][data-consent]').forEach(function (old) {
      if (!choices[old.dataset.consent]) return;
      var s = document.createElement('script');
      Array.prototype.forEach.call(old.attributes, function (a) {
        if (a.name !== 'type' && a.name !== 'data-consent' && a.name !== 'data-src') s.setAttribute(a.name, a.value);
      });
      if (old.dataset.src) s.src = old.dataset.src;
      else s.textContent = old.textContent;
      old.replaceWith(s);
    });
    document.querySelectorAll('iframe[data-consent][data-src]').forEach(function (frame) {
      if (choices[frame.dataset.consent] && !frame.src) frame.src = frame.dataset.src;
    });
  }

  var state = readStored();

  function apply(consent, isNew) {
    state = consent;
    if (isNew) store(consent);
    gtag('consent', 'update', googleConsentState(consent.choices));
    activate(consent.choices);
    root.dispatchEvent(new CustomEvent('lgpd:consent', { detail: consent }));
  }

  function decide(choices) {
    apply(createConsent(choices, { version: config.version }), true);
    ui.close();
  }

  // ---------- Interface (Shadow DOM) ----------

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };

  var CSS = ':host{all:initial;--c:' + esc(config.color) + ';--bg:#fff;--fg:#111827;--muted:#4b5563;--border:#e5e7eb;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + '@media (prefers-color-scheme:dark){:host{--bg:#111827;--fg:#f9fafb;--muted:#9ca3af;--border:#374151}}'
    + '.banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:760px;margin:0 auto;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:14px;box-shadow:0 20px 50px rgb(0 0 0/.25);padding:18px 20px;box-sizing:border-box;max-height:calc(100vh - 32px);overflow:auto}'
    + 'h2{margin:0 0 6px;font-size:16px}p{margin:0;font-size:14px;line-height:1.5;color:var(--muted)}a{color:var(--c)}'
    + '.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;justify-content:flex-end}'
    + 'button{font:inherit;font-size:14px;font-weight:600;border-radius:10px;padding:10px 14px;cursor:pointer;border:1px solid var(--border);background:transparent;color:inherit}'
    + 'button.primary{background:var(--c);border-color:var(--c);color:#fff}'
    + 'button:focus-visible,input:focus-visible{outline:3px solid color-mix(in srgb,var(--c) 45%,transparent);outline-offset:2px}'
    + '.cat{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--border)}.cat:first-of-type{margin-top:12px}'
    + '.cat label{font-weight:600;font-size:14px;display:block}.cat p{font-size:13px}'
    + '.switch{appearance:none;flex:none;width:40px;height:22px;border-radius:999px;background:var(--border);position:relative;cursor:pointer;margin-top:2px}'
    + '.switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}'
    + '.switch:checked{background:var(--c)}.switch:checked::after{transform:translateX(18px)}.switch:disabled{opacity:.6;cursor:not-allowed}'
    + '.reopen{position:fixed;left:16px;bottom:16px;z-index:2147482999;border-radius:999px;padding:8px 12px;font-size:12px;background:var(--bg);color:var(--fg);box-shadow:0 4px 14px rgb(0 0 0/.15)}'
    + '[hidden]{display:none!important}@media (max-width:520px){.actions button{flex:1 1 100%}}';

  var ui = (function () {
    var host = document.createElement('lgpd-consent');
    var shadow = host.attachShadow({ mode: 'open' });
    var view = 'banner';

    function render() {
      var choices = (state && state.choices) || normalizeChoices({});
      var policy = config.policyUrl ? ' <a href="' + esc(config.policyUrl) + '" target="_blank" rel="noopener">Política de privacidade</a>.' : '';
      var cats = CATEGORIES.map(function (c) {
        return '<div class="cat"><input type="checkbox" class="switch" id="lgpd-' + c.id + '" data-cat="' + c.id + '"'
          + (c.locked || choices[c.id] ? ' checked' : '') + (c.locked ? ' disabled' : '') + '>'
          + '<div><label for="lgpd-' + c.id + '">' + esc(c.name) + '</label><p>' + esc(c.description) + '</p></div></div>';
      }).join('');
      shadow.innerHTML = '<style>' + CSS + '</style>'
        + '<section class="banner" role="dialog" aria-modal="false" aria-labelledby="lgpd-title" hidden>'
        + '<h2 id="lgpd-title">' + esc(config.title) + '</h2><p>' + esc(config.text) + policy + '</p>'
        + (view === 'details' ? cats : '')
        + '<div class="actions">'
        + (view === 'details'
          ? '<button data-act="save">Salvar escolhas</button>'
          : '<button data-act="details">Personalizar</button>')
        + '<button data-act="reject">Recusar opcionais</button>'
        + '<button class="primary" data-act="accept">Aceitar todos</button></div></section>'
        + (config.reopenButton ? '<button class="reopen" data-act="open" hidden aria-label="Preferências de cookies">🍪 Privacidade</button>' : '');
    }

    shadow.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'accept') decide({ analytics: true, marketing: true });
      else if (act === 'reject') decide({});
      else if (act === 'details') { view = 'details'; open(); }
      else if (act === 'open') { view = 'details'; open(); }
      else if (act === 'save') {
        var picked = {};
        shadow.querySelectorAll('input[data-cat]').forEach(function (i) { picked[i.dataset.cat] = i.checked; });
        decide(picked);
      }
    });

    shadow.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state) close();
    });

    function open() {
      render();
      shadow.querySelector('.banner').hidden = false;
      var first = shadow.querySelector('.banner button, .banner input:not([disabled])');
      if (first) first.focus();
    }

    function close() {
      render();
      var reopen = shadow.querySelector('.reopen');
      if (reopen) reopen.hidden = false;
    }

    function mount() {
      document.body.appendChild(host);
      if (needsConsent(state, config)) {
        view = 'banner';
        open();
      } else {
        // No <head> os scripts bloqueados do <body> ainda não existiam
        activate(state.choices);
        close();
      }
    }

    return { open: open, close: close, mount: mount, setView: function (v) { view = v; } };
  }());

  if (state && !needsConsent(state, config)) apply(state, false);

  if (document.body) ui.mount();
  else document.addEventListener('DOMContentLoaded', ui.mount);

  root.LGPDConsent = Object.assign({}, core, {
    open: function () { ui.setView('details'); ui.open(); },
    get: function () { return state; },
    has: function (category) { return Boolean(state && state.choices[category]); },
    reset: function () {
      try { root.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      document.cookie = COOKIE_NAME + '=; Max-Age=0; Path=/';
      state = null;
      ui.setView('banner');
      ui.open();
    },
  });
}(typeof window !== 'undefined' ? window : globalThis));

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Script clássico: no Node (sem document) ele só expõe as regras puras
await import('../src/lgpd-consent.js');
const {
  CATEGORIES, normalizeChoices, createConsent, needsConsent, googleConsentState, serialize, parse, cookieValue,
} = globalThis.LGPDConsent;

const now = new Date('2026-10-06T12:00:00Z');
const daysAgo = (n) => new Date(now - n * 86_400_000);

test('categorias padrão', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.id), ['necessary', 'analytics', 'marketing']);
});

test('necessários sempre ativos e só categorias conhecidas', () => {
  assert.deepEqual(normalizeChoices({ necessary: false, analytics: 1, hacker: true }), {
    necessary: true, analytics: true, marketing: false,
  });
  assert.deepEqual(normalizeChoices(undefined), { necessary: true, analytics: false, marketing: false });
});

test('createConsent registra versão, data e id', () => {
  const c = createConsent({ analytics: true }, { version: 3, now, id: 'abc' });
  assert.deepEqual(c, {
    version: '3',
    choices: { necessary: true, analytics: true, marketing: false },
    timestamp: '2026-10-06T12:00:00.000Z',
    id: 'abc',
  });
  assert.ok(createConsent({}).id, 'gera id quando não informado');
});

test('pede consentimento de novo quando necessário', () => {
  const fresh = createConsent({}, { version: '2', now: daysAgo(10) });
  assert.equal(needsConsent(null, { version: '2', now }), true);
  assert.equal(needsConsent(fresh, { version: '2', now }), false);
  assert.equal(needsConsent(fresh, { version: '3', now }), true, 'política mudou');
  assert.equal(needsConsent(createConsent({}, { version: '2', now: daysAgo(400) }), { version: '2', now }), true, 'expirou');
  assert.equal(needsConsent(createConsent({}, { version: '2', now: daysAgo(40) }), { version: '2', now, maxAgeDays: 30 }), true);
  assert.equal(needsConsent({ version: '2', choices: {} }, { version: '2', now }), true, 'sem data');
});

test('Google Consent Mode v2', () => {
  assert.deepEqual(googleConsentState({}), {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
  });
  const s = googleConsentState({ analytics: true });
  assert.equal(s.analytics_storage, 'granted');
  assert.equal(s.ad_storage, 'denied');
  assert.equal(googleConsentState({ marketing: true }).ad_user_data, 'granted');
});

test('serialização e cookie curto para o servidor', () => {
  const c = createConsent({ analytics: true, marketing: true }, { version: '2', now, id: 'x' });
  assert.deepEqual(parse(serialize(c)), c);
  assert.equal(parse('{quebrado'), null);
  assert.equal(parse('null'), null);
  assert.equal(cookieValue(c), '2.analytics.marketing');
  assert.equal(cookieValue(createConsent({}, { version: '2' })), '2');
});

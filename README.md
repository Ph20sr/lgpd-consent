# lgpd-consent

[![CI](https://github.com/Ph20sr/lgpd-consent/actions/workflows/ci.yml/badge.svg)](https://github.com/Ph20sr/lgpd-consent/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

Banner de cookies para a **LGPD** que **bloqueia de verdade** os scripts de estatísticas e marketing até a pessoa consentir. Integra com o **Google Consent Mode v2**. Instala com uma tag `<script>`, sem dependências e com uns 12 KB de código-fonte.

Muitos banners só mostram um aviso enquanto o Google Analytics e o Pixel já estão rodando. Este não deixa nada opcional executar antes da escolha.

- **Bloqueio real**: scripts e iframes ficam inertes (`type="text/plain"`) até a categoria ser aceita
- **Consent Mode v2**: grava o estado `default` como `denied` antes do GTM e envia o `update` com a escolha (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`)
- **Granular**: Necessários (sempre ativos), Estatísticas e Marketing
- **Recusar é tão fácil quanto aceitar**: os dois botões ficam lado a lado, como a ANPD orienta
- **Registro do consentimento**: versão da política, data e um id. Pede de novo quando a política muda ou após 12 meses
- **Cookie legível pelo servidor** (`lgpd_consent=1.analytics.marketing`), para o back-end também respeitar a escolha
- Acessível, responsivo, tema claro e escuro e Shadow DOM (o CSS do site não interfere)

## Instalação

```html
<head>
  <!-- 1) Primeiro de tudo no <head> -->
  <script src="https://cdn.jsdelivr.net/gh/Ph20sr/lgpd-consent/src/lgpd-consent.js"
          data-version="1"
          data-policy-url="/politica-de-privacidade"
          data-color="#2563eb"></script>

  <!-- 2) Depois o Google Tag Manager, normalmente: ele lê o Consent Mode -->
</head>
<body>
  <!-- 3) Scripts que dependem de consentimento: type="text/plain" + data-consent -->
  <script type="text/plain" data-consent="marketing"
          data-src="https://connect.facebook.net/en_US/fbevents.js"></script>

  <script type="text/plain" data-consent="analytics">
    console.log('só roda com consentimento de estatísticas');
  </script>

  <!-- Iframes também (ex.: vídeo do YouTube) -->
  <iframe data-consent="marketing" data-src="https://www.youtube-nocookie.com/embed/ID"></iframe>
</body>
```

| atributo | padrão | descrição |
| --- | --- | --- |
| `data-version` | `1` | aumente quando mudar a política: todos são consultados de novo |
| `data-policy-url` | — | link da política de privacidade |
| `data-color` | `#2563eb` | cor dos botões |
| `data-max-age-days` | `365` | validade do consentimento |
| `data-reopen-button` | `true` | botão flutuante "🍪 Privacidade" para mudar a escolha |

Os textos podem ser trocados com `window.lgpdConsentConfig = { title, text }`, definido antes do script.

## API

```js
LGPDConsent.has('analytics');   // true/false
LGPDConsent.get();              // { version, choices, timestamp, id }
LGPDConsent.open();             // abre as preferências (ex.: link no rodapé)
LGPDConsent.reset();            // apaga e pergunta de novo

addEventListener('lgpd:consent', (e) => {
  // e.detail = { version, choices: { necessary, analytics, marketing }, timestamp, id }
});
```

## No servidor (PHP)

```php
[$version, $granted] = array_pad(explode('.', $_COOKIE['lgpd_consent'] ?? '', 2), 2, '');
$canTrack = in_array('analytics', explode('.', $granted), true);
```

## Desenvolvimento

```bash
npm test       # regras de consentimento (node:test)
npm run demo   # http://localhost:5173
```

> Este pacote é uma ferramenta técnica e não substitui orientação jurídica sobre a sua política de privacidade.

## Licença

MIT

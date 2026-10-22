// Solo navegador de pruebas: no se carga desde la aplicación ni resuelve CAPTCHA real.
export async function mockTurnstile(context) {
  await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      const widgets = new Map(); let counter = 0;
      window.captchaTest = { auto: true, renders: 0, resets: 0, removes: 0,
        solve() { for (const w of widgets.values()) w.callback('test-token-' + (++counter)); },
        expire() { for (const w of widgets.values()) w['expired-callback'](); },
        fail() { for (const w of widgets.values()) w['error-callback']('test-error'); }
      };
      window.turnstile = {
        render(container, options) {
          const id = String(++counter); widgets.set(id, options);
          window.captchaTest.renders++;
          const marker = document.createElement('span'); marker.textContent = 'Verification fixture'; container.append(marker);
          setTimeout(() => { if (widgets.has(id) && window.captchaTest.auto) options.callback('test-token-' + (++counter)); }, 0);
          return id;
        },
        reset(id) {
          window.captchaTest.resets++;
          if (window.captchaTest.auto) setTimeout(() => widgets.get(id)?.callback('test-token-' + (++counter)), 0);
        },
        remove(id) { widgets.delete(id); window.captchaTest.removes++; }
      };
    `,
  }))
}

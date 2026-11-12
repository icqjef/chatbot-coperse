export const WIDGET_TESTE = `(function () {
  console.info('[chatbot-coperse] script carregado');
  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;';
  var raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML =
    '<style>.selo{font:13px/1.3 system-ui,sans-serif;background:#0b3d6e;color:#fff;padding:8px 12px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.3)}</style>' +
    '<div class="selo" role="status">Chatbot COPERSE \u2014 teste</div>';
  document.body.appendChild(host);
})();
`;

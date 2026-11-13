import { lerConfig } from './config';
import { criarEnviar } from './conversa';
import { montar } from './interface';

declare global {
  interface Window {
    __chatbotCoperse?: boolean;
  }
}

// Capturar antes de qualquer await: depois disso currentScript some.
const script = document.currentScript as HTMLScriptElement | null;

if (!window.__chatbotCoperse) {
  const config = lerConfig(script);
  if (config.api) {
    window.__chatbotCoperse = true;
    const enviar = criarEnviar(config.api);
    if (document.body) montar(config, { enviar });
    else document.addEventListener('DOMContentLoaded', () => montar(config, { enviar }), { once: true });
  }
}

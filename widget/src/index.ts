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
    // Frameworks (ex.: hidratação do React) podem remover o host do body: recoloca o mesmo host.
    const iniciar = (): void => {
      const { host } = montar(config, { enviar });
      const observador = new MutationObserver(() => {
        if (!window.__chatbotCoperse) observador.disconnect();
        else if (!host.isConnected) document.body.append(host);
      });
      observador.observe(document.body, { childList: true });
    };
    if (document.body) iniciar();
    else document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  }
}

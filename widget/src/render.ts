import type { Fonte } from './tipos';

// Converte a data ISO pela parte da data, sem fuso.
function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function urlSegura(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

// Só textContent e elementos criados: nada do servidor entra como HTML.
export function renderResposta(texto: string, fontes: Fonte[]): HTMLElement {
  const raiz = document.createElement('div');
  raiz.className = 'msg bot';
  const corpo = document.createElement('span');
  corpo.className = 'texto';
  texto.split(/\[(\d+)\]/).forEach((parte, i) => {
    if (i % 2 === 1) {
      const sup = document.createElement('sup');
      sup.textContent = parte;
      sup.setAttribute('aria-label', `fonte ${parte}`);
      corpo.append(sup);
    } else if (parte) corpo.append(document.createTextNode(parte));
  });
  raiz.append(corpo);

  if (fontes.length) {
    const lista = document.createElement('ol');
    lista.className = 'fontes';
    for (const f of fontes) {
      const li = document.createElement('li');
      if (urlSegura(f.url)) {
        const a = document.createElement('a');
        a.href = f.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = f.titulo;
        li.append(a);
      } else li.append(document.createTextNode(f.titulo));
      const data = formatarData(f.data);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = data ? `${f.site} · atualizado em ${data}` : f.site;
      li.append(meta);
      lista.append(li);
    }
    raiz.append(lista);
  }
  return raiz;
}

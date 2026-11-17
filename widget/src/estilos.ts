export const ESTILOS = `
:host { all: initial; position: fixed; z-index: 2147483000; right: 20px; bottom: 20px; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d232a; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button, textarea { font: inherit; }
button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 0; box-shadow: 0 0 0 4px #1d232a; }
.botao { display: flex; align-items: center; gap: 10px; background: var(--cor); color: #fff; border: 0; border-radius: 999px; padding: 12px 18px 12px 14px; font: 600 15px/1 system-ui, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.22); cursor: pointer; }
.botao svg { width: 22px; height: 22px; }
.painel { width: 380px; height: 560px; max-height: calc(100vh - 40px); background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.25); display: flex; flex-direction: column; overflow: hidden; }
.cab { background: var(--cor); color: #fff; padding: 14px 14px 12px 16px; display: flex; align-items: flex-start; gap: 10px; }
.cab h2 { font-size: 16px; line-height: 1.3; margin: 0; }
.cab p { margin: 2px 0 0; font-size: 12.5px; line-height: 1.4; }
.fechar { margin-left: auto; background: transparent; border: 0; color: #fff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 20px; line-height: 1; }
.fechar:hover { background: rgba(255,255,255,.15); }
.aviso { background: #fff7e0; color: #5c4400; font-size: 13px; padding: 8px 16px; border-bottom: 1px solid #f0e2b6; display: flex; gap: 8px; align-items: center; }
.privacidade { color: #5c4400; font-weight: 600; text-decoration: underline; }
.msgs { flex: 1; overscroll-behavior: contain; overflow-y: auto; overflow-x: hidden; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 10px; background: #f7f8fa; }
.msg { max-width: 88%; padding: 10px 12px; border-radius: 12px; font-size: 14.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
.bot { background: #fff; border: 1px solid #e1e5ea; align-self: flex-start; border-bottom-left-radius: 4px; }
.usu { background: var(--cor); color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
.erro { border-color: #b3261e; color: #8c1d18; }
.texto { white-space: pre-wrap; overflow-wrap: anywhere; }
sup { font-weight: 700; color: var(--cor-escura); margin-left: 1px; }
.fontes { white-space: normal; margin: 8px 0 0; padding: 8px 0 0 20px; border-top: 1px solid #e1e5ea; font-size: 13px; }
.fontes a { color: var(--cor-escura); overflow-wrap: anywhere; }
.meta { font-size: 12.5px; color: #5d6670; }
.sugestoes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sugestoes button { font-size: 13px; padding: 6px 10px; border-radius: 999px; border: 1px solid var(--cor); color: var(--cor-escura); background: #fff; cursor: pointer; text-align: left; }
.sugestoes .rotulo { width: 100%; margin: 0; font-size: 12.5px; color: #5d6670; }
.avaliacao { white-space: normal; margin-top: 8px; padding-top: 6px; border-top: 1px solid #e1e5ea; font-size: 13px; color: #3c444d; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
.voto { background: #fff; border: 1px solid #7a8591; border-radius: 8px; width: 36px; height: 32px; cursor: pointer; font-size: 15px; line-height: 1; }
.voto:hover { border-color: var(--cor); }
.acao { white-space: normal; margin-top: 8px; }
.acao .contato { display: inline-block; padding: 6px 12px; border-radius: 999px; background: var(--cor); color: #fff; text-decoration: none; font-size: 13.5px; font-weight: 600; }
.avaliacao .contato { color: var(--cor-escura); }
.nova { margin-left: auto; background: transparent; border: 0; color: #fff; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 19px; line-height: 1; }
.nova:hover { background: rgba(255,255,255,.15); }
.nova:disabled { color: rgba(255,255,255,.55); cursor: default; }
.nova + .fechar { margin-left: 0; }
.convite { display: flex; align-items: flex-start; gap: 4px; max-width: 260px; margin: 0 0 10px auto; background: #fff; color: #1d232a; border: 1px solid #e1e5ea; border-radius: 14px 14px 4px 14px; box-shadow: 0 6px 18px rgba(0,0,0,.18); padding: 4px; }
.convite-texto { flex: 1; background: transparent; border: 0; text-align: left; padding: 8px 6px 8px 10px; font-size: 14px; color: #1d232a; cursor: pointer; }
.convite-fechar { background: transparent; border: 0; color: #5d6670; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; }
.convite-fechar:hover { background: #f0f2f5; }
.digitando .pontos { display: inline-flex; gap: 4px; padding: 4px 2px; }
.digitando i { width: 7px; height: 7px; border-radius: 50%; background: #b9c1ca; animation: pulo 1.2s infinite ease-in-out; }
.digitando i:nth-child(2) { animation-delay: .15s; }
.digitando i:nth-child(3) { animation-delay: .3s; }
@keyframes pulo { 0%, 60%, 100% { transform: translateY(0); background: #b9c1ca; } 30% { transform: translateY(-4px); background: #5d6670; } }
.so-leitor { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.oficial { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; color: #1e6b3a; }
.guardar { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: #3c444d; }
.acao-guardar { font-size: 12.5px; padding: 3px 10px; border-radius: 999px; border: 1px solid #8a939c; background: #fff; color: #3c444d; cursor: pointer; min-height: 24px; }
.retificacao { margin: 8px 0 0; font-size: 13px; line-height: 1.45; }
.retificacao.info { color: #3c444d; }
.retificacao.atencao { background: #fff4d6; border: 1px solid #c98a00; border-radius: 8px; padding: 6px 8px; color: #4a3500; }
.retificacao a { color: inherit; }
.atalhos { display: flex; margin: 0 0 8px; }
.atalhos:empty { display: none; }
.datas { font-size: 13px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--cor); color: var(--cor-escura); background: #fff; cursor: pointer; }
.datas:disabled { color: #5d6670; border-color: #8a939c; cursor: default; }
.lista-datas { margin: 4px 0 8px; padding-left: 18px; }
.lista-datas li { margin: 2px 0; }
.rodape { border-top: 1px solid #e1e5ea; padding: 10px 12px 8px; padding-bottom: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom)); background: #fff; }
.entrada { display: flex; gap: 8px; }
.entrada textarea { flex: 1; min-width: 0; resize: none; font-size: 14.5px; padding: 9px 11px; border: 1px solid #7a8591; border-radius: 10px; height: 42px; }
.microfone { width: 42px; height: 42px; border: 1px solid #7a8591; border-radius: 10px; background: #fff; cursor: pointer; font-size: 18px; }
.microfone[aria-pressed="true"] { background: #fde8e8; border-color: #b3261e; }
.aviso-voz { font-size: 12.5px; color: #3c444d; margin: 6px 2px 0; }
.enviar { width: 42px; height: 42px; border: 0; border-radius: 10px; background: var(--cor); color: #fff; cursor: pointer; }
.nota { font-size: 12.5px; color: #5d6670; margin: 6px 2px 0; }
@media (max-width: 600px) {
  .painel { position: fixed; top: 0; right: 0; bottom: 0; left: 0; inset: 0; width: auto; height: auto; max-height: none; border-radius: 0; box-shadow: none; }
  .botao { position: fixed; right: 20px; bottom: 20px; }
  .convite { position: fixed; right: 20px; bottom: 76px; margin: 0; }
  .entrada textarea { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;

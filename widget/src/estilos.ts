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
.msgs { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 14px 14px 6px; display: flex; flex-direction: column; gap: 10px; background: #f7f8fa; }
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
.rodape { border-top: 1px solid #e1e5ea; padding: 10px 12px 8px; background: #fff; }
.entrada { display: flex; gap: 8px; }
.entrada textarea { flex: 1; min-width: 0; resize: none; font-size: 14.5px; padding: 9px 11px; border: 1px solid #b9c1ca; border-radius: 10px; height: 42px; }
.enviar { width: 42px; height: 42px; border: 0; border-radius: 10px; background: var(--cor); color: #fff; cursor: pointer; }
.nota { font-size: 12.5px; color: #5d6670; margin: 6px 2px 0; }
@media (max-width: 600px) {
  .painel { position: fixed; inset: 0; width: auto; height: auto; max-height: none; border-radius: 0; box-shadow: none; }
  .botao { position: fixed; right: 20px; bottom: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;

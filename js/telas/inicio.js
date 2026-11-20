import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { normalizarCodigo } from '../lib/util.js';
import { varsVisual } from '../lib/visual.js';
import { Assinatura } from './comum.js';

export function Inicio() {
  const [codigo, setCodigo] = useState('');
  const entrar = (e) => {
    e.preventDefault();
    const c = normalizarCodigo(codigo);
    if (c) location.hash = `#/s/${c}`;
  };
  return html`<main class="tema participante" style=${varsVisual()}>
    <div class="participante-miolo inicio">
      <h1 class="inicio-titulo">Entre na dinâmica</h1>
      <p class="suave">Digite o código que aparece no telão.</p>
      <form onSubmit=${entrar} class="inicio-form">
        <label class="rotulo-campo" for="codigo">Código da sessão</label>
        <input id="codigo" class="campo campo-codigo" value=${codigo} maxlength="10"
          autocomplete="off" autocapitalize="characters" spellcheck=${false} inputmode="text"
          placeholder="EX.: COOP11"
          onInput=${(e) => setCodigo(normalizarCodigo(e.currentTarget.value))} />
        <button class="btn btn-primario btn-grande" disabled=${codigo.length < 4}>Entrar</button>
      </form>
      <a class="link-discreto" href="#/painel">Sou facilitador</a>
    </div>
    <${Assinatura} />
  </main>`;
}

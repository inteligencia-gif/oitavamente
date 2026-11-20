import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from './html.js';
import { normalizarCodigo } from './lib/util.js';
import { Participante } from './telas/participante.js';
import { Telao } from './telas/telao.js';
import { Painel } from './telas/painel.js';

// Rotas por hash, para funcionar em qualquer hospedagem estática:
//   #/              painel do facilitador (login)
//   #/s/CODIGO      participante (é o link do QR code)
//   #/telao/CODIGO?k=CHAVE   telão
//   #/painel        painel do facilitador
//   #/painel/ID     uma sessão no painel
function lerRota() {
  const bruto = location.hash.replace(/^#/, '') || '/';
  const [caminho, busca] = bruto.split('?');
  return { partes: caminho.split('/').filter(Boolean), q: new URLSearchParams(busca || '') };
}

function App() {
  const [rota, setRota] = useState(lerRota);
  useEffect(() => {
    const mudou = () => { setRota(lerRota()); window.scrollTo(0, 0); };
    addEventListener('hashchange', mudou);
    return () => removeEventListener('hashchange', mudou);
  }, []);

  const [a, b] = rota.partes;
  document.body.dataset.tela = a || 'painel';
  if (a === 's' && b) {
    const c = normalizarCodigo(b);
    return html`<${Participante} key=${c} codigo=${c} />`;
  }
  if (a === 'telao' && b) {
    const c = normalizarCodigo(b);
    return html`<${Telao} key=${c} codigo=${c} chave=${rota.q.get('k')} />`;
  }
  // o endereço principal abre o painel (login); participantes entram só pelo QR code da sessão
  return html`<${Painel} sessaoId=${a === 'painel' ? b : undefined} />`;
}

render(html`<${App} />`, document.getElementById('app'));

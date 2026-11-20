// Visões do telão depois que o envio fecha: post-its, nuvem de palavras e por etiqueta.
import { html } from '../html.js';
import { varsEtiqueta } from '../lib/visual.js';
import { CORES_ETIQUETA } from '../lib/modelos.js';

export const VISUALIZACOES = [
  { id: 'postits', nome: 'Post-its' },
  { id: 'nuvem', nome: 'Nuvem de palavras' },
  { id: 'etiquetas', nome: 'Por etiqueta' },
];

function densidade(n) {
  if (n <= 6) return 'd1';
  if (n <= 12) return 'd2';
  if (n <= 24) return 'd3';
  if (n <= 40) return 'd4';
  return 'd5';
}

// Inclinação leve e estável para cada post-it (não muda a cada atualização).
function giro(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.7;
}

export function Postits({ respostas, etiquetas, caixa }) {
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  // mais antigas primeiro: o mural fica na ordem em que as ideias chegaram
  const lista = [...respostas].reverse();
  return html`<div ref=${caixa} class=${`postits ${densidade(lista.length)}`}>
    ${lista.map((r) => {
      const e = etq.get(r.etiqueta_id);
      // post-it translúcido na cor da própria etiqueta
      return html`<article key=${r.id} class="postit" style=${{ '--postit': e?.cor || CORES_ETIQUETA[0], '--giro': `${giro(r.id)}deg` }}>
        <p>${r.texto}</p>
        ${e ? html`<span class="postit-etiqueta">${e.nome}</span>` : null}
      </article>`;
    })}
  </div>`;
}

export function PorEtiqueta({ respostas, etiquetas, caixa }) {
  const grupos = etiquetas.map((e) => ({ e, rs: respostas.filter((r) => r.etiqueta_id === e.id) }));
  const sem = respostas.filter((r) => !etiquetas.some((e) => e.id === r.etiqueta_id));
  if (sem.length) grupos.push({ e: { id: 'sem', nome: 'Sem etiqueta', cor: '#BDBDBD' }, rs: sem });
  return html`<div ref=${caixa} class="por-etiqueta" style=${{ '--grupos': grupos.length }}>
    ${grupos.map(({ e, rs }) => html`<section key=${e.id} class="grupo-etiqueta" style=${varsEtiqueta(e.cor)}>
      <h2><i></i>${e.nome}<span>${rs.length}</span></h2>
      <ul class=${grupos.length <= 2 && rs.length > 6 ? 'duas-colunas' : ''}>${[...rs].reverse().map((r) => html`<li key=${r.id}>${r.texto}</li>`)}</ul>
    </section>`)}
  </div>`;
}

// ---------- Nuvem de palavras ----------

const PARADAS = new Set(`a à às ao aos as o os um uma uns umas de da das do dos dum duma em na nas no nos num numa
por pela pelas pelo pelos para pra pro pras pros com sem sob sobre entre até após ante contra desde perante
e é ou mas nem que se porque pois como quando onde enquanto embora então logo porém também já ainda só
mais menos muito muita muitos muitas pouco pouca bem mal tão tanto tanta todo toda todos todas tudo nada
cada outro outra outros outras mesmo mesma mesmos mesmas qual quais quem cujo cuja isso isto aquilo esse
essa esses essas este esta estes estas aquele aquela aqueles aquelas ele ela eles elas eu tu você vocês
nós nosso nossa nossos nossas seu sua seus suas meu minha meus minhas lhe lhes me te nos vos
ser sou é são era eram foi foram será serão seja sejam sendo sido estar estou está estão estava estavam
esteve estiveram ter tem têm tinha tinham teve tiveram terá haver há havia houve fazer faz fazem feito
ir vai vão ia poder pode podem podemos deve devem dever precisa precisam precisamos ficar fica
não sim lá aqui aí ali hoje sempre nunca depois antes agora assim etc tipo coisa coisas vez vezes
algo alguém algum alguma alguns algumas qualquer quaisquer ter dar dá dão ver vê`.split(/\s+/));

export function palavras(respostas, limite = 60) {
  const conta = new Map();
  const exibir = new Map();
  for (const r of respostas) {
    const vistos = new Set();
    for (const bruta of r.texto.match(/[\p{L}][\p{L}'-]*/gu) || []) {
      const p = bruta.toLocaleLowerCase('pt-BR');
      if (p.length < 3 || PARADAS.has(p) || vistos.has(p)) continue;
      vistos.add(p); // conta cada palavra uma vez por resposta
      conta.set(p, (conta.get(p) || 0) + 1);
      if (!exibir.has(p)) exibir.set(p, p);
    }
  }
  return [...conta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, limite)
    .map(([p, n]) => ({ palavra: exibir.get(p), n }));
}

export function Nuvem({ respostas, caixa }) {
  const lista = palavras(respostas);
  if (!lista.length) return html`<div ref=${caixa} class="mural-vazio">Ainda não há palavras suficientes.</div>`;
  const max = lista[0].n;
  const min = lista.at(-1).n;
  // maiores no centro: alterna as palavras entre a esquerda e a direita da principal
  const ordem = [];
  lista.forEach((w, i) => (i % 2 ? ordem.push(w) : ordem.unshift(w)));
  return html`<div ref=${caixa} class="nuvem">
    ${ordem.map((w) => {
      // empate geral (ex.: poucas respostas): todas no mesmo tamanho, sem destaque
      const empate = max === min;
      const t = empate ? 0.35 : (w.n - min) / (max - min);
      const nivel = empate ? 'n2' : w.n === max ? 'n1' : t > 0.55 ? 'n2' : t > 0.2 ? 'n3' : 'n4';
      return html`<span key=${w.palavra} class=${`palavra ${nivel}`} style=${{ fontSize: `${(1 + Math.sqrt(t) * 3.4).toFixed(2)}em` }}
        title=${`${w.n} ${w.n === 1 ? 'resposta' : 'respostas'}`}>${w.palavra}</span>`;
    })}
  </div>`;
}

// ---------- As 3 mais votadas (depois que o facilitador revela) ----------
export function Prioridades({ top, etiquetas, caixa }) {
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  if (!top.length) return html`<div ref=${caixa} class="mural-vazio">Nenhum voto nesta pergunta.</div>`;
  return html`<div ref=${caixa} class="prioridades" style=${{ '--itens': Math.min(top.length, 5) }}>
    ${top.map((r, i) => {
      const e = etq.get(r.etiqueta_id);
      return html`<article key=${r.id} class=${`prioridade p${r.posicao}`} style=${{ ...varsEtiqueta(e?.cor || CORES_ETIQUETA[0]), animationDelay: `${i * 0.25}s` }}>
        <span class="prioridade-posicao">${r.posicao}º</span>
        <p>${r.texto}</p>
        <div class="prioridade-rodape">
          ${e ? html`<span class="cartao-etiqueta">${e.nome}</span>` : html`<span></span>`}
          <span class="prioridade-votos">${r.votos} ${r.votos === 1 ? 'voto' : 'votos'}</span>
        </div>
      </article>`;
    })}
  </div>`;
}

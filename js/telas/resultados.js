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
// Ranking: o 1º lugar em destaque, barras do tamanho dos votos e revelação de
// baixo para cima (3º, 2º e por fim o 1º), para criar expectativa na sala.
export function Prioridades({ top, etiquetas, votantes = 0, caixa, classe = '' }) {
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  if (!top.length) return html`<div ref=${caixa} class="mural-vazio">Nenhum voto nesta pergunta.</div>`;
  const max = Math.max(...top.map((r) => r.votos));
  const n = top.length;
  return html`<ol ref=${caixa} class=${`ranking ${n > 3 ? 'ranking-longo' : ''} ${classe}`}>
    ${top.map((r, i) => {
      const e = etq.get(r.etiqueta_id);
      const atraso = (n - 1 - i) * 0.7; // o último aparece primeiro
      const sala = votantes ? Math.round((r.votos / votantes) * 100) : null;
      return html`<li key=${r.id} class=${`ranking-item p${r.posicao}`}
        style=${{ ...varsEtiqueta(e?.cor || CORES_ETIQUETA[0]), '--atraso': `${atraso}s`, '--parte': `${Math.max(6, (r.votos / max) * 100)}%` }}>
        <span class="ranking-posicao">${r.posicao}º</span>
        <div class="ranking-corpo">
          <p>${r.texto}</p>
          <div class="ranking-linha">
            <span class="ranking-trilho"><i></i></span>
            <span class="ranking-votos"><b>${r.votos}</b> ${r.votos === 1 ? 'voto' : 'votos'}</span>
          </div>
          <div class="ranking-meta">
            ${e ? html`<span class="cartao-etiqueta">${e.nome}</span>` : null}
            ${sala !== null ? html`<span>${sala}% da sala escolheu</span>` : null}
          </div>
        </div>
      </li>`;
    })}
  </ol>`;
}

// ---------- Resumo geral da dinâmica ----------
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

export function ResumoNumeros({ resumo, etiquetas, atividades, rotulo, caixa }) {
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const atv = new Map(atividades.map((a) => [a.id, a]));
  const priorizadas = resumo.por_atividade.reduce((s, a) => s + a.top.length, 0);
  const maxAtv = Math.max(1, ...resumo.por_atividade.map((a) => a.n));
  const destaques = [
    { n: resumo.respostas, rotulo: resumo.respostas === 1 ? 'resposta' : 'respostas' },
    { n: resumo.pessoas, rotulo: resumo.pessoas === 1 ? 'pessoa participou' : 'pessoas participaram' },
    { n: resumo.votos, rotulo: resumo.votos === 1 ? 'voto' : 'votos' },
    { n: priorizadas, rotulo: priorizadas === 1 ? 'ideia priorizada' : 'ideias priorizadas' },
  ];
  return html`<div ref=${caixa} class="resumo">
    <div class="resumo-destaques">
      ${destaques.map((d, i) => html`<div key=${i} class="resumo-numero" style=${{ animationDelay: `${i * 0.12}s` }}>
        <strong>${d.n}</strong><span>${d.rotulo}</span></div>`)}
    </div>
    <div class="resumo-colunas">
      ${resumo.por_etiqueta.length ? html`<section class="resumo-bloco">
        <h2>Por etiqueta</h2>
        ${resumo.por_etiqueta.map((x) => {
          const e = etq.get(x.etiqueta_id);
          const p = pct(x.n, resumo.respostas);
          return html`<div key=${x.etiqueta_id} class="barra-linha" style=${varsEtiqueta(e?.cor)}>
            <div class="barra-rotulo"><span><i class="ponto"></i>${e?.nome || '—'}</span><b>${p}% · ${x.n}</b></div>
            <div class="barra"><i style=${{ width: `${p}%` }}></i></div>
          </div>`;
        })}
      </section>` : null}
      <section class="resumo-bloco">
        <h2>Respostas por ${rotulo.toLowerCase()}</h2>
        ${resumo.por_atividade.map((x) => {
          const a = atv.get(x.atividade_id);
          return html`<div key=${x.atividade_id} class="barra-linha compacta">
            <div class="barra-rotulo"><span><em>${a?.ordem}</em>${a?.titulo}</span><b>${x.n}</b></div>
            <div class="barra"><i style=${{ width: `${(x.n / maxAtv) * 100}%` }}></i></div>
          </div>`;
        })}
      </section>
    </div>
  </div>`;
}

export function ResumoPrioridades({ resumo, etiquetas, atividades, rotulo, caixa }) {
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const atv = new Map(atividades.map((a) => [a.id, a]));
  const grupos = resumo.por_atividade.filter((x) => x.n > 0);
  if (!grupos.length) return html`<div ref=${caixa} class="mural-vazio">Ainda não há respostas nesta sessão.</div>`;
  // poucas perguntas: letra maior (o ajuste automático diminui se não couber)
  return html`<div ref=${caixa} class="resumo-prioridades" style=${{ '--colunas': Math.min(4, Math.max(1, grupos.length)), '--base': grupos.length <= 3 ? '1.35em' : '1em' }}>
    ${grupos.map((x) => {
      const a = atv.get(x.atividade_id);
      return html`<section key=${x.atividade_id} class="resumo-pergunta">
        <h2><em>${rotulo} ${a?.ordem}</em>${a?.titulo}</h2>
        ${x.top.length
          ? html`<ol>${x.top.slice(0, 5).map((t) => {
              const e = etq.get(t.etiqueta_id);
              return html`<li key=${t.id} style=${{ '--postit': e?.cor || CORES_ETIQUETA[0] }}>
                <span class="resumo-pos">${t.posicao}º</span><p>${t.texto}</p><small>${t.votos} ${t.votos === 1 ? 'voto' : 'votos'}</small></li>`;
            })}</ol>${x.top.length > 5 ? html`<p class="resumo-sem-voto">+${x.top.length - 5} empatadas</p>` : null}`
          : html`<p class="resumo-sem-voto">${x.n} ${x.n === 1 ? 'resposta' : 'respostas'}, sem votação</p>`}
      </section>`;
    })}
  </div>`;
}

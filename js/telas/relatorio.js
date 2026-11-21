// Relatório da dinâmica para o cliente: páginas A4 prontas para "Salvar como PDF".
import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { backend } from '../backend/index.js';
import { montarRelatorio, pct } from '../lib/relatorio.js';
import { plural } from '../lib/util.js';
import { varsEtiqueta } from '../lib/visual.js';
import { CORES_ETIQUETA } from '../lib/modelos.js';
import { MarcaOO } from '../lib/marca.js';
import { Carregando } from './comum.js';

const hoje = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const dataLonga = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : hoje());

export function Relatorio({ id }) {
  const [estado, setEstado] = useState({ carregando: true });
  useEffect(() => {
    (async () => {
      const usuario = await backend.usuario();
      if (!usuario) { setEstado({ semLogin: true }); return; }
      try {
        const dados = await backend.carregarSessao(id);
        setEstado(dados ? { rel: montarRelatorio(dados) } : { erro: 'Sessão não encontrada.' });
      } catch (e) {
        setEstado({ erro: e.message });
      }
    })();
  }, [id]);

  useEffect(() => {
    if (estado.rel) document.title = `Relatório · ${estado.rel.sessao.nome}`;
    return () => { document.title = 'Dinâmica O&O'; };
  }, [estado.rel]);

  if (estado.carregando) return html`<main class="relatorio"><${Carregando} texto="Montando o relatório…" /></main>`;
  if (estado.semLogin) {
    return html`<main class="relatorio"><div class="centro"><h1>Entre no painel</h1>
      <p class="suave">O relatório é restrito ao time O&O.</p><a class="btn btn-escuro" href="#/painel">Ir para o login</a></div></main>`;
  }
  if (estado.erro) return html`<main class="relatorio"><div class="centro"><h1>${estado.erro}</h1></div></main>`;

  const { rel } = estado;
  const { sessao, totais } = rel;
  const rotulo = sessao.rotulo_atividade || 'Pergunta';
  const comVotos = rel.porAtividade.filter((x) => x.top.length);
  const maxAtv = Math.max(1, ...rel.porAtividade.map((x) => x.respostas.length));

  return html`<main class="relatorio">
    <div class="rel-barra">
      <a class="link-acao" href=${`#/painel/${sessao.id}`}>← Voltar ao painel</a>
      <span class="suave">Na janela que abrir, escolha <b>Salvar como PDF</b>.</span>
      <button class="btn btn-escuro" onClick=${() => window.print()}>Baixar PDF</button>
    </div>

    ${rel.ensaio ? html`<p class="rel-aviso">Esta sessão ainda está em modo ensaio: o relatório mostra as respostas de teste.</p>` : null}

    <!-- Capa -->
    <section class="rel-pagina rel-capa">
      <div class="rel-capa-topo">
        ${sessao.visual?.logo_url ? html`<img class="rel-logo" src=${sessao.visual.logo_url} alt=${sessao.cliente} />` : html`<span class="rel-cliente">${sessao.cliente}</span>`}
      </div>
      <div class="rel-capa-miolo">
        <span class="rel-rotulo">Relatório da dinâmica</span>
        <h1>${sessao.nome}</h1>
        <p>${sessao.cliente ? `${sessao.cliente} · ` : ''}${dataLonga(sessao.data || sessao.criado_em)}</p>
      </div>
      <div class="rel-capa-numeros">
        <div><b>${totais.respostas}</b><span>respostas</span></div>
        <div><b>${totais.pessoas}</b><span>${totais.pessoas === 1 ? 'pessoa participou' : 'pessoas participaram'}</span></div>
        <div><b>${totais.atividades}</b><span>${totais.atividades === 1 ? rotulo.toLowerCase() : rotulo.toLowerCase() + 's'}</span></div>
      </div>
      <div class="rel-capa-rodape"><${MarcaOO} classe="rel-marca" /><span>Metodologia Oito&Onze</span></div>
    </section>

    <!-- Visão geral -->
    <section class="rel-pagina">
      <${Cabecalho} sessao=${sessao} />
      <h2 class="rel-titulo">Visão geral</h2>
      <div class="rel-destaques">
        <div class="rel-destaque amarelo"><b>${totais.respostas}</b><span>respostas</span></div>
        <div class="rel-destaque"><b>${totais.pessoas}</b><span>pessoas participaram</span></div>
        <div class="rel-destaque"><b>${totais.votos}</b><span>votos de prioridade</span></div>
        <div class="rel-destaque"><b>${totais.priorizadas}</b><span>ideias priorizadas</span></div>
      </div>

      ${rel.porEtiqueta.length ? html`<h3 class="rel-subtitulo">Respostas por etiqueta</h3>
        <div class="rel-barras">
          ${rel.porEtiqueta.map(({ etiqueta, n }) => html`<div class="rel-barra-linha" style=${varsEtiqueta(etiqueta.cor)}>
            <span class="rel-barra-nome"><i class="ponto"></i>${etiqueta.nome}</span>
            <span class="rel-barra-trilho"><i style=${{ width: `${pct(n, totais.respostas)}%` }}></i></span>
            <span class="rel-barra-valor">${pct(n, totais.respostas)}% · ${n}</span>
          </div>`)}
        </div>` : null}

      <h3 class="rel-subtitulo">Por ${rotulo.toLowerCase()}</h3>
      <table class="rel-tabela">
        <thead><tr><th>Nº</th><th>${rotulo}</th><th>Respostas</th>${rel.etiquetas.map((e) => html`<th key=${e.id}>${e.nome}</th>`)}<th>Votaram</th></tr></thead>
        <tbody>
          ${rel.porAtividade.map((x) => html`<tr key=${x.atividade.id}>
            <td>${x.atividade.ordem}</td>
            <td class="rel-tabela-titulo">${x.atividade.titulo}
              <span class="rel-mini-barra"><i style=${{ width: `${(x.respostas.length / maxAtv) * 100}%` }}></i></span></td>
            <td>${x.respostas.length}</td>
            ${x.porEtiqueta.map((p) => html`<td key=${p.etiqueta.id}>${p.n}</td>`)}
            <td>${x.votantes || '—'}</td>
          </tr>`)}
        </tbody>
      </table>
    </section>

    <!-- Prioridades -->
    ${comVotos.length ? html`<section class="rel-pagina">
      <${Cabecalho} sessao=${sessao} />
      <h2 class="rel-titulo">As prioridades</h2>
      <p class="rel-intro">As ideias mais votadas em cada ${rotulo.toLowerCase()}. Cada pessoa pôde escolher até 3 prioridades por rodada.</p>
      <div class="rel-prioridades">
        ${comVotos.map((x) => html`<div key=${x.atividade.id} class="rel-prioridade-bloco">
          <h3><em>${rotulo} ${x.atividade.ordem}</em>${x.atividade.titulo}</h3>
          <ol>${x.top.map((r) => html`<li key=${r.id} style=${{ '--postit': r.etiqueta?.cor || CORES_ETIQUETA[0] }}>
            <span class="rel-pos">${r.posicao}º</span><p>${r.texto}</p><small>${plural(r.votos, 'voto', 'votos')}</small>
          </li>`)}</ol>
        </div>`)}
      </div>
    </section>` : null}

    <!-- Cada problemática com todas as respostas -->
    ${rel.porAtividade.filter((x) => x.respostas.length).map((x) => html`<section key=${x.atividade.id} class="rel-pagina rel-atividade">
      <${Cabecalho} sessao=${sessao} />
      <span class="rel-rotulo">${rotulo} ${x.atividade.ordem} de ${totais.atividades}</span>
      <h2 class="rel-titulo">${x.atividade.titulo}</h2>
      ${x.atividade.texto_apoio ? html`<p class="rel-intro">${x.atividade.texto_apoio}</p>` : null}
      <div class="rel-chips">
        <span>${plural(x.respostas.length, 'resposta', 'respostas')}</span>
        ${x.porEtiqueta.map((p) => html`<span key=${p.etiqueta.id} style=${varsEtiqueta(p.etiqueta.cor)}><i class="ponto"></i>${p.etiqueta.nome}: ${p.n}</span>`)}
        ${x.votantes ? html`<span>${plural(x.votantes, 'pessoa votou', 'pessoas votaram')}</span>` : null}
      </div>

      ${x.respostas.length
        ? html`<table class="rel-tabela rel-respostas">
            <thead><tr><th>Resposta</th><th>Etiqueta</th>${x.votos ? html`<th>Votos</th>` : null}</tr></thead>
            <tbody>
              ${x.respostas.map((r) => {
                const top = x.top.find((t) => t.id === r.id);
                return html`<tr key=${r.id} class=${top ? 'rel-linha-top' : ''}>
                  <td>${top ? html`<span class="rel-pos">${top.posicao}º</span>` : null}${r.texto}</td>
                  <td>${r.etiqueta ? html`<span class="chip" style=${varsEtiqueta(r.etiqueta.cor)}>${r.etiqueta.nome}</span>` : '—'}</td>
                  ${x.votos ? html`<td class="rel-num">${r.votos || '—'}</td>` : null}
                </tr>`;
              })}
            </tbody>
          </table>`
        : html`<p class="rel-intro">Nenhuma resposta nesta ${rotulo.toLowerCase()}.</p>`}
    </section>`)}
  </main>`;
}

function Cabecalho({ sessao }) {
  return html`<header class="rel-cabecalho">
    <span>${sessao.cliente ? `${sessao.cliente} · ` : ''}${sessao.nome}</span>
    <span class="rel-cabecalho-marca"><${MarcaOO} classe="rel-marca-mini" /> Metodologia Oito&Onze</span>
  </header>`;
}

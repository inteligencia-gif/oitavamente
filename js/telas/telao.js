import { useRef, useLayoutEffect, useEffect, useState } from 'preact/hooks';
import { html } from '../html.js';
import { backend } from '../backend/index.js';
import { useAoVivo } from '../lib/aoVivo.js';
import { linkParticipante, plural } from '../lib/util.js';
import { varsVisual, varsEtiqueta } from '../lib/visual.js';
import { Assinatura, Carregando, MarcaCliente, QR } from './comum.js';
import { Cronometro, useDesvio, useRestante, envioAberto } from '../lib/cronometro.js';
import { Postits, Nuvem, PorEtiqueta, Prioridades } from './resultados.js';

const MAX_CARTOES = 60;

function densidade(n) {
  if (n <= 6) return 'd1';
  if (n <= 12) return 'd2';
  if (n <= 24) return 'd3';
  if (n <= 40) return 'd4';
  return 'd5';
}

// Diminui a letra do mural até todos os cartões caberem na tela.
function useCaber(ref, chave) {
  const [tamanho, setTamanho] = useState(0);
  useEffect(() => {
    let n = 0;
    const f = () => setTamanho(++n);
    addEventListener('resize', f);
    // a Poppins chega depois do primeiro desenho e muda a altura dos cartões
    document.fonts?.ready?.then(f);
    document.fonts?.addEventListener?.('loadingdone', f);
    return () => {
      removeEventListener('resize', f);
      document.fonts?.removeEventListener?.('loadingdone', f);
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let escala = 1;
    el.style.setProperty('--escala', '1');
    while (el.scrollHeight > el.clientHeight + 2 && escala > 0.4) {
      escala *= 0.92;
      el.style.setProperty('--escala', escala.toFixed(3));
    }
  }, [chave, tamanho]);
}

export function Telao({ codigo, chave }) {
  const { dados, erro } = useAoVivo(() => backend.telao(codigo, chave), [codigo, chave], { intervalo: 5000 });
  const mural = useRef(null);
  const desvio = useDesvio(dados?.agora);
  const restante = useRestante(dados?.sessao?.envio_aberto ? dados.sessao.envio_prazo : null, desvio);
  const abertoAgora = dados?.sessao ? envioAberto(dados.sessao, restante) : false;
  const restanteVoto = useRestante(dados?.sessao?.votacao_aberta ? dados.sessao.votacao_prazo : null, desvio);
  useCaber(mural, dados
    ? [dados.respostas?.map((r) => r.id + r.texto).join('|'), dados.sessao?.atividade_foco, abertoAgora, dados.sessao?.visualizacao, dados.sessao?.resultado_visivel, (dados.top || []).map((t) => t.id + t.votos).join()].join('#')
    : '');

  if (dados === undefined) {
    return html`<main class="tema telao" style=${varsVisual()}>
      ${erro ? html`<div class="centro"><h1>Sem conexão</h1><p class="suave">Tentando de novo…</p></div>` : html`<${Carregando} />`}
    </main>`;
  }
  if (dados === null) {
    return html`<main class="tema telao" style=${varsVisual()}>
      <div class="centro"><h1>Link do telão inválido</h1><p class="suave">Abra o telão pelo botão “Abrir telão” no painel do facilitador.</p><a class="btn btn-escuro" href="#/painel">Ir para o painel</a></div>
    </main>`;
  }

  const { sessao, atividades, etiquetas, respostas, conectados, total_respostas, votantes = 0 } = dados;
  const votando = Boolean(sessao.votacao_aberta && sessao.atividade_foco && restanteVoto !== 0);
  const revelado = Boolean(sessao.resultado_visivel && sessao.atividade_foco);
  const foco = atividades.find((a) => a.id === sessao.atividade_foco);
  const link = linkParticipante(sessao.codigo);
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const visiveis = respostas.slice(0, MAX_CARTOES);
  const aberto = envioAberto(sessao, restante);

  return html`<main class="tema telao" style=${varsVisual(sessao.visual)}>
    ${erro ? html`<div class="telao-offline">reconectando…</div>` : null}
    <header class="telao-topo">
      <${MarcaCliente} sessao=${sessao} classe="telao-marca" />
      <div class="telao-contadores">
        ${foco && !votando && !sessao.votacao_aberta ? html`<${Cronometro} restante=${restante} classe="cronometro-telao" />` : null}
        ${sessao.votacao_aberta ? html`<${Cronometro} restante=${restanteVoto} classe="cronometro-telao" alerta=${15} />` : null}
        ${votando ? html`<div class="telao-votantes"><strong>${votantes}</strong><span>${votantes === 1 ? 'votou' : 'votaram'}</span></div>` : null}
        <div><strong>${conectados}</strong><span>${conectados === 1 ? 'conectada' : 'conectadas'}</span></div>
        <div><strong>${foco ? respostas.length : total_respostas}</strong><span>${(foco ? respostas.length : total_respostas) === 1 ? 'resposta' : 'respostas'}</span></div>
      </div>
    </header>

    ${!foco
      ? html`<section class="telao-lobby">
          <div class="telao-lobby-texto">
            <div class="telao-rotulo">${sessao.cliente}</div>
            <h1>${sessao.nome}</h1>
            <p>Aponte a câmera do celular para o QR code ao lado.</p>
            <p class="telao-lobby-sub">Sem cadastro e sem aplicativo. ${plural(conectados, 'pessoa conectada', 'pessoas conectadas')}.</p>
          </div>
          <div class="telao-lobby-qr"><${QR} texto=${link} tamanho=${380} escura=${sessao.visual?.escura || '#131313'} /></div>
        </section>`
      : html`<section class="telao-ativo">
          <div class="telao-pergunta">
            <div class="telao-rotulo">
              ${sessao.rotulo_atividade} ${foco.ordem} de ${atividades.length}
              <span class=${`estado ${aberto || votando || revelado ? 'estado-aberto' : 'estado-fechado'}`}>
                ${aberto ? 'Envio aberto' : votando ? 'Votação aberta' : revelado ? 'Prioridades da sala' : 'Envio encerrado'}
              </span>
            </div>
            <h1>${foco.titulo}</h1>
            ${votando ? html`<p class="telao-chamada-voto">Vote pelo celular: escolha até 3 prioridades</p>` : null}
            ${etiquetas.length ? html`<div class="telao-legenda">
              ${etiquetas.map((e) => html`<span key=${e.id} class="legenda-item" style=${varsEtiqueta(e.cor)}><i></i>${e.nome}
                <b>${respostas.filter((r) => r.etiqueta_id === e.id).length}</b></span>`)}
            </div>` : null}
          </div>
          ${revelado
            ? html`<${Prioridades} top=${dados.top || []} etiquetas=${etiquetas} caixa=${mural} />`
            : !aberto && respostas.length
            ? html`<${Resultados} modo=${sessao.visualizacao} respostas=${respostas} etiquetas=${etiquetas} caixa=${mural} />`
            : respostas.length
            ? html`<div ref=${mural} class=${`mural ${densidade(visiveis.length)}`}>
                ${visiveis.map((r) => {
                  const e = etq.get(r.etiqueta_id);
                  return html`<article key=${r.id} class="cartao-postit" style=${varsEtiqueta(e?.cor)}>
                    <p>${r.texto}</p>
                    ${e ? html`<span class="cartao-etiqueta">${e.nome}</span>` : null}
                  </article>`;
                })}
                ${respostas.length > MAX_CARTOES ? html`<div class="mural-mais">+${respostas.length - MAX_CARTOES} anteriores</div>` : null}
              </div>`
            : html`<div class="mural-vazio">
                ${aberto ? 'As respostas vão aparecer aqui. Pode mandar pelo celular!' : 'Nenhuma resposta nesta pergunta.'}
              </div>`}
        </section>`}

    <footer class="telao-rodape">
      <${Assinatura} classe="assinatura-telao" />
      ${foco ? html`<div class="telao-qr-canto">
        <div class="telao-qr-texto"><strong>Entre pelo celular</strong><span>aponte a câmera</span></div>
        <${QR} texto=${link} tamanho=${120} escura=${sessao.visual?.escura || '#131313'} />
      </div>` : null}
    </footer>
  </main>`;
}

// Depois que o envio fecha: todas as respostas na visão escolhida no painel.
function Resultados({ modo, respostas, etiquetas, caixa }) {
  if (modo === 'nuvem') return html`<${Nuvem} respostas=${respostas} caixa=${caixa} />`;
  if (modo === 'etiquetas') return html`<${PorEtiqueta} respostas=${respostas} etiquetas=${etiquetas} caixa=${caixa} />`;
  return html`<${Postits} respostas=${respostas} etiquetas=${etiquetas} caixa=${caixa} />`;
}

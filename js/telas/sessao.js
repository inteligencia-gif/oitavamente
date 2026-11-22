import { useState, useEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { backend } from '../backend/index.js';
import { useAoVivo } from '../lib/aoVivo.js';
import { linkParticipante, linkTelao, fmtHora, plural, copiar, numerarParticipantes } from '../lib/util.js';
import { varsEtiqueta, varsVisual, VISUAL_PADRAO } from '../lib/visual.js';
import { CORES_ETIQUETA } from '../lib/modelos.js';
import { exportarPlanilha } from '../lib/exportar.js';
import { Carregando, QR } from './comum.js';
import { Cronometro, useRestante, prazoFinal } from '../lib/cronometro.js';
import { TOLERANCIA_VOTO_MS } from '../lib/util.js';
import { VISUALIZACOES } from './resultados.js';

const STATUS = { rascunho: 'Rascunho', ao_vivo: 'Ao vivo', encerrada: 'Encerrada', arquivada: 'Arquivada' };
export const nomeStatus = (s) => STATUS[s] || s;

export function SessaoPainel({ id }) {
  const { dados, erro, recarregar } = useAoVivo(() => backend.carregarSessao(id), [id], { intervalo: 5000 });
  const [aba, setAba] = useState('conduzir');
  const [aviso, setAviso] = useState(null);
  const [duplicando, setDuplicando] = useState(false);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.erro ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  if (dados === undefined) {
    return erro ? html`<div class="painel-miolo"><p class="aviso aviso-erro">${erro.message}</p></div>` : html`<${Carregando} />`;
  }
  if (dados === null) {
    return html`<div class="painel-miolo"><h1>Sessão não encontrada</h1><a class="btn btn-fantasma" href="#/painel">Voltar às sessões</a></div>`;
  }

  // Executa uma ação do facilitador, mostra o resultado e atualiza a tela.
  const acao = async (fn, ok) => {
    try {
      await fn();
      if (ok) setAviso({ texto: ok });
      await recarregar();
      return true;
    } catch (e) {
      setAviso({ texto: e.message || 'Algo deu errado.', erro: true });
      return false;
    }
  };

  const { sessao } = dados;
  const exportar = () => acao(async () => {
    const n = await exportarPlanilha(dados, { incluirEnsaio: sessao.modo_teste });
    setAviso({ texto: `Planilha gerada com ${plural(n, 'resposta', 'respostas')}.` });
  });

  // Cópia com as mesmas perguntas, etiquetas e visual, sem respostas; abre a cópia em seguida.
  const duplicar = async () => {
    setDuplicando(true);
    try {
      const nova = await backend.duplicarSessao(sessao.id);
      location.hash = `#/painel/${nova.id}`;
    } catch (e) {
      setAviso({ texto: e.message || 'Não deu para duplicar.', erro: true });
      setDuplicando(false);
    }
  };

  return html`<div class="painel-miolo painel-sessao">
    <div class="painel-cabeca">
      <div>
        <a class="link-discreto" href="#/painel">← Sessões</a>
        <h1>${sessao.nome}</h1>
        <p class="suave">
          ${sessao.cliente ? `${sessao.cliente} · ` : ''}código <strong class="codigo">${sessao.codigo}</strong> ·
          <span class=${`selo selo-${sessao.status}`}>${nomeStatus(sessao.status)}</span>
        </p>
      </div>
      <div class="acoes">
        <a class="btn btn-fantasma" href=${linkTelao(sessao.codigo, sessao.chave_telao)} target="_blank" rel="noopener">Abrir telão</a>
        <a class="btn btn-fantasma" href=${linkParticipante(sessao.codigo)} target="_blank" rel="noopener">Ver como participante</a>
        <button class="btn btn-fantasma" onClick=${duplicar} disabled=${duplicando}>${duplicando ? 'Duplicando…' : 'Duplicar'}</button>
        <a class="btn btn-fantasma" href=${`#/relatorio/${sessao.id}`} target="_blank" rel="noopener">Relatório (PDF)</a>
        <button class="btn btn-escuro" onClick=${exportar}>${sessao.modo_teste ? 'Exportar ensaio' : 'Exportar planilha'}</button>
      </div>
    </div>

    ${sessao.modo_teste ? html`<${FaixaEnsaio} dados=${dados} acao=${acao} />` : null}

    <nav class="abas" role="tablist">
      <button role="tab" aria-selected=${aba === 'conduzir'} class=${aba === 'conduzir' ? 'ativa' : ''} onClick=${() => setAba('conduzir')}>Conduzir</button>
      <button role="tab" aria-selected=${aba === 'configurar'} class=${aba === 'configurar' ? 'ativa' : ''} onClick=${() => setAba('configurar')}>Configurar</button>
    </nav>

    ${aba === 'conduzir'
      ? html`<${Conduzir} dados=${dados} acao=${acao} />`
      : html`<${Configurar} dados=${dados} acao=${acao} />`}

    ${aviso ? html`<div class=${`toast ${aviso.erro ? 'toast-erro' : ''}`} role="status">${aviso.texto}</div>` : null}
  </div>`;
}

function FaixaEnsaio({ dados, acao }) {
  const { sessao, respostas } = dados;
  const n = respostas.filter((r) => r.teste).length;
  const praValer = () => {
    if (!confirm(`Começar a dinâmica pra valer?\n\nAs ${n} respostas do ensaio serão apagadas e o telão volta para a tela de entrada. As próximas respostas entram nos dados finais.`)) return;
    acao(async () => {
      await backend.limparEnsaio(sessao.id);
      await backend.atualizarSessao(sessao.id, { modo_teste: false, atividade_foco: null, envio_aberto: false, status: 'rascunho' });
    }, 'Modo ensaio desligado. Tudo pronto para a dinâmica.');
  };
  const limpar = () => {
    if (!confirm(`Apagar as ${n} respostas do ensaio?`)) return;
    acao(() => backend.limparEnsaio(sessao.id), 'Ensaio limpo.');
  };
  return html`<div class="faixa-ensaio">
    <div><strong>Modo ensaio.</strong> As respostas de agora são de teste e não entram nos dados finais.</div>
    <div class="acoes">
      <button class="btn btn-fantasma btn-pequeno" onClick=${limpar} disabled=${!n}>Limpar ensaio (${n})</button>
      <button class="btn btn-escuro btn-pequeno" onClick=${praValer}>Começar pra valer</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Conduzir

function Conduzir({ dados, acao }) {
  const { sessao, atividades, etiquetas, respostas, conectados } = dados;
  const votos = dados.votos || [];
  const foco = atividades.find((a) => a.id === sessao.atividade_foco);
  const votantesFoco = new Set(votos.filter((v) => v.atividade_id === sessao.atividade_foco).map((v) => v.participante_id)).size;
  const [ver, setVer] = useState(sessao.atividade_foco || atividades[0]?.id);
  const daRodada = respostas.filter((r) => r.teste === sessao.modo_teste);
  const vendo = atividades.find((a) => a.id === ver) || foco || atividades[0];
  const proxima = foco ? atividades.find((a) => a.ordem === foco.ordem + 1) : atividades[0];
  const rotulo = sessao.rotulo_atividade;

  useEffect(() => { if (sessao.atividade_foco) setVer(sessao.atividade_foco); }, [sessao.atividade_foco]);

  const atualizar = (patch, ok) => acao(() => backend.atualizarSessao(sessao.id, patch), ok);

  // Cronômetro: quando zera, o painel fecha o envio (o banco já recusa respostas fora do prazo).
  const restante = useRestante(sessao.envio_aberto ? sessao.envio_prazo : null);
  // fecha só depois da tolerância, para quem estava escrevendo conseguir enviar
  const restanteFinal = useRestante(sessao.envio_aberto ? prazoFinal(sessao.envio_prazo) : null);
  const fechando = useRef(null);
  useEffect(() => {
    if (sessao.envio_aberto && restanteFinal === 0 && fechando.current !== sessao.envio_prazo) {
      fechando.current = sessao.envio_prazo;
      atualizar({ envio_aberto: false }, 'Tempo esgotado. Envio fechado.');
    }
  }, [restanteFinal, sessao.envio_aberto, sessao.envio_prazo]);
  // Cronômetro da votação: quando zera (mais a margem do último toque), o painel encerra a votação.
  const restanteVoto = useRestante(sessao.votacao_aberta ? sessao.votacao_prazo : null);
  const restanteVotoFinal = useRestante(sessao.votacao_aberta && sessao.votacao_prazo
    ? new Date(Date.parse(sessao.votacao_prazo) + TOLERANCIA_VOTO_MS).toISOString() : null);
  const fechandoVoto = useRef(null);
  useEffect(() => {
    if (sessao.votacao_aberta && restanteVotoFinal === 0 && fechandoVoto.current !== sessao.votacao_prazo) {
      fechandoVoto.current = sessao.votacao_prazo;
      atualizar({ votacao_aberta: false }, 'Tempo de votação esgotado. Votação encerrada.');
    }
  }, [restanteVotoFinal, sessao.votacao_aberta, sessao.votacao_prazo]);
  // +1 min vale para o que estiver correndo (envio ou votação). Guarda o último prazo pedido,
  // para cliques seguidos somarem mesmo antes de a tela recarregar.
  const ultimoPrazo = useRef(0);
  useEffect(() => { ultimoPrazo.current = 0; }, [sessao.atividade_foco, sessao.envio_aberto, sessao.votacao_aberta]);
  const maisUmMinuto = () => {
    const campo = sessao.votacao_aberta ? 'votacao_prazo' : 'envio_prazo';
    const novo = Math.max(Date.parse(sessao[campo]), ultimoPrazo.current) + 60_000;
    ultimoPrazo.current = novo;
    atualizar({ [campo]: new Date(novo).toISOString() }, '+1 minuto.');
  };
  const minutos = Math.round((sessao.tempo_resposta_seg ?? 480) / 60);
  const resumoNaTela = Boolean(sessao.resumo_visivel);
  const mostrarResumo = () => atualizar({ resumo_visivel: true, resumo_visao: sessao.resumo_visao || 'numeros' }, 'Resumo geral no telão.');

  // ---- Fluxo da rodada em etapas: Respostas → Votação → Top 3 → Próxima ----
  const minVoto = Math.round((sessao.tempo_votacao_seg ?? 60) / 60);
  const nRespostasFoco = foco ? daRodada.filter((r) => r.atividade_id === foco.id).length : 0;
  const votou = votantesFoco > 0;
  const etapaAtual = !foco || resumoNaTela ? null
    : sessao.votacao_aberta ? 'votacao'
    : sessao.resultado_visivel ? 'top3'
    : votou ? 'votado'
    : 'respostas';
  const etapas = [
    { id: 'respostas', nome: 'Respostas', estado: sessao.envio_aberto ? 'ativa' : 'feita', info: plural(nRespostasFoco, 'resposta', 'respostas') },
    { id: 'votacao', nome: 'Votação', estado: sessao.votacao_aberta ? 'ativa' : votou ? 'feita' : 'pendente', info: votou || sessao.votacao_aberta ? plural(votantesFoco, 'pessoa votou', 'pessoas votaram') : null },
    { id: 'top3', nome: 'Top 3 no telão', estado: sessao.resultado_visivel ? 'ativa' : 'pendente' },
    { id: 'proxima', nome: proxima ? 'Próxima' : 'Resumo geral', estado: 'pendente' },
  ];
  const irProxima = proxima
    ? { texto: `Próxima: ${rotulo.toLowerCase()} ${proxima.ordem} →`, fazer: () => focar(proxima) }
    : { texto: 'Ver resumo geral →', fazer: mostrarResumo };
  const reabrirEnvio = { texto: minutos > 0 ? `Reabrir respostas (${minutos} min)` : 'Reabrir respostas', fazer: () => atualizar({ envio_aberto: true }, 'Respostas reabertas.') };
  const abrirVotacao = { texto: minVoto > 0 ? `Abrir votação (${minVoto} min)` : 'Abrir votação', fazer: () => atualizar({ votacao_aberta: true }, 'Votação aberta nos celulares.') };
  let principal = null;
  let secundarias = [];
  let cronometroAtivo = null;
  if (resumoNaTela) {
    secundarias = foco ? [{ texto: `Voltar à ${rotulo.toLowerCase()} ${foco.ordem}`, fazer: () => atualizar({ resumo_visivel: false }, 'Telão de volta à problemática.') }] : [];
  } else if (!foco) {
    principal = proxima ? { texto: `Começar: ${rotulo.toLowerCase()} 1 →`, fazer: () => focar(proxima) } : null;
  } else if (sessao.envio_aberto) {
    principal = { texto: 'Encerrar respostas', classe: 'btn-escuro', fazer: () => atualizar({ envio_aberto: false }, 'Respostas encerradas.') };
    cronometroAtivo = html`<span class="ao-vivo-tempo"><${Cronometro} restante=${restante} />${restante > 0 ? html`<button class="link-acao" onClick=${maisUmMinuto}>+1 min</button>` : null}</span>`;
  } else if (sessao.votacao_aberta) {
    principal = { texto: 'Encerrar votação e mostrar top 3', classe: 'btn-escuro', fazer: () => atualizar({ votacao_aberta: false }, 'Votação encerrada.') };
    cronometroAtivo = html`<span class="ao-vivo-tempo"><${Cronometro} restante=${restanteVoto} alerta=${15} />${restanteVoto > 0 ? html`<button class="link-acao" onClick=${maisUmMinuto}>+1 min</button>` : null}</span>`;
  } else if (sessao.resultado_visivel) {
    principal = irProxima;
    secundarias = [{ texto: 'Esconder o top 3', fazer: () => atualizar({ resultado_visivel: false }, 'Top 3 escondido.') }, { texto: 'Reabrir votação', fazer: abrirVotacao.fazer }, reabrirEnvio];
  } else if (votou) {
    principal = { texto: 'Mostrar o top 3', fazer: () => atualizar({ resultado_visivel: true }, 'Top 3 no telão.') };
    secundarias = [{ texto: irProxima.texto.replace(' →', ''), fazer: irProxima.fazer }, { texto: 'Reabrir votação', fazer: abrirVotacao.fazer }, reabrirEnvio];
  } else {
    principal = abrirVotacao;
    secundarias = [{ texto: proxima ? `Pular votação e ir para a ${rotulo.toLowerCase()} ${proxima.ordem}` : 'Pular votação e ver o resumo', fazer: irProxima.fazer }, reabrirEnvio];
  }
  const focar = (a) => atualizar({
    atividade_foco: a.id, envio_aberto: true,
    status: sessao.status === 'rascunho' || sessao.status === 'encerrada' ? 'ao_vivo' : sessao.status,
  }, `${rotulo} ${a.ordem} aberta.`);

  return html`<div class="conduzir">
    <section class="cartao ao-vivo">
      <div class="ao-vivo-topo">
        <div class="ao-vivo-estado">
          <span class="rotulo-campo">${resumoNaTela ? 'No telão agora' : foco ? `${rotulo} ${foco.ordem} de ${atividades.length}` : 'No telão agora'}</span>
          <strong>${resumoNaTela ? 'Resumo geral da dinâmica' : foco ? foco.titulo : sessao.status === 'encerrada' ? 'Sessão encerrada' : 'Tela de entrada com o QR code'}</strong>
        </div>
        <div class="ao-vivo-secundarias">
          ${!resumoNaTela && sessao.status !== 'rascunho' ? html`<button class="link-acao" onClick=${mostrarResumo}>Resumo geral</button>` : null}
          ${foco ? html`<button class="link-acao" title="Volta o telão para a tela de entrada com o QR code"
              onClick=${() => atualizar({ atividade_foco: null, envio_aberto: false, votacao_aberta: false, resultado_visivel: false }, 'Telão na tela de entrada.')}>Mostrar QR code</button>` : null}
          ${sessao.status === 'ao_vivo' ? html`<button class="link-acao perigo" onClick=${() => {
            if (confirm('Encerrar a sessão? Os participantes verão a mensagem de encerramento.')) {
              atualizar({ status: 'encerrada', envio_aberto: false, votacao_aberta: false, atividade_foco: null }, 'Sessão encerrada.');
            }
          }}>Encerrar sessão</button>` : null}
        </div>
      </div>

      ${foco && !resumoNaTela ? html`<ol class="etapas" aria-label="Etapas da ${rotulo.toLowerCase()}">
        ${etapas.map((e, n) => html`<li key=${e.id} class=${`etapa ${e.estado}`}>
          <span class="etapa-marca">${e.estado === 'feita' ? '✓' : n + 1}</span>
          <span class="etapa-nome">${e.nome}</span>
          ${e.info ? html`<span class="etapa-info">${e.info}</span>` : null}
        </li>`)}
      </ol>` : null}

      <div class="ao-vivo-acao">
        ${principal ? html`<button class=${`btn btn-grande-painel ${principal.classe || 'btn-primario'}`} onClick=${principal.fazer}>${principal.texto}</button>` : null}
        ${cronometroAtivo}
        <div class="ao-vivo-links">
          ${secundarias.map((a) => html`<button key=${a.texto} class="link-acao" onClick=${a.fazer}>${a.texto}</button>`)}
        </div>
      </div>

      ${resumoNaTela ? html`<div class="ao-vivo-visao">
        <span class="rotulo-campo">O telão está mostrando</span>
        <div class="segmentos" role="radiogroup" aria-label="Visão do resumo no telão">
          ${[['numeros', 'Em números'], ['prioridades', 'Só as priorizadas']].map(([id, nome]) => html`<button key=${id} role="radio"
            aria-checked=${(sessao.resumo_visao || 'numeros') === id} class=${(sessao.resumo_visao || 'numeros') === id ? 'ativo' : ''}
            onClick=${() => atualizar({ resumo_visao: id }, `Resumo: ${nome.toLowerCase()}.`)}>${nome}</button>`)}
        </div>
      </div>` : foco && etapaAtual === 'respostas' ? html`<div class="ao-vivo-visao">
        <span class="rotulo-campo">${sessao.envio_aberto ? 'Quando fechar, as respostas aparecem como' : 'As respostas estão aparecendo como'}</span>
        <div class="segmentos" role="radiogroup" aria-label="Visualização das respostas no telão">
          ${VISUALIZACOES.map((v) => html`<button key=${v.id} role="radio" aria-checked=${(sessao.visualizacao || 'postits') === v.id}
            class=${(sessao.visualizacao || 'postits') === v.id ? 'ativo' : ''}
            onClick=${() => atualizar({ visualizacao: v.id }, `Telão: ${v.nome.toLowerCase()}.`)}>${v.nome}</button>`)}
        </div>
      </div>` : null}
    </section>

    <div class="conduzir-grade">
      <section class="cartao roteiro">
        <h2>Roteiro <span class="suave">${plural(atividades.length, rotulo.toLowerCase(), rotulo.toLowerCase() + 's')}</span></h2>
        <ol>
          ${atividades.map((a) => {
            const n = daRodada.filter((r) => r.atividade_id === a.id).length;
            const emFoco = a.id === sessao.atividade_foco;
            return html`<li key=${a.id} class=${`roteiro-item ${emFoco ? 'em-foco' : ''} ${vendo?.id === a.id ? 'vendo' : ''}`}>
              <button class="roteiro-ver" onClick=${() => setVer(a.id)}>
                <span class="roteiro-num">${a.ordem}</span>
                <span class="roteiro-titulo">${a.titulo}</span>
                <span class="roteiro-n">${n}</span>
              </button>
              ${emFoco ? html`<span class="roteiro-tag">no telão</span>`
                : html`<button class="btn btn-fantasma btn-pequeno" onClick=${() => focar(a)}>Abrir</button>`}
            </li>`;
          })}
        </ol>
      </section>

      ${vendo ? html`<${Moderacao} key=${vendo.id} sessao=${sessao} atividade=${vendo} etiquetas=${etiquetas}
          respostas=${daRodada} votos=${votos.filter((v) => v.atividade_id === vendo.id)} acao=${acao} emFoco=${vendo.id === sessao.atividade_foco} />` : html`<div></div>`}

      <aside class="cartao acesso">
        <h2>Acesso</h2>
        <div class="acesso-qr"><${QR} texto=${linkParticipante(sessao.codigo)} tamanho=${168} /></div>
        <div class="acesso-codigo">${sessao.codigo}</div>
        <p class="acesso-conectados"><strong>${conectados}</strong> ${conectados === 1 ? 'pessoa conectada' : 'pessoas conectadas'}</p>
        <button class="btn btn-fantasma btn-pequeno btn-bloco" onClick=${async () => acao(async () => {
          if (!(await copiar(linkParticipante(sessao.codigo)))) throw new Error('Não deu para copiar. O link é: ' + linkParticipante(sessao.codigo));
        }, 'Link do participante copiado.')}>Copiar link do participante</button>
        <button class="btn btn-fantasma btn-pequeno btn-bloco" onClick=${async () => acao(async () => {
          if (!(await copiar(linkTelao(sessao.codigo, sessao.chave_telao)))) throw new Error('Não deu para copiar.');
        }, 'Link do telão copiado.')}>Copiar link do telão</button>
        <p class="suave acesso-dica">O link do telão tem uma chave própria. Não compartilhe com a sala.</p>
      </aside>
    </div>
  </div>`;
}

function Moderacao({ sessao, atividade, etiquetas, respostas, votos, acao, emFoco }) {
  const lista = respostas.filter((r) => r.atividade_id === atividade.id);
  const numero = numerarParticipantes(respostas);
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const [filtro, setFiltro] = useState('todas');
  // Votação: contagem por resposta e posição no ranking (só o painel vê)
  const contagem = new Map();
  votos.forEach((v) => contagem.set(v.resposta_id, (contagem.get(v.resposta_id) || 0) + 1));
  const votantes = new Set(votos.map((v) => v.participante_id)).size;
  const temVotos = votos.length > 0;
  const [ordem, setOrdem] = useState(null);
  const ordemAtual = ordem || (temVotos ? 'votos' : 'chegada');
  const ranking = [...lista].filter((r) => contagem.get(r.id)).sort((a, b) => contagem.get(b.id) - contagem.get(a.id));
  const posicao = (r) => {
    const n = contagem.get(r.id) || 0;
    return n ? ranking.filter((x) => contagem.get(x.id) > n).length + 1 : null;
  };
  let filtradas = lista.filter((r) => filtro === 'todas' || (filtro === 'ocultas' ? !r.visivel : r.etiqueta_id === filtro));
  if (ordemAtual === 'votos') filtradas = [...filtradas].sort((a, b) => (contagem.get(b.id) || 0) - (contagem.get(a.id) || 0));

  return html`<section class="cartao moderacao">
    <div class="moderacao-cabeca">
      <div>
        <span class="rotulo-campo">${sessao.rotulo_atividade} ${atividade.ordem}${emFoco ? ' · no telão' : ''}</span>
        <h2>${atividade.titulo}</h2>
        ${atividade.texto_apoio ? html`<p class="suave">${atividade.texto_apoio}</p>` : null}
      </div>
      ${temVotos ? html`<div class="votacao-resumo">
        <span class="rotulo-campo">Votação${emFoco && sessao.votacao_aberta ? ' aberta' : ''}</span>
        <span>${plural(votantes, 'pessoa votou', 'pessoas votaram')} · ${plural(votos.length, 'voto', 'votos')}</span>
        <div class="segmentos segmentos-pequenos" role="radiogroup" aria-label="Ordem das respostas">
          <button role="radio" aria-checked=${ordemAtual === 'votos'} class=${ordemAtual === 'votos' ? 'ativo' : ''} onClick=${() => setOrdem('votos')}>Mais votadas</button>
          <button role="radio" aria-checked=${ordemAtual === 'chegada'} class=${ordemAtual === 'chegada' ? 'ativo' : ''} onClick=${() => setOrdem('chegada')}>Ordem de chegada</button>
        </div>
      </div>` : null}
    </div>
    <div class="filtros">
      <button class=${filtro === 'todas' ? 'ativo' : ''} onClick=${() => setFiltro('todas')}>Todas <b>${lista.length}</b></button>
      ${etiquetas.map((e) => html`<button key=${e.id} class=${filtro === e.id ? 'ativo' : ''} style=${varsEtiqueta(e.cor)} onClick=${() => setFiltro(e.id)}>
        <i class="ponto"></i>${e.nome} <b>${lista.filter((r) => r.etiqueta_id === e.id).length}</b></button>`)}
      <button class=${filtro === 'ocultas' ? 'ativo' : ''} onClick=${() => setFiltro('ocultas')}>Ocultas <b>${lista.filter((r) => !r.visivel).length}</b></button>
    </div>
    ${filtradas.length
      ? html`<ul class="moderacao-lista">${filtradas.map((r) => html`<${ItemModeracao} key=${r.id} r=${r} etiqueta=${etq.get(r.etiqueta_id)} numero=${numero.get(r.participante_id)}
          votos=${temVotos ? contagem.get(r.id) || 0 : null} posicao=${posicao(r)} acao=${acao} />`)}</ul>`
      : html`<p class="vazio">${lista.length ? 'Nada neste filtro.' : emFoco && sessao.envio_aberto ? 'Esperando as primeiras respostas…' : 'Nenhuma resposta ainda.'}</p>`}
  </section>`;
}

function ItemModeracao({ r, etiqueta, numero, votos, posicao, acao }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(r.texto);
  const salvar = async () => {
    const t = texto.trim();
    if (!t || t === r.texto) { setEditando(false); setTexto(r.texto); return; }
    if (await acao(() => backend.atualizarResposta(r, { texto: t, editado: true }), 'Resposta editada.')) setEditando(false);
  };
  return html`<li class=${`moderacao-item ${r.visivel ? '' : 'oculta'} ${posicao && posicao <= 3 ? 'top' : ''}`} style=${varsEtiqueta(etiqueta?.cor)}>
    <div class="moderacao-linha">
      ${editando
        ? html`<textarea class="campo" rows="3" value=${texto} onInput=${(e) => setTexto(e.currentTarget.value)}></textarea>`
        : html`<p>${r.texto}</p>`}
      ${votos !== null ? html`<span class=${`placar ${posicao && posicao <= 3 ? 'placar-top' : ''}`} title="Votos de prioridade">
        ${posicao && posicao <= 3 ? html`<small>${posicao}º</small>` : null}<b>${votos}</b><small>${votos === 1 ? 'voto' : 'votos'}</small></span>` : null}
    </div>
    <div class="moderacao-meta">
      ${etiqueta ? html`<span class="chip">${etiqueta.nome}</span>` : null}
      <span class="suave">Participante ${numero} · ${fmtHora(r.criado_em)}${r.editado ? ' · editada' : ''}${r.visivel ? '' : ' · oculta no telão'}</span>
      <span class="moderacao-acoes">
        ${editando
          ? html`<button onClick=${salvar}>Salvar</button><button onClick=${() => { setEditando(false); setTexto(r.texto); }}>Cancelar</button>`
          : html`
            <button onClick=${() => acao(() => backend.atualizarResposta(r, { visivel: !r.visivel }), r.visivel ? 'Oculta do telão.' : 'De volta ao telão.')}>${r.visivel ? 'Ocultar' : 'Mostrar'}</button>
            <button onClick=${() => setEditando(true)}>Editar</button>
            <button class="perigo" onClick=${() => { if (confirm('Apagar esta resposta? Não dá para desfazer.')) acao(() => backend.excluirResposta(r), 'Resposta apagada.'); }}>Apagar</button>`}
      </span>
    </div>
  </li>`;
}

// ---------------------------------------------------------------- Configurar

// Campo que salva ao sair (blur) e se atualiza com o banco quando não está em edição.
function Campo({ valor, aoSalvar, tipo = 'text', multilinha = false, ...resto }) {
  const [v, setV] = useState(valor ?? '');
  const editando = useRef(false);
  useEffect(() => { if (!editando.current) setV(valor ?? ''); }, [valor]);
  const salvar = async (novo = v) => {
    editando.current = false;
    if (String(valor ?? '') === String(novo)) return;
    const ok = await aoSalvar(novo);
    if (ok === false) setV(valor ?? '');
  };
  const props = {
    class: 'campo',
    value: v,
    onFocus: () => { editando.current = true; },
    onInput: (e) => { editando.current = true; setV(e.currentTarget.value); },
    onBlur: () => salvar(),
    ...resto,
  };
  if (tipo === 'color') {
    return html`<input type="color" ...${props} class="campo-cor" onBlur=${undefined} onChange=${(e) => salvar(e.currentTarget.value)} />`;
  }
  return multilinha ? html`<textarea ...${props}></textarea>` : html`<input type=${tipo} ...${props} />`;
}

function Configurar({ dados, acao }) {
  const { sessao, atividades, etiquetas, respostas } = dados;
  const visual = { ...VISUAL_PADRAO, ...(sessao.visual || {}) };
  const salvarSessao = (patch, ok = 'Salvo.') => acao(() => backend.atualizarSessao(sessao.id, patch), ok);
  const salvarVisual = (k, v) => salvarSessao({ visual: { ...visual, [k]: v } });
  const rotulo = sessao.rotulo_atividade;

  const mover = (a, d) => {
    const b = atividades.find((x) => x.ordem === a.ordem + d);
    if (!b) return;
    acao(async () => {
      await backend.salvarAtividade({ id: a.id, sessao_id: a.sessao_id, ordem: b.ordem });
      await backend.salvarAtividade({ id: b.id, sessao_id: b.sessao_id, ordem: a.ordem });
    });
  };
  const excluirAtividade = (a) => {
    const n = respostas.filter((r) => r.atividade_id === a.id).length;
    if (!confirm(`Excluir “${a.titulo}”?${n ? `\n\nAs ${n} respostas dela também serão apagadas.` : ''}`)) return;
    acao(() => backend.excluirAtividade(a), `${rotulo} excluída.`);
  };
  const novaAtividade = () => {
    const ordem = (atividades.at(-1)?.ordem || 0) + 1;
    acao(() => backend.salvarAtividade({ sessao_id: sessao.id, ordem, formato: 'mural', titulo: `${rotulo} ${ordem}`, texto_apoio: '' }), `${rotulo} adicionada.`);
  };
  const novaEtiqueta = () => {
    const ordem = (etiquetas.at(-1)?.ordem || 0) + 1;
    acao(() => backend.salvarEtiqueta({ sessao_id: sessao.id, ordem, nome: `Etiqueta ${ordem}`, cor: CORES_ETIQUETA[(ordem - 1) % CORES_ETIQUETA.length] }), 'Etiqueta adicionada.');
  };

  return html`<div class="configurar">
    <section class="cartao">
      <h2>Sessão</h2>
      <div class="linha-campos">
        <label class="grupo-campo"><span class="rotulo-campo">Nome</span>
          <${Campo} valor=${sessao.nome} aoSalvar=${(v) => salvarSessao({ nome: v.trim() || sessao.nome })} /></label>
        <label class="grupo-campo"><span class="rotulo-campo">Cliente</span>
          <${Campo} valor=${sessao.cliente} aoSalvar=${(v) => salvarSessao({ cliente: v.trim() })} /></label>
        <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Data</span>
          <${Campo} tipo="date" valor=${sessao.data || ''} aoSalvar=${(v) => salvarSessao({ data: v || null })} /></label>
      </div>
      <div class="linha-campos">
        <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Código de acesso</span>
          <${Campo} valor=${sessao.codigo} maxlength="10" aoSalvar=${(v) => salvarSessao({ codigo: v }, 'Código alterado. Atualize o QR code nos slides.')} /></label>
        <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Nome das atividades</span>
          <${Campo} valor=${rotulo} aoSalvar=${(v) => salvarSessao({ rotulo_atividade: v.trim() || 'Pergunta' })} /></label>
        <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Limite de caracteres</span>
          <${Campo} tipo="number" min="20" max="1000" valor=${sessao.limite_caracteres}
            aoSalvar=${(v) => salvarSessao({ limite_caracteres: Math.min(1000, Math.max(20, parseInt(v, 10) || 200)) })} /></label>
        <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Tempo para responder (min)</span>
          <${Campo} tipo="number" min="0" max="60" valor=${Math.round((sessao.tempo_resposta_seg ?? 480) / 60)}
            aoSalvar=${(v) => salvarSessao({ tempo_resposta_seg: Math.min(60, Math.max(0, parseInt(v, 10) || 0)) * 60 }, 'Tempo salvo. Vale a partir da próxima pergunta aberta.')} />
          <span class="dica-campo">0 = sem cronômetro</span></label>
        <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Tempo para votar (min)</span>
          <${Campo} tipo="number" min="0" max="30" valor=${Math.round((sessao.tempo_votacao_seg ?? 60) / 60)}
            aoSalvar=${(v) => salvarSessao({ tempo_votacao_seg: Math.min(30, Math.max(0, parseInt(v, 10) || 0)) * 60 }, 'Tempo de votação salvo. Vale a partir da próxima votação.')} />
          <span class="dica-campo">0 = sem cronômetro</span></label>
      </div>
    </section>

    <section class="cartao">
      <h2>Visual do cliente</h2>
      <div class="visual-grade">
        <div class="linha-campos">
          <label class="grupo-campo grupo-cor"><span class="rotulo-campo">Cor principal</span>
            <${Campo} tipo="color" valor=${visual.primaria} aoSalvar=${(v) => salvarVisual('primaria', v)} /></label>
          <label class="grupo-campo grupo-cor"><span class="rotulo-campo">Cor escura</span>
            <${Campo} tipo="color" valor=${visual.escura} aoSalvar=${(v) => salvarVisual('escura', v)} /></label>
          <label class="grupo-campo grupo-cor"><span class="rotulo-campo">Fundo</span>
            <${Campo} tipo="color" valor=${visual.fundo} aoSalvar=${(v) => salvarVisual('fundo', v)} /></label>
          <label class="grupo-campo"><span class="rotulo-campo">Endereço do logo (imagem PNG ou SVG)</span>
            <${Campo} tipo="url" placeholder="https://…" valor=${visual.logo_url} aoSalvar=${(v) => salvarVisual('logo_url', v.trim())} /></label>
        </div>
        <div class="previa tema" style=${varsVisual(visual)}>
          <div class="previa-rotulo">${rotulo} 1</div>
          <div class="previa-titulo">${atividades[0]?.titulo || 'Pergunta'}</div>
          <div class="previa-cartoes">
            ${etiquetas.slice(0, 3).map((e) => html`<div key=${e.id} class="cartao-postit" style=${varsEtiqueta(e.cor)}><p>Uma ideia de exemplo</p><span class="cartao-etiqueta">${e.nome}</span></div>`)}
          </div>
          <div class="previa-botao">Enviar</div>
        </div>
      </div>
    </section>

    <section class="cartao">
      <div class="cartao-cabeca">
        <h2>${rotulo}s <span class="suave">na ordem da dinâmica</span></h2>
        <button class="btn btn-fantasma btn-pequeno" onClick=${novaAtividade}>Adicionar</button>
      </div>
      <ol class="lista-atividades">
        ${atividades.map((a, i) => html`<li key=${a.id} class="atividade-edicao">
          <span class="roteiro-num">${a.ordem}</span>
          <div class="atividade-campos">
            <${Campo} valor=${a.titulo} placeholder="Título (aparece grande no telão)"
              aoSalvar=${(v) => acao(() => backend.salvarAtividade({ id: a.id, sessao_id: a.sessao_id, titulo: v.trim() || a.titulo }), 'Salvo.')} />
            <${Campo} multilinha=${true} rows="2" valor=${a.texto_apoio} placeholder="Pergunta ou texto de apoio"
              aoSalvar=${(v) => acao(() => backend.salvarAtividade({ id: a.id, sessao_id: a.sessao_id, texto_apoio: v.trim() }), 'Salvo.')} />
          </div>
          <div class="atividade-botoes">
            <button class="icone" title="Subir" aria-label="Subir" disabled=${i === 0} onClick=${() => mover(a, -1)}>↑</button>
            <button class="icone" title="Descer" aria-label="Descer" disabled=${i === atividades.length - 1} onClick=${() => mover(a, 1)}>↓</button>
            <button class="icone perigo" title="Excluir" aria-label="Excluir" onClick=${() => excluirAtividade(a)}>×</button>
          </div>
        </li>`)}
      </ol>
    </section>

    <section class="cartao">
      <div class="cartao-cabeca">
        <h2>Etiquetas <span class="suave">o participante escolhe uma em cada resposta</span></h2>
        <button class="btn btn-fantasma btn-pequeno" onClick=${novaEtiqueta}>Adicionar</button>
      </div>
      <ul class="lista-etiquetas">
        ${etiquetas.map((e) => html`<li key=${e.id} class="etiqueta-edicao">
          <${Campo} tipo="color" valor=${e.cor} aoSalvar=${(v) => acao(() => backend.salvarEtiqueta({ id: e.id, sessao_id: e.sessao_id, cor: v }), 'Salvo.')} />
          <${Campo} valor=${e.nome} aoSalvar=${(v) => acao(() => backend.salvarEtiqueta({ id: e.id, sessao_id: e.sessao_id, nome: v.trim() || e.nome }), 'Salvo.')} />
          <button class="icone perigo" title="Excluir" aria-label="Excluir etiqueta" onClick=${() => {
            if (confirm(`Excluir a etiqueta “${e.nome}”? As respostas marcadas com ela ficam sem etiqueta.`)) acao(() => backend.excluirEtiqueta(e), 'Etiqueta excluída.');
          }}>×</button>
        </li>`)}
      </ul>
      ${!etiquetas.length ? html`<p class="suave">Sem etiquetas, o participante só escreve e envia.</p>` : null}
    </section>

    <section class="cartao">
      <h2>Modo e arquivo</h2>
      <label class="alternar">
        <input type="checkbox" checked=${sessao.modo_teste} onChange=${(e) => salvarSessao({ modo_teste: e.currentTarget.checked }, e.currentTarget.checked ? 'Modo ensaio ligado.' : 'Modo ensaio desligado.')} />
        <span><strong>Modo ensaio</strong><br /><span class="suave">Respostas enviadas agora ficam marcadas como teste e podem ser limpas antes do dia.</span></span>
      </label>
      <div class="acoes acoes-esquerda">
        ${sessao.status === 'arquivada'
          ? html`<button class="btn btn-fantasma" onClick=${() => salvarSessao({ status: 'encerrada' }, 'Sessão desarquivada.')}>Desarquivar</button>`
          : html`<button class="btn btn-fantasma" onClick=${() => salvarSessao({ status: 'arquivada', envio_aberto: false, atividade_foco: null }, 'Sessão arquivada. O código deixa de funcionar para os participantes.')}>Arquivar sessão</button>`}
        <button class="btn btn-fantasma perigo" onClick=${() => {
          if (confirm(`Excluir a sessão “${sessao.nome}” e todas as ${respostas.length} respostas? Não dá para desfazer.`)) {
            acao(() => backend.excluirSessao(sessao.id)).then((ok) => { if (ok) location.hash = '#/painel'; });
          }
        }}>Excluir sessão</button>
      </div>
    </section>
  </div>`;
}

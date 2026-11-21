import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { backend } from '../backend/index.js';
import { useAoVivo } from '../lib/aoVivo.js';
import { idParticipante, guardar, fmtHora, plural } from '../lib/util.js';
import { varsVisual, varsEtiqueta } from '../lib/visual.js';
import { Assinatura, Carregando, MarcaCliente } from './comum.js';
import { useDesvio, useRestante, envioAberto, fmtTempo, prazoFinal } from '../lib/cronometro.js';

// Ilustrações da espera entre uma pergunta e outra, alternando menina, cachorro e menino.
const ILUSTRACOES = {
  // a turma reunida (menino, cachorro e menina) fecha o ciclo no lugar da 4ª menina
  menina: ['menina-celular', 'menina-cadeira', 'menina-notebook', 'turma-reunida'],
  cachorro: ['cachorro-sentado', 'cachorro-brincando', 'cachorro-dormindo', 'menino-cachorro'],
  menino: ['menino-cafe', 'menino-lendo', 'menino-pufe'],
};
const SEQUENCIA = ['menina', 'cachorro', 'menino'];
function ilustracao(ordem) {
  const n = Math.max(0, (ordem || 1) - 1);
  const grupo = ILUSTRACOES[SEQUENCIA[n % 3]];
  return `assets/ilustracoes/${grupo[Math.floor(n / 3) % grupo.length]}.png?v=3`;
}

// Novas respostas dos outros não mudam a tela do participante: só ouve
// mudanças de sessão, atividades e etiquetas (poupa a rede da sala).
const soEstrutura = (ev) => ev.tabela !== 'respostas' && ev.tabela !== 'votos';
const MAX_VOTOS = 3;

export function Participante({ codigo }) {
  const pid = useMemo(() => idParticipante(codigo), [codigo]);
  const { dados, erro, recarregar } = useAoVivo(() => backend.entrar(codigo, pid), [codigo], { intervalo: 10000, filtro: soEstrutura });
  const desvio = useDesvio(dados?.agora);
  const restante = useRestante(dados?.sessao?.envio_aberto ? dados.sessao.envio_prazo : null, desvio);
  const restanteFinal = useRestante(dados?.sessao?.envio_aberto ? prazoFinal(dados.sessao.envio_prazo) : null, desvio);
  const restanteVoto = useRestante(dados?.sessao?.votacao_aberta ? dados.sessao.votacao_prazo : null, desvio);

  if (dados === undefined && !erro) return html`<main class="tema participante" style=${varsVisual()}><${Carregando} /></main>`;
  if (dados === undefined && erro) {
    return html`<main class="tema participante" style=${varsVisual()}>
      <div class="participante-miolo centro">
        <h1>Sem conexão</h1>
        <p class="suave">Não conseguimos falar com a dinâmica. Confira a internet do celular.</p>
        <button class="btn btn-primario" onClick=${recarregar}>Tentar de novo</button>
      </div></main>`;
  }
  if (dados === null) {
    return html`<main class="tema participante" style=${varsVisual()}>
      <div class="participante-miolo centro">
        <h1>Sessão não encontrada</h1>
        <p class="suave">Aponte a câmera do celular para o QR code que está no telão.</p>
      </div><${Assinatura} /></main>`;
  }

  const { sessao, atividades, etiquetas, minhas } = dados;
  const foco = atividades.find((a) => a.id === sessao.atividade_foco);
  // sessão encerrada ou resumo geral no telão: o celular agradece e encerra
  const encerrada = sessao.status === 'encerrada' || Boolean(sessao.resumo_visivel);

  return html`<main class="tema participante" style=${varsVisual(sessao.visual)}>
    <header class="participante-topo">
      <${MarcaCliente} sessao=${sessao} />
      <span class="participante-sessao">${sessao.nome}</span>
    </header>
    ${erro ? html`<div class="faixa-alerta">Conexão instável. Tentando de novo…</div>` : null}
    <div class="participante-miolo">
      ${foco && !encerrada ? html`<${Andamento} atividades=${atividades} foco=${foco}
        concluida=${!envioAberto(sessao, restante) && !(sessao.envio_aberto && restanteFinal > 0)} />` : null}
      ${encerrada
        ? html`<${Espera} titulo="A dinâmica terminou" texto="Obrigado pela participação!" />`
        : !foco
          ? html`<${Espera} titulo="Você está dentro" texto="Aguarde: a próxima pergunta vai aparecer aqui." />`
          : sessao.resultado_visivel && (dados.top || []).length
          ? html`<${PrioridadesSala} key=${foco.id} top=${dados.top || []} etiquetas=${etiquetas} />`
          : sessao.votacao_aberta && restanteVoto === 0
          ? html`<${Encerrado} titulo="Votação encerrada!" texto="Obrigado! Acompanhe a conversa no telão." ordem=${foco.ordem} />`
          : sessao.votacao_aberta
          ? html`<${Votacao} key=${foco.id} foco=${foco} opcoes=${dados.opcoes || []} meusVotos=${dados.meus_votos || []}
              etiquetas=${etiquetas} pid=${pid} codigo=${codigo} aoVotar=${recarregar}
              restante=${restanteVoto} total=${sessao.tempo_votacao_seg ?? 60} />`
          : html`<${Envio} key=${foco.id} sessao=${sessao} foco=${foco} total=${atividades.length}
              etiquetas=${etiquetas} pid=${pid} codigo=${codigo} aoEnviar=${recarregar} restante=${restante} restanteFinal=${restanteFinal}
              minhas=${minhas.filter((r) => r.atividade_id === foco.id)} />`}
      ${minhas.length && (!foco || encerrada) ? html`<${Historico} minhas=${minhas} atividades=${atividades} etiquetas=${etiquetas} rotulo=${sessao.rotulo_atividade} />` : null}
    </div>
    <${Assinatura} />
  </main>`;
}

function Espera({ titulo, texto }) {
  return html`<section class="espera">
    <img class="espera-ilustracao" src="assets/ilustracoes/cachorro-acenando.png?v=3" alt="" width="220" height="220" />
    <h1>${titulo}</h1>
    <p class="suave">${texto}</p>
  </section>`;
}

function Envio({ sessao, foco, total, etiquetas, pid, codigo, minhas, aoEnviar, restante, restanteFinal }) {
  const aberto = envioAberto(sessao, restante);
  const chaveEtq = `oo-dinamica-etiqueta-${codigo}`;
  // Rascunho guardado no celular: não some se a página recarregar ou o tempo acabar.
  const chaveRascunho = `oo-dinamica-rascunho-${codigo}-${foco.id}`;
  const [texto, setTexto] = useState(() => guardar.ler(chaveRascunho) || '');
  useEffect(() => { guardar.gravar(chaveRascunho, texto); }, [texto]);
  const [etiqueta, setEtiqueta] = useState(() => {
    const salva = guardar.ler(chaveEtq);
    return etiquetas.some((e) => e.id === salva) ? salva : null;
  });
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const campo = useRef(null);
  const limite = sessao.limite_caracteres;
  const resta = limite - texto.trim().length;
  const precisaEtiqueta = etiquetas.length > 0;
  // O cronômetro zerou, mas quem já tinha começado a escrever ainda pode enviar por alguns segundos.
  const terminando = !aberto && sessao.envio_aberto && restante === 0 && restanteFinal > 0 && texto.trim().length > 0;
  const podeEnviar = aberto || terminando;
  const pronto = texto.trim().length > 0 && resta >= 0 && (!precisaEtiqueta || etiqueta) && podeEnviar;

  useEffect(() => {
    if (!aviso || aviso.tipo !== 'ok') return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const escolher = (id) => { setEtiqueta(id); guardar.gravar(chaveEtq, id); };

  const enviar = async (e) => {
    e.preventDefault();
    if (!pronto || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      await backend.enviar({ codigo, participanteId: pid, atividadeId: foco.id, etiquetaId: etiqueta, texto });
      setTexto('');
      setAviso({ tipo: 'ok', texto: 'Enviado! Pode mandar outra ideia.' });
      aoEnviar();
      campo.current?.focus();
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message || 'Não foi possível enviar. Tente de novo.' });
    } finally {
      setEnviando(false);
    }
  };

  return html`<section class="envio">
    ${aberto && restante !== null ? html`<${TempoCelular} restante=${restante} total=${sessao.tempo_resposta_seg} />` : null}
    ${terminando ? html`<div class="tempo-celular tempo-fim tempo-tolerancia" role="timer">
      <div class="tempo-linha">
        <span class="tempo-rotulo">O tempo acabou. Envie o que já escreveu</span>
        <span class="tempo-numero">${fmtTempo(restanteFinal)}</span>
      </div>
    </div>` : null}
    ${podeEnviar ? html`<h1 class="envio-titulo">${foco.titulo}</h1>` : null}
    ${podeEnviar && foco.texto_apoio ? html`<p class="envio-apoio">${foco.texto_apoio}</p>` : null}

    ${podeEnviar
      ? html`<form class="envio-form" onSubmit=${enviar}>
          <label class="rotulo-campo" for="resposta">Sua resposta</label>
          <textarea id="resposta" ref=${campo} class="campo campo-texto" rows="4" value=${texto}
            placeholder="Uma ideia por envio. Você pode mandar quantas quiser."
            onInput=${(e) => setTexto(e.currentTarget.value)}></textarea>
          <div class=${`contador ${resta < 0 ? 'contador-estourou' : resta < 20 ? 'contador-quase' : ''}`}>
            ${resta >= 0 ? plural(resta, 'caractere restante', 'caracteres restantes') : `${-resta} acima do limite`}
          </div>
          ${precisaEtiqueta ? html`<fieldset class="etiquetas-escolha">
            <legend class="rotulo-campo">Onde isso se resolve?</legend>
            <div class="etiquetas-opcoes">
              ${etiquetas.map((et) => html`<label key=${et.id} class=${`etiqueta-opcao ${etiqueta === et.id ? 'marcada' : ''}`} style=${varsEtiqueta(et.cor)}>
                <input type="radio" name="etiqueta" value=${et.id} checked=${etiqueta === et.id} onChange=${() => escolher(et.id)} />
                <span>${et.nome}</span>
              </label>`)}
            </div>
          </fieldset>` : null}
          <button class="btn btn-escuro btn-grande" disabled=${!pronto || enviando}>
            ${enviando ? 'Enviando…' : 'Enviar'}
          </button>
          ${aviso ? html`<p class=${`aviso aviso-${aviso.tipo}`} role="status">${aviso.texto}</p>` : null}
        </form>`
      : html`<div class="envio-fechado">
          <h2 class="fechado-titulo">Envio encerrado!</h2>
          <img class="fechado-ilustracao" src=${ilustracao(foco.ordem)} alt="" width="260" height="260" />
          <p class="fechado-texto">${restante === 0 ? 'O tempo acabou. ' : ''}Acompanhe a conversa no telão. A próxima pergunta aparece aqui.</p>
          ${texto.trim() ? html`<div class="rascunho">
            <span class="rotulo-campo">Seu texto não foi enviado</span>
            <p>${texto}</p>
          </div>` : null}
        </div>`}

    ${minhas.length ? html`<div class="minhas">
      <h2>Você enviou ${plural(minhas.length, 'resposta', 'respostas')} aqui</h2>
      <ul>${minhas.map((r) => html`<${ItemMinha} key=${r.id} r=${r} etiquetas=${etiquetas} />`)}</ul>
    </div>` : null}
  </section>`;
}

function ItemMinha({ r, etiquetas }) {
  const et = etiquetas.find((e) => e.id === r.etiqueta_id);
  return html`<li class="minha">
    <p>${r.texto}</p>
    <div class="minha-meta">
      ${et ? html`<span class="chip" style=${varsEtiqueta(et.cor)}>${et.nome}</span>` : null}
      <span class="suave">${fmtHora(r.criado_em)}</span>
    </div>
  </li>`;
}

function Historico({ minhas, atividades, etiquetas, rotulo }) {
  const grupos = atividades.map((a) => ({ a, rs: minhas.filter((r) => r.atividade_id === a.id) })).filter((g) => g.rs.length);
  return html`<details class="historico">
    <summary>Suas respostas (${minhas.length})</summary>
    ${grupos.map(({ a, rs }) => html`<div key=${a.id} class="historico-grupo">
      <h3>${rotulo} ${a.ordem}: ${a.titulo}</h3>
      <ul>${rs.map((r) => html`<${ItemMinha} key=${r.id} r=${r} etiquetas=${etiquetas} />`)}</ul>
    </div>`)}
  </details>`;
}

// Barra de tempo do celular: fixa no topo enquanto a pessoa escreve.
function TempoCelular({ restante, total, rotulo = 'Tempo para responder', alerta = 60, rotuloFim = 'Último minuto' }) {
  const maximo = Math.max(total ?? 480, restante, 1);
  const pct = Math.max(0, Math.min(100, (restante / maximo) * 100));
  const fim = restante <= alerta;
  return html`<div class=${`tempo-celular ${fim ? 'tempo-fim' : ''}`} role="timer" aria-label=${`Tempo restante ${fmtTempo(restante)}`}>
    <div class="tempo-linha">
      <span class="tempo-rotulo">${fim ? rotuloFim : rotulo}</span>
      <span class="tempo-numero">${fmtTempo(restante)}</span>
    </div>
    <div class="tempo-barra"><i style=${{ width: `${pct}%` }}></i></div>
  </div>`;
}

// Andamento da dinâmica: um trecho por pergunta, preenchendo conforme a sala avança.
function Andamento({ atividades, foco, concluida }) {
  const lista = [...atividades].sort((a, b) => a.ordem - b.ordem);
  return html`<div class="andamento" role="progressbar" aria-valuemin="0" aria-valuemax=${lista.length}
      aria-valuenow=${foco.ordem} aria-label=${`Pergunta ${foco.ordem} de ${lista.length}`}>
    <div class="andamento-trilho" style=${{ gridTemplateColumns: `repeat(${lista.length}, minmax(0, 1fr))` }}>
      ${lista.map((a) => {
        const estado = a.ordem < foco.ordem || (a.ordem === foco.ordem && concluida) ? 'feita' : a.ordem === foco.ordem ? 'atual' : 'proxima';
        return html`<i key=${a.id} class=${`andamento-trecho ${estado}`}></i>`;
      })}
    </div>
    <span class="andamento-n">${foco.ordem}/${lista.length}</span>
  </div>`;
}

// ---------- Votação de prioridades ----------

// Ordem embaralhada e estável por pessoa, para a posição na lista não influenciar o voto.
function embaralhar(lista, semente) {
  const peso = (id) => {
    let h = 2166136261;
    for (const c of semente + id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  return [...lista].sort((a, b) => peso(a.id) - peso(b.id));
}

function Votacao({ foco, opcoes, meusVotos, etiquetas, pid, codigo, aoVotar, restante, total }) {
  const tempo = restante !== null ? html`<${TempoCelular} restante=${restante} total=${total} rotulo="Tempo para votar" alerta=${15} rotuloFim="Últimos segundos" />` : null;
  const [escolhidas, setEscolhidas] = useState(meusVotos);
  const [editando, setEditando] = useState(meusVotos.length === 0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const lista = useMemo(() => embaralhar(opcoes, pid), [opcoes.map((o) => o.id).join(), pid]);
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const cheias = escolhidas.length >= MAX_VOTOS;

  // se uma ideia escolhida sair da lista (moderação), ela deixa de contar
  useEffect(() => {
    const ids = new Set(opcoes.map((o) => o.id));
    setEscolhidas((atual) => atual.filter((id) => ids.has(id)));
  }, [opcoes.map((o) => o.id).join()]);

  const alternar = (id) => {
    setErro(null);
    setEscolhidas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : atual.length < MAX_VOTOS ? [...atual, id] : atual));
  };
  const confirmar = async () => {
    if (!escolhidas.length || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await backend.votar({ codigo, participanteId: pid, atividadeId: foco.id, respostaIds: escolhidas });
      setEditando(false);
      aoVotar();
    } catch (e) {
      setErro(e.message || 'Não foi possível registrar os votos. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  if (!editando) {
    const minhas = lista.filter((o) => escolhidas.includes(o.id));
    return html`<section class="envio-fechado votos-ok">
      ${tempo}
      <h2 class="fechado-titulo">Votos registrados!</h2>
      <img class="fechado-ilustracao" src=${ilustracao(foco.ordem)} alt="" width="260" height="260" />
      <p class="fechado-texto">Obrigado! Dá para mudar seus votos até a votação fechar.</p>
      <div class="rascunho">
        <span class="rotulo-campo">Suas prioridades</span>
        <ul class="votos-meus">${minhas.map((o) => html`<li key=${o.id}>${o.texto}</li>`)}</ul>
      </div>
      <button class="btn btn-fantasma" onClick=${() => setEditando(true)}>Mudar meus votos</button>
    </section>`;
  }

  return html`<section class="votacao">
    ${tempo}
    <h1 class="envio-titulo">${foco.titulo}</h1>
    <p class="votacao-instrucao">Escolha até ${MAX_VOTOS} ideias que devem ser prioridade.</p>
    ${lista.length
      ? html`<ul class="opcoes-voto">
          ${lista.map((o) => {
            const pos = escolhidas.indexOf(o.id);
            const marcada = pos >= 0;
            const e = etq.get(o.etiqueta_id);
            return html`<li key=${o.id}>
              <button type="button" class=${`opcao-voto ${marcada ? 'marcada' : ''}`} aria-pressed=${marcada}
                disabled=${!marcada && cheias} onClick=${() => alternar(o.id)}>
                <span class="opcao-marca" aria-hidden="true">${marcada ? pos + 1 : ''}</span>
                <span class="opcao-corpo">
                  <span class="opcao-texto">${o.texto}</span>
                  ${e ? html`<span class="chip" style=${varsEtiqueta(e.cor)}>${e.nome}</span>` : null}
                </span>
              </button>
            </li>`;
          })}
        </ul>`
      : html`<p class="vazio">Nenhuma ideia para votar nesta pergunta.</p>`}
    <div class="votacao-barra">
      ${erro ? html`<p class="aviso aviso-erro">${erro}</p>` : null}
      <div class="votacao-barra-linha">
        <span class="votacao-contagem">${escolhidas.length} de ${MAX_VOTOS}</span>
        <button class="btn btn-escuro" disabled=${!escolhidas.length || enviando} onClick=${confirmar}>
          ${enviando ? 'Registrando…' : 'Confirmar votos'}
        </button>
      </div>
    </div>
  </section>`;
}

// As 3 mais votadas, quando o facilitador revela o resultado.
function PrioridadesSala({ top, etiquetas }) {
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  return html`<section class="prioridades-sala">
    <h2 class="fechado-titulo">As prioridades da sala</h2>
    <p class="fechado-texto">As ideias mais votadas nesta rodada.</p>
    <ol class="prioridades-lista">
      ${top.map((r) => {
        const e = etq.get(r.etiqueta_id);
        return html`<li key=${r.id} class=${`prioridade-celular p${r.posicao}`} style=${varsEtiqueta(e?.cor)}>
          <span class="prioridade-posicao">${r.posicao}º</span>
          <div class="opcao-corpo">
            <span class="opcao-texto">${r.texto}</span>
            <span class="prioridade-meta">
              ${e ? html`<span class="chip">${e.nome}</span>` : null}
              <span class="suave">${r.votos} ${r.votos === 1 ? 'voto' : 'votos'}</span>
            </span>
          </div>
        </li>`;
      })}
    </ol>
  </section>`;
}

// Tela de espera depois de uma etapa (envio ou votação), com a ilustração da rodada.
function Encerrado({ titulo, texto, ordem }) {
  return html`<section class="envio-fechado">
    <h2 class="fechado-titulo">${titulo}</h2>
    <img class="fechado-ilustracao" src=${ilustracao(ordem)} alt="" width="260" height="260" />
    <p class="fechado-texto">${texto}</p>
  </section>`;
}

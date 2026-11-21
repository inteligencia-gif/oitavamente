// MODO DEMONSTRAÇÃO: os dados ficam no localStorage deste navegador e as abas
// avisam umas às outras por BroadcastChannel. Imita as regras do Supabase
// (supabase/migrations/001_dinamica.sql) para o ensaio se comportar igual.
import { uid, gerarCodigo, normalizarCodigo, TOLERANCIA_MS, TOLERANCIA_VOTO_MS } from '../lib/util.js';
import { MODELOS, CORES_ETIQUETA } from '../lib/modelos.js';

const CHAVE = 'oo-dinamica-demo-v3';
const ONLINE_MS = 45_000;
const canal = 'BroadcastChannel' in globalThis ? new BroadcastChannel('oo-dinamica') : null;
const ouvintes = new Map();

function disparar(sessaoId, tabela) {
  ouvintes.get(sessaoId)?.forEach((cb) => cb({ tabela }));
}
if (canal) canal.onmessage = (e) => disparar(e.data.sessaoId, e.data.tabela);
function avisar(sessaoId, tabela) {
  canal?.postMessage({ sessaoId, tabela });
  disparar(sessaoId, tabela);
}

let memoria = null;
function ler() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s) { s.votos ||= []; return s; }
  } catch { /* sem armazenamento */ }
  return memoria || { sessoes: [], atividades: [], etiquetas: [], participantes: [], respostas: [], votos: [] };
}
function gravar(db) {
  // como no banco: voto de resposta apagada some junto (on delete cascade)
  const existe = new Set(db.respostas.map((r) => r.id));
  db.votos = (db.votos || []).filter((v) => existe.has(v.resposta_id));
  memoria = db;
  try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* fica só na memória */ }
}
const agora = () => new Date().toISOString();
const espera = () => new Promise((r) => setTimeout(r, 60)); // simula rede

const PUBLICOS = ['id', 'nome', 'cliente', 'codigo', 'visual', 'status', 'atividade_foco', 'envio_aberto', 'envio_prazo', 'tempo_resposta_seg', 'visualizacao', 'votacao_aberta', 'votacao_prazo', 'tempo_votacao_seg', 'resultado_visivel', 'resumo_visivel', 'resumo_visao', 'limite_caracteres', 'rotulo_atividade'];
export const MAX_VOTOS = 3;
const TEMPO_PADRAO = 480; // 8 minutos
// passou do prazo e da tolerância de quem ainda estava escrevendo
const esgotado = (s) => Boolean(s.envio_prazo) && Date.now() >= Date.parse(s.envio_prazo) + TOLERANCIA_MS;
const temVotos = (db, s) => db.votos.some((v) => v.atividade_id === s.atividade_foco);
// O top 3 aparece quando o facilitador revela ou assim que o tempo da votação acaba
// (mesmo que o painel ainda não tenha fechado a votação), desde que alguém tenha votado.
const resultadoAtivo = (db, s) => Boolean(s.resultado_visivel
  || (s.votacao_aberta && s.votacao_prazo && Date.now() >= Date.parse(s.votacao_prazo) && temVotos(db, s)));
const publicaDe = (db, s) => ({ ...Object.fromEntries(PUBLICOS.map((k) => [k, s[k]])), resultado_visivel: resultadoAtivo(db, s) });

// As mais votadas da pergunta em foco: posição 1 a 3, com empates (1, 2, 2, 4…).
function topPrioridades(db, s, atividadeId = s.atividade_foco) {
  const validas = db.respostas.filter((r) => r.atividade_id === atividadeId && r.visivel && r.teste === s.modo_teste);
  const n = new Map();
  db.votos.forEach((v) => { if (v.atividade_id === atividadeId) n.set(v.resposta_id, (n.get(v.resposta_id) || 0) + 1); });
  const votadas = validas.filter((r) => n.get(r.id)).sort((a, b) => n.get(b.id) - n.get(a.id) || a.texto.localeCompare(b.texto, 'pt-BR'));
  return votadas
    .map((r) => ({ id: r.id, texto: r.texto, etiqueta_id: r.etiqueta_id, votos: n.get(r.id), posicao: votadas.filter((x) => n.get(x.id) > n.get(r.id)).length + 1 }))
    .filter((r) => r.posicao <= 3);
}
const porOrdem = (a, b) => a.ordem - b.ordem;

// Números da sessão para o resumo geral (sem ensaio fora do ensaio, sem respostas ocultas).
function resumo(db, s) {
  const r = db.respostas.filter((x) => x.sessao_id === s.id && x.visivel && x.teste === s.modo_teste);
  const ids = new Set(r.map((x) => x.id));
  const v = db.votos.filter((x) => ids.has(x.resposta_id));
  return {
    respostas: r.length,
    pessoas: new Set([...r.map((x) => x.participante_id), ...v.map((x) => x.participante_id)]).size,
    votos: v.length,
    votantes: new Set(v.map((x) => x.participante_id)).size,
    por_etiqueta: db.etiquetas.filter((e) => e.sessao_id === s.id).sort(porOrdem)
      .map((e) => ({ etiqueta_id: e.id, n: r.filter((x) => x.etiqueta_id === e.id).length })),
    por_atividade: db.atividades.filter((a) => a.sessao_id === s.id).sort(porOrdem).map((a) => ({
      atividade_id: a.id,
      n: r.filter((x) => x.atividade_id === a.id).length,
      votos: v.filter((x) => x.atividade_id === a.id).length,
      top: topPrioridades(db, s, a.id),
    })),
  };
}
const conectados = (db, sessaoId) => {
  const limite = Date.now() - ONLINE_MS;
  return db.participantes.filter((p) => p.sessao_id === sessaoId && Date.parse(p.visto_em) > limite).length;
};

function novaSessao(db, dados) {
  const m = MODELOS[dados.modelo] || MODELOS.branco;
  let codigo = normalizarCodigo(dados.codigo) || gerarCodigo();
  while (db.sessoes.some((s) => s.codigo === codigo)) codigo = gerarCodigo();
  const s = {
    id: uid(),
    nome: dados.nome || m.nome,
    cliente: dados.cliente ?? m.cliente,
    data: dados.data || null,
    codigo,
    chave_telao: uid(),
    visual: { ...m.visual },
    status: 'rascunho',
    modo_teste: true,
    atividade_foco: null,
    envio_aberto: false,
    envio_prazo: null,
    tempo_resposta_seg: TEMPO_PADRAO,
    visualizacao: 'postits', // como o telão mostra as respostas depois que o envio fecha
    votacao_aberta: false,
    votacao_prazo: null,
    tempo_votacao_seg: 60, // 1 minuto para votar
    resultado_visivel: false, // as 3 mais votadas no telão e nos celulares
    resumo_visivel: false, // resumo geral da dinâmica no telão
    resumo_visao: 'numeros', // 'numeros' ou 'prioridades'
    limite_caracteres: 200,
    rotulo_atividade: m.rotulo_atividade,
    criado_em: agora(),
  };
  db.sessoes.push(s);
  m.atividades.forEach((a, i) => db.atividades.push({ id: uid(), sessao_id: s.id, ordem: i + 1, formato: 'mural', ...a }));
  m.etiquetas.forEach((e, i) => db.etiquetas.push({ id: uid(), sessao_id: s.id, ordem: i + 1, ...e }));
  return s;
}

// Primeira visita: já deixa uma sessão do Método Cooperar pronta para testar.
(function semente() {
  const db = ler();
  if (db.sessoes.length) {
    // o texto de apoio padrão antigo saiu do modelo: limpa nas sessões de demonstração já criadas
    const coresAntigas = ['#FCF484', '#131313', '#3A3833', '#BDBDBD', '#FFFFFF', '#C49A3A', '#3C3C3B'];
    let mudou = false;
    for (const s of db.sessoes) {
      db.etiquetas.filter((e) => e.sessao_id === s.id).sort((a, b) => a.ordem - b.ordem).forEach((e, i) => {
        if (coresAntigas.includes(String(e.cor).toUpperCase())) { e.cor = CORES_ETIQUETA[i % CORES_ETIQUETA.length]; mudou = true; }
      });
    }
    if (mudou) gravar(db);
    const antigo = 'O que podemos fazer para resolver isso?';
    if (db.atividades.some((a) => a.texto_apoio === antigo)) {
      db.atividades.forEach((a) => { if (a.texto_apoio === antigo) a.texto_apoio = ''; });
      gravar(db);
    }
    return;
  }
  const s = novaSessao(db, { modelo: 'cooperar', codigo: 'COOP11' });
  s.chave_telao = 'b6ce3342-1a77-4683-b8b7-50da67be51d9'; // mesma chave em qualquer navegador
  gravar(db);
})();

export const backend = {
  modo: 'demo',

  // ---------- Público (participante e telão, sem login) ----------
  async entrar(codigo, participanteId) {
    await espera();
    const db = ler();
    const s = db.sessoes.find((x) => x.codigo === normalizarCodigo(codigo));
    if (!s || s.status === 'arquivada') return null;
    if (participanteId) {
      const p = db.participantes.find((x) => x.sessao_id === s.id && x.id === participanteId);
      if (p) p.visto_em = agora();
      else db.participantes.push({ id: participanteId, sessao_id: s.id, criado_em: agora(), visto_em: agora() });
      gravar(db);
    }
    return {
      agora: agora(),
      sessao: publicaDe(db, s),
      atividades: db.atividades.filter((a) => a.sessao_id === s.id).sort(porOrdem),
      etiquetas: db.etiquetas.filter((e) => e.sessao_id === s.id).sort(porOrdem),
      minhas: db.respostas
        .filter((r) => r.sessao_id === s.id && r.participante_id === participanteId)
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
      // votação: todas as respostas visíveis da pergunta, sem contagem de votos
      opcoes: s.votacao_aberta
        ? db.respostas.filter((r) => r.atividade_id === s.atividade_foco && r.visivel && r.teste === s.modo_teste)
          .map((r) => ({ id: r.id, texto: r.texto, etiqueta_id: r.etiqueta_id }))
        : [],
      top: resultadoAtivo(db, s) ? topPrioridades(db, s) : [],
      meus_votos: s.votacao_aberta
        ? db.votos.filter((v) => v.atividade_id === s.atividade_foco && v.participante_id === participanteId).map((v) => v.resposta_id)
        : [],
    };
  },

  async votar({ codigo, participanteId, atividadeId, respostaIds }) {
    await espera();
    const db = ler();
    const s = db.sessoes.find((x) => x.codigo === normalizarCodigo(codigo));
    const ids = [...new Set(respostaIds || [])];
    if (!s) throw new Error('Sessão não encontrada.');
    if (!s.votacao_aberta || s.atividade_foco !== atividadeId) throw new Error('A votação desta pergunta está fechada.');
    if (s.votacao_prazo && Date.now() >= Date.parse(s.votacao_prazo) + TOLERANCIA_VOTO_MS) throw new Error('O tempo para votar acabou.');
    if (!ids.length) throw new Error('Escolha pelo menos uma ideia.');
    if (ids.length > MAX_VOTOS) throw new Error(`Escolha no máximo ${MAX_VOTOS} ideias.`);
    if (!db.participantes.some((p) => p.sessao_id === s.id && p.id === participanteId)) throw new Error('Entre na sessão de novo pelo QR code.');
    const validas = new Set(db.respostas.filter((r) => r.atividade_id === atividadeId && r.visivel && r.teste === s.modo_teste).map((r) => r.id));
    if (!ids.every((id) => validas.has(id))) throw new Error('Uma das ideias escolhidas não está mais disponível. Atualize a tela.');
    // troca os votos anteriores desta pessoa nesta pergunta pelos novos
    db.votos = db.votos.filter((v) => !(v.atividade_id === atividadeId && v.participante_id === participanteId));
    ids.forEach((id) => db.votos.push({ id: uid(), sessao_id: s.id, atividade_id: atividadeId, resposta_id: id, participante_id: participanteId, criado_em: agora() }));
    gravar(db);
    avisar(s.id, 'votos');
    return ids;
  },

  async enviar({ codigo, participanteId, atividadeId, etiquetaId, texto }) {
    await espera();
    const db = ler();
    const s = db.sessoes.find((x) => x.codigo === normalizarCodigo(codigo));
    const t = String(texto || '').trim();
    if (!s) throw new Error('Sessão não encontrada.');
    if (s.status === 'encerrada' || s.status === 'arquivada') throw new Error('Esta sessão já foi encerrada.');
    if (!s.envio_aberto || s.atividade_foco !== atividadeId) throw new Error('O envio para esta pergunta está fechado.');
    if (esgotado(s)) throw new Error('O tempo para responder acabou.');
    if (!t) throw new Error('Escreva sua resposta antes de enviar.');
    if (t.length > s.limite_caracteres) throw new Error(`A resposta passou do limite de ${s.limite_caracteres} caracteres.`);
    const etqs = db.etiquetas.filter((e) => e.sessao_id === s.id);
    if (etqs.length && !etqs.some((e) => e.id === etiquetaId)) throw new Error('Escolha uma etiqueta para a resposta.');
    if (!db.participantes.some((p) => p.sessao_id === s.id && p.id === participanteId)) throw new Error('Entre na sessão de novo pelo QR code.');
    const minuto = Date.now() - 60_000;
    if (db.respostas.filter((r) => r.sessao_id === s.id && r.participante_id === participanteId && Date.parse(r.criado_em) > minuto).length >= 10) {
      throw new Error('Muitos envios em pouco tempo. Espere um minuto.');
    }
    const r = {
      id: uid(), sessao_id: s.id, atividade_id: atividadeId, participante_id: participanteId,
      etiqueta_id: etqs.length ? etiquetaId : null, texto: t, criado_em: agora(),
      visivel: true, teste: s.modo_teste, editado: false,
    };
    db.respostas.push(r);
    gravar(db);
    avisar(s.id, 'respostas');
    return r;
  },

  async telao(codigo, chave) {
    await espera();
    const db = ler();
    const s = db.sessoes.find((x) => x.codigo === normalizarCodigo(codigo));
    // Na demonstração cada navegador cria a própria sessão com outra chave, então a chave
    // não é exigida aqui (no Supabase ela continua obrigatória).
    if (!s) return null;
    const daSessao = db.respostas.filter((r) => r.sessao_id === s.id && r.visivel && r.teste === s.modo_teste);
    return {
      agora: agora(),
      sessao: publicaDe(db, s),
      atividades: db.atividades.filter((a) => a.sessao_id === s.id).sort(porOrdem),
      etiquetas: db.etiquetas.filter((e) => e.sessao_id === s.id).sort(porOrdem),
      respostas: daSessao.filter((r) => r.atividade_id === s.atividade_foco).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
      total_respostas: daSessao.length,
      conectados: conectados(db, s.id),
      // só quantas pessoas votaram: o resultado fica no painel
      votantes: new Set(db.votos.filter((v) => v.atividade_id === s.atividade_foco).map((v) => v.participante_id)).size,
      top: resultadoAtivo(db, s) ? topPrioridades(db, s) : [],
      resumo: s.resumo_visivel ? resumo(db, s) : null,
    };
  },

  ouvir(sessaoId, cb) {
    if (!ouvintes.has(sessaoId)) ouvintes.set(sessaoId, new Set());
    ouvintes.get(sessaoId).add(cb);
    return () => ouvintes.get(sessaoId)?.delete(cb);
  },

  // ---------- Facilitador ----------
  async usuario() { return { email: 'demonstração' }; },
  async entrarFacilitador() { return { email: 'demonstração' }; },
  async sair() {},

  async listarSessoes() {
    await espera();
    const db = ler();
    return [...db.sessoes]
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map((s) => ({ ...s, total_respostas: db.respostas.filter((r) => r.sessao_id === s.id && !r.teste).length }));
  },

  async criarSessao(dados) {
    const db = ler();
    if (dados.codigo && db.sessoes.some((s) => s.codigo === normalizarCodigo(dados.codigo))) throw new Error('Esse código já está em uso.');
    const s = novaSessao(db, dados);
    gravar(db);
    return s;
  },

  async carregarSessao(id) {
    await espera();
    const db = ler();
    const s = db.sessoes.find((x) => x.id === id);
    if (!s) return null;
    return {
      sessao: { ...s },
      atividades: db.atividades.filter((a) => a.sessao_id === id).sort(porOrdem),
      etiquetas: db.etiquetas.filter((e) => e.sessao_id === id).sort(porOrdem),
      respostas: db.respostas.filter((r) => r.sessao_id === id).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
      votos: db.votos.filter((v) => v.sessao_id === id),
      conectados: conectados(db, id),
    };
  },

  async atualizarSessao(id, patch) {
    const db = ler();
    const s = db.sessoes.find((x) => x.id === id);
    if (!s) throw new Error('Sessão não encontrada.');
    if (patch.codigo !== undefined) {
      patch.codigo = normalizarCodigo(patch.codigo);
      if (patch.codigo.length < 4) throw new Error('O código precisa ter de 4 a 10 letras ou números.');
      if (db.sessoes.some((x) => x.id !== id && x.codigo === patch.codigo)) throw new Error('Esse código já está em uso.');
    }
    const antes = { ...s };
    Object.assign(s, patch);
    // Mesmo comportamento do gatilho no banco: abrir o envio (ou trocar de
    // pergunta com o envio aberto) começa o cronômetro; fechar zera o prazo.
    // abrir a votação fecha o envio; abrir o envio ou trocar de pergunta encerra a votação
    if (patch.votacao_aberta) s.envio_aberto = false;
    else if ((s.envio_aberto && !antes.envio_aberto) || antes.atividade_foco !== s.atividade_foco) s.votacao_aberta = false;
    // revelar o resultado encerra a votação; trocar de pergunta, abrir envio ou votação esconde de novo
    // resumo geral: mostrar fecha envio e votação; abrir envio, votação ou trocar de pergunta esconde
    if (patch.resumo_visivel) { s.envio_aberto = false; s.votacao_aberta = false; s.resultado_visivel = false; }
    else if (antes.atividade_foco !== s.atividade_foco || (s.envio_aberto && !antes.envio_aberto) || (s.votacao_aberta && !antes.votacao_aberta)) s.resumo_visivel = false;
    if (patch.resultado_visivel) { s.votacao_aberta = false; s.envio_aberto = false; }
    else if (antes.atividade_foco !== s.atividade_foco || (s.envio_aberto && !antes.envio_aberto) || (s.votacao_aberta && !antes.votacao_aberta)) s.resultado_visivel = false;
    // fim da votação na mesma pergunta (pelo tempo ou pelo botão): o top 3 aparece sozinho
    else if (antes.votacao_aberta && !s.votacao_aberta && patch.resultado_visivel === undefined && !s.resumo_visivel && temVotos(db, s)) s.resultado_visivel = true;
    // cronômetro da votação: começa ao abrir, zera ao fechar
    if (!s.votacao_aberta) s.votacao_prazo = null;
    else if (!antes.votacao_aberta) {
      const segV = s.tempo_votacao_seg ?? 60;
      s.votacao_prazo = segV > 0 ? new Date(Date.now() + segV * 1000).toISOString() : null;
    }
    if (!s.envio_aberto) s.envio_prazo = null;
    else if (!antes.envio_aberto || antes.atividade_foco !== s.atividade_foco) {
      const seg = s.tempo_resposta_seg ?? TEMPO_PADRAO;
      s.envio_prazo = seg > 0 ? new Date(Date.now() + seg * 1000).toISOString() : null;
    }
    gravar(db);
    avisar(id, 'sessoes');
    return s;
  },

  async excluirSessao(id) {
    const db = ler();
    db.sessoes = db.sessoes.filter((s) => s.id !== id);
    for (const t of ['atividades', 'etiquetas', 'participantes', 'respostas', 'votos']) db[t] = db[t].filter((x) => x.sessao_id !== id);
    gravar(db);
  },

  async salvarAtividade(a) {
    const db = ler();
    if (a.id) Object.assign(db.atividades.find((x) => x.id === a.id) || {}, a);
    else db.atividades.push({ id: uid(), formato: 'mural', texto_apoio: '', ...a });
    gravar(db);
    avisar(a.sessao_id, 'atividades');
  },

  async excluirAtividade(a) {
    const db = ler();
    db.atividades = db.atividades.filter((x) => x.id !== a.id);
    db.respostas = db.respostas.filter((r) => r.atividade_id !== a.id);
    const s = db.sessoes.find((x) => x.id === a.sessao_id);
    if (s?.atividade_foco === a.id) { s.atividade_foco = null; s.envio_aberto = false; s.votacao_aberta = false; s.resultado_visivel = false; }
    db.atividades.filter((x) => x.sessao_id === a.sessao_id).sort(porOrdem).forEach((x, i) => { x.ordem = i + 1; });
    gravar(db);
    avisar(a.sessao_id, 'atividades');
  },

  async salvarEtiqueta(e) {
    const db = ler();
    if (e.id) Object.assign(db.etiquetas.find((x) => x.id === e.id) || {}, e);
    else db.etiquetas.push({ id: uid(), ...e });
    gravar(db);
    avisar(e.sessao_id, 'etiquetas');
  },

  async excluirEtiqueta(e) {
    const db = ler();
    db.etiquetas = db.etiquetas.filter((x) => x.id !== e.id);
    db.respostas.forEach((r) => { if (r.etiqueta_id === e.id) r.etiqueta_id = null; });
    gravar(db);
    avisar(e.sessao_id, 'etiquetas');
  },

  async atualizarResposta(r, patch) {
    const db = ler();
    const x = db.respostas.find((y) => y.id === r.id);
    if (x) Object.assign(x, patch);
    gravar(db);
    avisar(r.sessao_id, 'respostas');
  },

  async excluirResposta(r) {
    const db = ler();
    db.respostas = db.respostas.filter((y) => y.id !== r.id);
    gravar(db);
    avisar(r.sessao_id, 'respostas');
  },

  async limparEnsaio(sessaoId) {
    const db = ler();
    db.respostas = db.respostas.filter((r) => !(r.sessao_id === sessaoId && r.teste));
    db.participantes = db.participantes.filter((p) => p.sessao_id !== sessaoId);
    gravar(db);
    avisar(sessaoId, 'respostas');
  },
};

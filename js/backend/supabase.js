// Backend real: Supabase (Postgres + Realtime + Auth).
// O participante e o telão só falam com funções RPC (security definer);
// as tabelas só abrem para facilitadores logados (ver 001_dinamica.sql).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { gerarCodigo, normalizarCodigo } from '../lib/util.js';
import { MODELOS } from '../lib/modelos.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const ONLINE_MS = 45_000;

function erro(e) {
  if (!e) return null;
  const m = e.message || String(e);
  if (/duplicate key.*codigo/i.test(m)) return new Error('Esse código já está em uso.');
  if (/codigo_check|codigo.*check/i.test(m)) return new Error('O código precisa ter de 4 a 10 letras ou números.');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error('Sem conexão. Confira a internet e tente de novo.');
  return new Error(m);
}
async function ok(p) {
  const { data, error } = await p;
  if (error) throw erro(error);
  return data;
}
const rpc = (fn, args) => ok(sb.rpc(fn, args));

export const backend = {
  modo: 'supabase',

  // ---------- Público ----------
  entrar: (codigo, participanteId) =>
    rpc('entrar_sessao', { p_codigo: normalizarCodigo(codigo), p_participante: participanteId }),

  enviar: ({ codigo, participanteId, atividadeId, etiquetaId, texto }) =>
    rpc('enviar_resposta', {
      p_codigo: normalizarCodigo(codigo),
      p_participante: participanteId,
      p_atividade: atividadeId,
      p_etiqueta: etiquetaId || null,
      p_texto: texto,
    }),

  votar: ({ codigo, participanteId, atividadeId, respostaIds }) =>
    rpc('votar', { p_codigo: normalizarCodigo(codigo), p_participante: participanteId, p_atividade: atividadeId, p_respostas: respostaIds }),

  telao: (codigo, chave) =>
    /^[0-9a-f-]{36}$/i.test(chave || '') ? rpc('telao_estado', { p_codigo: normalizarCodigo(codigo), p_chave: chave }) : Promise.resolve(null),

  // Os gatilhos do banco mandam um aviso "mudou" (sem dados) no canal da sessão;
  // quem ouve busca o estado de novo pelas funções acima.
  ouvir(sessaoId, cb) {
    const ch = sb
      .channel(`sessao-${sessaoId}`)
      .on('broadcast', { event: 'mudou' }, (msg) => cb(msg.payload || {}))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  },

  // ---------- Facilitador ----------
  async usuario() {
    const { data } = await sb.auth.getSession();
    return data.session?.user ?? null;
  },
  async entrarFacilitador(email, senha) {
    const data = await ok(sb.auth.signInWithPassword({ email, password: senha }));
    const pode = await rpc('sou_facilitador', {});
    if (!pode) {
      await sb.auth.signOut();
      throw new Error('Este e-mail não está liberado como facilitador O&O.');
    }
    return data.user;
  },
  sair: () => sb.auth.signOut(),

  async listarSessoes() {
    const lista = await ok(sb.from('sessoes').select('*, respostas(count)').eq('respostas.teste', false).order('criado_em', { ascending: false }));
    return lista.map((s) => ({ ...s, total_respostas: s.respostas?.[0]?.count ?? 0 }));
  },

  async criarSessao(dados) {
    const m = MODELOS[dados.modelo] || MODELOS.branco;
    const s = await ok(sb.from('sessoes').insert({
      nome: dados.nome || m.nome,
      cliente: dados.cliente ?? m.cliente,
      data: dados.data || null,
      codigo: normalizarCodigo(dados.codigo) || gerarCodigo(),
      visual: m.visual,
      rotulo_atividade: m.rotulo_atividade,
    }).select().single());
    await ok(sb.from('atividades').insert(m.atividades.map((a, i) => ({ ...a, sessao_id: s.id, ordem: i + 1 }))));
    await ok(sb.from('etiquetas').insert(m.etiquetas.map((e, i) => ({ ...e, sessao_id: s.id, ordem: i + 1 }))));
    return s;
  },

  async carregarSessao(id) {
    const desde = new Date(Date.now() - ONLINE_MS).toISOString();
    const [sessao, atividades, etiquetas, respostas, votos, online] = await Promise.all([
      ok(sb.from('sessoes').select('*').eq('id', id).maybeSingle()),
      ok(sb.from('atividades').select('*').eq('sessao_id', id).order('ordem')),
      ok(sb.from('etiquetas').select('*').eq('sessao_id', id).order('ordem')),
      ok(sb.from('respostas').select('*').eq('sessao_id', id).order('criado_em', { ascending: false }).limit(5000)),
      ok(sb.from('votos').select('atividade_id, resposta_id, participante_id').eq('sessao_id', id).limit(20000)),
      sb.from('participantes').select('id', { count: 'exact', head: true }).eq('sessao_id', id).gte('visto_em', desde),
    ]);
    if (!sessao) return null;
    return { sessao, atividades, etiquetas, respostas, votos, conectados: online.count ?? 0 };
  },

  async atualizarSessao(id, patch) {
    if (patch.codigo !== undefined) patch = { ...patch, codigo: normalizarCodigo(patch.codigo) };
    return ok(sb.from('sessoes').update(patch).eq('id', id).select().single());
  },
  async excluirSessao(id) {
    await ok(sb.from('sessoes').update({ atividade_foco: null }).eq('id', id));
    await ok(sb.from('sessoes').delete().eq('id', id));
  },

  async salvarAtividade(a) {
    if (a.id) { const { id, ...resto } = a; return ok(sb.from('atividades').update(resto).eq('id', id)); }
    return ok(sb.from('atividades').insert(a));
  },
  async excluirAtividade(a) {
    await ok(sb.from('atividades').delete().eq('id', a.id));
    const resto = await ok(sb.from('atividades').select('id, ordem').eq('sessao_id', a.sessao_id).order('ordem'));
    await Promise.all(resto.map((x, i) => (x.ordem === i + 1 ? null : ok(sb.from('atividades').update({ ordem: i + 1 }).eq('id', x.id)))));
  },

  async salvarEtiqueta(e) {
    if (e.id) { const { id, ...resto } = e; return ok(sb.from('etiquetas').update(resto).eq('id', id)); }
    return ok(sb.from('etiquetas').insert(e));
  },
  excluirEtiqueta: (e) => ok(sb.from('etiquetas').delete().eq('id', e.id)),

  atualizarResposta: (r, patch) => ok(sb.from('respostas').update(patch).eq('id', r.id)),
  excluirResposta: (r) => ok(sb.from('respostas').delete().eq('id', r.id)),
  limparEnsaio: (sessaoId) => rpc('limpar_ensaio', { p_sessao: sessaoId }),
};

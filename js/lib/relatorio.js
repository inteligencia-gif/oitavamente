// Números e conteúdo do relatório da dinâmica, usados no PDF e na planilha.
// Considera só respostas visíveis (o que a moderação tirou não entra) e só as
// da rodada valendo (as de ensaio só entram se a sessão ainda estiver em ensaio).

export function montarRelatorio({ sessao, atividades, etiquetas, respostas, votos = [] }) {
  const valendo = respostas.filter((r) => r.visivel && (sessao.modo_teste ? r.teste : !r.teste));
  const ids = new Set(valendo.map((r) => r.id));
  const votosValendo = votos.filter((v) => ids.has(v.resposta_id));
  const nVotos = new Map();
  votosValendo.forEach((v) => nVotos.set(v.resposta_id, (nVotos.get(v.resposta_id) || 0) + 1));
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const ordenadas = [...etiquetas].sort((a, b) => a.ordem - b.ordem);

  const porAtividade = [...atividades].sort((a, b) => a.ordem - b.ordem).map((a) => {
    const rs = valendo.filter((r) => r.atividade_id === a.id)
      .map((r) => ({ ...r, votos: nVotos.get(r.id) || 0, etiqueta: etq.get(r.etiqueta_id) || null }))
      .sort((x, y) => y.votos - x.votos || x.criado_em.localeCompare(y.criado_em));
    const votadas = rs.filter((r) => r.votos > 0);
    const top = votadas
      .map((r) => ({ ...r, posicao: votadas.filter((x) => x.votos > r.votos).length + 1 }))
      .filter((r) => r.posicao <= 3);
    const vs = votosValendo.filter((v) => v.atividade_id === a.id);
    return {
      atividade: a,
      respostas: rs,
      top,
      votos: vs.length,
      votantes: new Set(vs.map((v) => v.participante_id)).size,
      porEtiqueta: ordenadas.map((e) => ({ etiqueta: e, n: rs.filter((r) => r.etiqueta_id === e.id).length })),
    };
  });

  const pessoas = new Set([...valendo.map((r) => r.participante_id), ...votosValendo.map((v) => v.participante_id)]);
  return {
    sessao,
    etiquetas: ordenadas,
    totais: {
      respostas: valendo.length,
      pessoas: pessoas.size,
      votos: votosValendo.length,
      votantes: new Set(votosValendo.map((v) => v.participante_id)).size,
      priorizadas: porAtividade.reduce((s, x) => s + x.top.length, 0),
      atividades: porAtividade.length,
    },
    porEtiqueta: ordenadas.map((e) => ({ etiqueta: e, n: valendo.filter((r) => r.etiqueta_id === e.id).length })),
    porAtividade,
    ensaio: Boolean(sessao.modo_teste),
  };
}

export const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

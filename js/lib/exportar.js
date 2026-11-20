import { fmtDataHora, numerarParticipantes } from './util.js';

// Planilha gerada no navegador: abas "Respostas", "Prioridades" (votação) e "Resumo".
export async function exportarPlanilha({ sessao, atividades, etiquetas, respostas, votos = [] }, { incluirEnsaio = false } = {}) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const lista = respostas.filter((r) => incluirEnsaio || !r.teste);
  const numero = numerarParticipantes(lista);
  const atv = new Map(atividades.map((a) => [a.id, a]));
  const etq = new Map(etiquetas.map((e) => [e.id, e]));
  const rotulo = sessao.rotulo_atividade || 'Pergunta';
  const ids = new Set(lista.map((r) => r.id));
  const nVotos = new Map();
  votos.filter((v) => ids.has(v.resposta_id)).forEach((v) => nVotos.set(v.resposta_id, (nVotos.get(v.resposta_id) || 0) + 1));

  const linhas = [...lista]
    .sort((a, b) => (atv.get(a.atividade_id)?.ordem ?? 0) - (atv.get(b.atividade_id)?.ordem ?? 0)
      || a.criado_em.localeCompare(b.criado_em))
    .map((r) => {
      const a = atv.get(r.atividade_id);
      return {
        [`Nº ${rotulo.toLowerCase()}`]: a ? a.ordem : '',
        [rotulo]: a ? a.titulo : '(removida)',
        Pergunta: a?.texto_apoio || '',
        Resposta: r.texto,
        Etiqueta: etq.get(r.etiqueta_id)?.nome || '',
        Votos: nVotos.get(r.id) || 0,
        Horário: fmtDataHora(r.criado_em),
        Participante: `Participante ${numero.get(r.participante_id)}`,
        'Visível no telão': r.visivel ? 'Sim' : 'Não',
        Editada: r.editado ? 'Sim' : 'Não',
        Ensaio: r.teste ? 'Sim' : 'Não',
        Grupo: '',
      };
    });

  const resumo = [...atividades].sort((a, b) => a.ordem - b.ordem).map((a) => {
    const da = lista.filter((r) => r.atividade_id === a.id);
    const linha = { [`Nº ${rotulo.toLowerCase()}`]: a.ordem, [rotulo]: a.titulo, Total: da.length };
    etiquetas.forEach((e) => { linha[e.nome] = da.filter((r) => r.etiqueta_id === e.id).length; });
    linha.Ocultas = da.filter((r) => !r.visivel).length;
    return linha;
  });

  // Prioridades: respostas mais votadas de cada pergunta, com a posição no ranking
  const prioridades = [];
  [...atividades].sort((a, b) => a.ordem - b.ordem).forEach((a) => {
    const votadas = lista.filter((r) => r.atividade_id === a.id && nVotos.get(r.id))
      .sort((x, y) => nVotos.get(y.id) - nVotos.get(x.id));
    const votantes = new Set(votos.filter((v) => v.atividade_id === a.id && ids.has(v.resposta_id)).map((v) => v.participante_id)).size;
    votadas.forEach((r) => {
      prioridades.push({
        [`Nº ${rotulo.toLowerCase()}`]: a.ordem,
        [rotulo]: a.titulo,
        Posição: votadas.filter((x) => nVotos.get(x.id) > nVotos.get(r.id)).length + 1,
        Resposta: r.texto,
        Etiqueta: etq.get(r.etiqueta_id)?.nome || '',
        Votos: nVotos.get(r.id),
        'Pessoas que votaram': votantes,
      });
    });
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Resposta: 'Nenhuma resposta' }]);
  ws['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 34 }, { wch: 70 }, { wch: 16 }, { wch: 7 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Respostas');
  if (prioridades.length) {
    const wp = XLSX.utils.json_to_sheet(prioridades);
    wp['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 9 }, { wch: 70 }, { wch: 16 }, { wch: 7 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wp, 'Prioridades');
  }
  const wr = XLSX.utils.json_to_sheet(resumo);
  wr['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 8 }, ...etiquetas.map(() => ({ wch: 16 })), { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wr, 'Resumo');

  const nome = `${sessao.cliente ? sessao.cliente + ' - ' : ''}${sessao.nome}`.replace(/[\\/:*?"<>|]/g, '');
  XLSX.writeFile(wb, `${nome} - respostas${incluirEnsaio ? ' (com ensaio)' : ''}.xlsx`);
  return linhas.length;
}

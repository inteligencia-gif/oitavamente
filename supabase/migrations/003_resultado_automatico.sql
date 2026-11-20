-- O top 3 aparece sozinho quando a votação acaba: pelo tempo (mesmo antes de o
-- painel fechar a votação) ou pelo botão "Encerrar votação". Só se alguém votou.
-- Aplicado no projeto dinamica-oo. Recria _sessao_publica, entrar_sessao,
-- telao_estado e _cronometro_envio usando _resultado_ativo (texto completo
-- registrado no histórico de migrações do Supabase: 003_resultado_automatico).

create or replace function public._resultado_ativo(s public.sessoes)
returns boolean
language sql stable set search_path = public
as $$
  select s.resultado_visivel
    or (s.votacao_aberta and s.votacao_prazo is not null and now() >= s.votacao_prazo
        and exists (select 1 from public.votos v where v.atividade_id = s.atividade_foco));
$$;
revoke all on function public._resultado_ativo(public.sessoes) from public, anon, authenticated;

-- _sessao_publica: 'resultado_visivel' passa a ser public._resultado_ativo(s)
-- entrar_sessao e telao_estado: 'top' quando public._resultado_ativo(s)
-- _cronometro_envio: novo ramo no UPDATE —
--   elsif old.votacao_aberta and not new.votacao_aberta and not new.resultado_visivel
--      and new.resultado_visivel is not distinct from old.resultado_visivel
--      and exists (select 1 from public.votos v where v.atividade_id = new.atividade_foco) then
--     new.resultado_visivel := true;

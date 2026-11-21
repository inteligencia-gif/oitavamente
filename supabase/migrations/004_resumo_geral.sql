-- Resumo geral da dinâmica (números e só as priorizadas) e top 3 automático.
-- Aplicado no projeto dinamica-oo. Este arquivo traz a versão atual completa das
-- funções que mudaram depois do 001 (substitui também o resumo do 003).

alter table public.sessoes
  add column if not exists resumo_visivel boolean not null default false,
  add column if not exists resumo_visao text not null default 'numeros' check (resumo_visao in ('numeros', 'prioridades'));

-- O top 3 aparece quando o facilitador revela ou assim que o tempo da votação acaba.
create or replace function public._resultado_ativo(s public.sessoes)
returns boolean
language sql stable set search_path = public
as $$
  select s.resultado_visivel
    or (s.votacao_aberta and s.votacao_prazo is not null and now() >= s.votacao_prazo
        and exists (select 1 from public.votos v where v.atividade_id = s.atividade_foco));
$$;

-- Top 3 (com empates) de uma pergunta qualquer.
create or replace function public._top_de(p_atividade uuid, p_teste boolean)
returns jsonb
language sql stable set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'texto', k.texto, 'etiqueta_id', k.etiqueta_id,
    'votos', k.n, 'posicao', k.pos) order by k.pos, k.texto), '[]'::jsonb)
  from (
    select c.*, rank() over (order by c.n desc) as pos
    from (
      select r.id, r.texto, r.etiqueta_id, count(v.id) as n
      from public.respostas r
      join public.votos v on v.resposta_id = r.id
      where r.atividade_id = p_atividade and r.visivel and r.teste = p_teste
      group by r.id
    ) c
  ) k
  where k.pos <= 3;
$$;

create or replace function public._top_prioridades(s public.sessoes)
returns jsonb
language sql stable set search_path = public
as $$
  select public._top_de(s.atividade_foco, s.modo_teste);
$$;

-- Números da sessão (sem ensaio fora do ensaio, sem respostas ocultas).
create or replace function public._resumo(s public.sessoes)
returns jsonb
language sql stable set search_path = public
as $$
  with r as (
    select * from public.respostas
    where sessao_id = s.id and visivel and teste = s.modo_teste
  ), v as (
    select v.* from public.votos v join r on r.id = v.resposta_id
  )
  select jsonb_build_object(
    'respostas', (select count(*) from r),
    'pessoas', (select count(distinct p) from (
        select participante_id as p from r union select participante_id from v) x),
    'votos', (select count(*) from v),
    'votantes', (select count(distinct participante_id) from v),
    'por_etiqueta', coalesce((select jsonb_agg(jsonb_build_object('etiqueta_id', e.id, 'n',
        (select count(*) from r where r.etiqueta_id = e.id)) order by e.ordem)
      from public.etiquetas e where e.sessao_id = s.id), '[]'::jsonb),
    'por_atividade', coalesce((select jsonb_agg(jsonb_build_object('atividade_id', a.id,
        'n', (select count(*) from r where r.atividade_id = a.id),
        'votos', (select count(*) from v where v.atividade_id = a.id),
        'top', public._top_de(a.id, s.modo_teste)) order by a.ordem)
      from public.atividades a where a.sessao_id = s.id), '[]'::jsonb)
  );
$$;

revoke all on function public._resultado_ativo(public.sessoes) from public, anon, authenticated;
revoke all on function public._top_de(uuid, boolean) from public, anon, authenticated;
revoke all on function public._resumo(public.sessoes) from public, anon, authenticated;

create or replace function public._sessao_publica(s public.sessoes)
returns jsonb
language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id, 'nome', s.nome, 'cliente', s.cliente, 'codigo', s.codigo,
    'visual', s.visual, 'status', s.status, 'atividade_foco', s.atividade_foco,
    'envio_aberto', s.envio_aberto, 'envio_prazo', s.envio_prazo,
    'tempo_resposta_seg', s.tempo_resposta_seg, 'visualizacao', s.visualizacao,
    'votacao_aberta', s.votacao_aberta, 'votacao_prazo', s.votacao_prazo,
    'tempo_votacao_seg', s.tempo_votacao_seg, 'resultado_visivel', public._resultado_ativo(s),
    'resumo_visivel', s.resumo_visivel, 'resumo_visao', s.resumo_visao,
    'limite_caracteres', s.limite_caracteres,
    'rotulo_atividade', s.rotulo_atividade
  );
$$;

create or replace function public.entrar_sessao(p_codigo text, p_participante uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.sessoes;
begin
  select * into s from public.sessoes where codigo = upper(btrim(p_codigo));
  if not found or s.status = 'arquivada' then
    return null;
  end if;

  if p_participante is not null then
    insert into public.participantes (sessao_id, id) values (s.id, p_participante)
    on conflict (sessao_id, id) do update set visto_em = now();
  end if;

  return jsonb_build_object(
    'agora', now(),
    'sessao', public._sessao_publica(s),
    'atividades', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'ordem', a.ordem, 'formato', a.formato,
        'titulo', a.titulo, 'texto_apoio', a.texto_apoio) order by a.ordem)
      from public.atividades a where a.sessao_id = s.id), '[]'::jsonb),
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by e.ordem)
      from public.etiquetas e where e.sessao_id = s.id), '[]'::jsonb),
    'minhas', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'atividade_id', r.atividade_id,
        'etiqueta_id', r.etiqueta_id, 'texto', r.texto, 'criado_em', r.criado_em) order by r.criado_em desc)
      from public.respostas r
      where r.sessao_id = s.id and r.participante_id = p_participante), '[]'::jsonb),
    'opcoes', case when s.votacao_aberta then coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'texto', r.texto, 'etiqueta_id', r.etiqueta_id))
      from public.respostas r
      where r.atividade_id = s.atividade_foco and r.visivel and r.teste = s.modo_teste), '[]'::jsonb) else '[]'::jsonb end,
    'top', case when public._resultado_ativo(s) then public._top_prioridades(s) else '[]'::jsonb end,
    'meus_votos', case when s.votacao_aberta then coalesce((
      select jsonb_agg(v.resposta_id) from public.votos v
      where v.atividade_id = s.atividade_foco and v.participante_id = p_participante), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.telao_estado(p_codigo text, p_chave uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.sessoes;
begin
  select * into s from public.sessoes
  where codigo = upper(btrim(p_codigo)) and chave_telao = p_chave;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'agora', now(),
    'sessao', public._sessao_publica(s),
    'atividades', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'ordem', a.ordem, 'formato', a.formato,
        'titulo', a.titulo, 'texto_apoio', a.texto_apoio) order by a.ordem)
      from public.atividades a where a.sessao_id = s.id), '[]'::jsonb),
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by e.ordem)
      from public.etiquetas e where e.sessao_id = s.id), '[]'::jsonb),
    'respostas', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'etiqueta_id', x.etiqueta_id, 'texto', x.texto,
        'criado_em', x.criado_em) order by x.criado_em desc)
      from (
        select * from public.respostas r
        where r.atividade_id = s.atividade_foco and r.visivel and r.teste = s.modo_teste
        order by r.criado_em desc limit 500
      ) x), '[]'::jsonb),
    'total_respostas', (
      select count(*) from public.respostas r
      where r.sessao_id = s.id and r.visivel and r.teste = s.modo_teste),
    'top', case when public._resultado_ativo(s) then public._top_prioridades(s) else '[]'::jsonb end,
    'resumo', case when s.resumo_visivel then public._resumo(s) else null end,
    'votantes', (
      select count(distinct v.participante_id) from public.votos v where v.atividade_id = s.atividade_foco),
    'conectados', (
      select count(*) from public.participantes p
      where p.sessao_id = s.id and p.visto_em > now() - interval '45 seconds')
  );
end;
$$;

-- Gatilho da sessão: resumo, top 3 automático, votação e cronômetros.
create or replace function public._cronometro_envio()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- mostrar o resumo fecha envio e votação; abrir envio, votação ou trocar de pergunta esconde
    if new.resumo_visivel and not old.resumo_visivel then
      new.envio_aberto := false;
      new.votacao_aberta := false;
      new.resultado_visivel := false;
    elsif new.atividade_foco is distinct from old.atividade_foco
       or (new.envio_aberto and not old.envio_aberto)
       or (new.votacao_aberta and not old.votacao_aberta) then
      new.resumo_visivel := false;
    end if;
    -- revelar o top 3 fecha a votação; trocar de pergunta, abrir envio ou votação esconde;
    -- fim da votação na mesma pergunta (pelo tempo ou pelo botão) revela sozinho
    if new.resultado_visivel and not old.resultado_visivel then
      new.votacao_aberta := false;
      new.envio_aberto := false;
    elsif new.atividade_foco is distinct from old.atividade_foco
       or (new.envio_aberto and not old.envio_aberto)
       or (new.votacao_aberta and not old.votacao_aberta) then
      new.resultado_visivel := false;
    elsif old.votacao_aberta and not new.votacao_aberta and not new.resultado_visivel
       and new.resultado_visivel is not distinct from old.resultado_visivel
       and not new.resumo_visivel
       and exists (select 1 from public.votos v where v.atividade_id = new.atividade_foco) then
      new.resultado_visivel := true;
    end if;
    -- abrir a votação fecha o envio; abrir o envio ou trocar de pergunta encerra a votação
    if new.votacao_aberta and not old.votacao_aberta then
      new.envio_aberto := false;
    elsif (new.envio_aberto and not old.envio_aberto) or new.atividade_foco is distinct from old.atividade_foco then
      new.votacao_aberta := false;
    end if;
  end if;
  -- cronômetros: começam ao abrir, zeram ao fechar
  if not new.votacao_aberta then
    new.votacao_prazo := null;
  elsif tg_op = 'INSERT' or not old.votacao_aberta then
    new.votacao_prazo := case when new.tempo_votacao_seg > 0
      then now() + make_interval(secs => new.tempo_votacao_seg) else null end;
  end if;
  if not new.envio_aberto then
    new.envio_prazo := null;
  elsif tg_op = 'INSERT' or not old.envio_aberto or new.atividade_foco is distinct from old.atividade_foco then
    new.envio_prazo := case when new.tempo_resposta_seg > 0
      then now() + make_interval(secs => new.tempo_resposta_seg) else null end;
  end if;
  return new;
end;
$$;

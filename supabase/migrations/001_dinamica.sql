-- Ferramenta de Dinâmica O&O — esquema do MVP
--
-- Regras de acesso:
--   * Participante e telão NÃO leem tabelas. Só chamam as funções
--     entrar_sessao, enviar_resposta e telao_estado (security definer),
--     que validam código, sessão aberta, limite de caracteres e de envios.
--   * Facilitador = usuário logado cujo e-mail está em public.facilitadores.
--     Só ele lê e altera as tabelas.
--   * Os gatilhos mandam um aviso "mudou" (sem dados) pelo Supabase Realtime no
--     canal "sessao-<id>"; as telas buscam o estado de novo pelas funções.

-- ------------------------------------------------------------------ tabelas

create table public.facilitadores (
  email text primary key check (email = lower(email)),
  criado_em timestamptz not null default now()
);

create table public.sessoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cliente text not null default '',
  data date,
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{4,10}$'),
  chave_telao uuid not null default gen_random_uuid(),
  visual jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho', 'ao_vivo', 'encerrada', 'arquivada')),
  modo_teste boolean not null default true,
  atividade_foco uuid,
  envio_aberto boolean not null default false,
  envio_prazo timestamptz,                                  -- fim do cronômetro da pergunta aberta
  votacao_aberta boolean not null default false,             -- votação de prioridades da pergunta em foco
  votacao_prazo timestamptz,                                -- fim do cronômetro da votação
  tempo_votacao_seg int not null default 60 check (tempo_votacao_seg between 0 and 3600), -- 0 = sem cronômetro
  resultado_visivel boolean not null default false,          -- as 3 mais votadas no telão e nos celulares
  visualizacao text not null default 'postits' check (visualizacao in ('postits', 'nuvem', 'etiquetas')), -- telão depois do envio
  tempo_resposta_seg int not null default 480 check (tempo_resposta_seg between 0 and 3600), -- 0 = sem cronômetro
  limite_caracteres int not null default 200 check (limite_caracteres between 20 and 1000),
  rotulo_atividade text not null default 'Pergunta',
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes (id) on delete cascade,
  ordem int not null,
  formato text not null default 'mural' check (formato in ('mural')),
  titulo text not null,
  texto_apoio text not null default '',
  criado_em timestamptz not null default now()
);
create index on public.atividades (sessao_id, ordem);

alter table public.sessoes
  add constraint sessoes_atividade_foco_fkey
  foreign key (atividade_foco) references public.atividades (id) on delete set null;

create table public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes (id) on delete cascade,
  ordem int not null default 1,
  nome text not null,
  cor text not null default '#888888' check (cor ~ '^#[0-9A-Fa-f]{6}$')
);
create index on public.etiquetas (sessao_id);

-- Cada celular conectado. O id é gerado no aparelho e guardado nele.
create table public.participantes (
  sessao_id uuid not null references public.sessoes (id) on delete cascade,
  id uuid not null,
  nome text,
  agencia text,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  primary key (sessao_id, id)
);
create index on public.participantes (sessao_id, visto_em);

create table public.respostas (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes (id) on delete cascade,
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  participante_id uuid not null,
  etiqueta_id uuid references public.etiquetas (id) on delete set null,
  texto text not null check (char_length(texto) between 1 and 1000),
  criado_em timestamptz not null default now(),
  visivel boolean not null default true,
  teste boolean not null default false,
  editado boolean not null default false,
  grupo_id uuid -- v2: agrupamento
);
create index on public.respostas (atividade_id, criado_em desc);
create index on public.respostas (sessao_id, participante_id, criado_em desc);

-- Votos de prioridade: cada pessoa escolhe até 3 respostas por pergunta.
create table public.votos (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes (id) on delete cascade,
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  resposta_id uuid not null references public.respostas (id) on delete cascade,
  participante_id uuid not null,
  criado_em timestamptz not null default now(),
  unique (resposta_id, participante_id)
);
create index on public.votos (atividade_id, participante_id);

-- ------------------------------------------------------------------ acesso

create or replace function public.sou_facilitador()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.facilitadores
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.facilitadores enable row level security;
alter table public.sessoes enable row level security;
alter table public.atividades enable row level security;
alter table public.etiquetas enable row level security;
alter table public.participantes enable row level security;
alter table public.respostas enable row level security;
alter table public.votos enable row level security;

create policy "facilitador lê a lista" on public.facilitadores
  for select to authenticated using (public.sou_facilitador());

create policy "facilitador gerencia sessões" on public.sessoes
  for all to authenticated using (public.sou_facilitador()) with check (public.sou_facilitador());
create policy "facilitador gerencia atividades" on public.atividades
  for all to authenticated using (public.sou_facilitador()) with check (public.sou_facilitador());
create policy "facilitador gerencia etiquetas" on public.etiquetas
  for all to authenticated using (public.sou_facilitador()) with check (public.sou_facilitador());
create policy "facilitador vê participantes" on public.participantes
  for all to authenticated using (public.sou_facilitador()) with check (public.sou_facilitador());
create policy "facilitador vê votos" on public.votos
  for all to authenticated using (public.sou_facilitador()) with check (public.sou_facilitador());
create policy "facilitador modera respostas" on public.respostas
  for all to authenticated using (public.sou_facilitador()) with check (public.sou_facilitador());

grant select, insert, update, delete on public.sessoes, public.atividades, public.etiquetas,
  public.participantes, public.respostas, public.votos to authenticated;
grant select on public.facilitadores to authenticated;

-- Visitante anônimo não toca nas tabelas diretamente.
revoke all on public.facilitadores, public.sessoes, public.atividades, public.etiquetas,
  public.participantes, public.respostas, public.votos from anon;

-- ------------------------------------------------------------------ funções públicas

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
    'tempo_votacao_seg', s.tempo_votacao_seg, 'resultado_visivel', s.resultado_visivel,
    'limite_caracteres', s.limite_caracteres,
    'rotulo_atividade', s.rotulo_atividade
  );
$$;

-- As mais votadas da pergunta em foco: posição 1 a 3, com empates (1, 2, 2, 4…).
create or replace function public._top_prioridades(s public.sessoes)
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
      where r.atividade_id = s.atividade_foco and r.visivel and r.teste = s.modo_teste
      group by r.id
    ) c
  ) k
  where k.pos <= 3;
$$;
revoke all on function public._top_prioridades(public.sessoes) from public, anon, authenticated;

-- Participante entra (ou renova a presença) e recebe o estado da sessão.
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
    -- votação: as respostas da pergunta (sem contagem) e os votos desta pessoa
    'opcoes', case when s.votacao_aberta then coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'texto', r.texto, 'etiqueta_id', r.etiqueta_id))
      from public.respostas r
      where r.atividade_id = s.atividade_foco and r.visivel and r.teste = s.modo_teste), '[]'::jsonb) else '[]'::jsonb end,
    'top', case when s.resultado_visivel then public._top_prioridades(s) else '[]'::jsonb end,
    'meus_votos', case when s.votacao_aberta then coalesce((
      select jsonb_agg(v.resposta_id) from public.votos v
      where v.atividade_id = s.atividade_foco and v.participante_id = p_participante), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- Participante envia um post-it.
create or replace function public.enviar_resposta(
  p_codigo text, p_participante uuid, p_atividade uuid, p_etiqueta uuid, p_texto text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.sessoes;
  t text := btrim(coalesce(p_texto, ''));
  n int;
  r public.respostas;
begin
  select * into s from public.sessoes where codigo = upper(btrim(p_codigo));
  if not found then
    raise exception 'Sessão não encontrada.';
  end if;
  if s.status in ('encerrada', 'arquivada') then
    raise exception 'Esta sessão já foi encerrada.';
  end if;
  if not s.envio_aberto or s.atividade_foco is distinct from p_atividade then
    raise exception 'O envio para esta pergunta está fechado.';
  end if;
  -- 15 segundos de tolerância para quem já estava escrevendo quando o cronômetro zerou
  if s.envio_prazo is not null and now() >= s.envio_prazo + interval '15 seconds' then
    raise exception 'O tempo para responder acabou.';
  end if;
  if char_length(t) = 0 then
    raise exception 'Escreva sua resposta antes de enviar.';
  end if;
  if char_length(t) > s.limite_caracteres then
    raise exception 'A resposta passou do limite de % caracteres.', s.limite_caracteres;
  end if;

  if exists (select 1 from public.etiquetas where sessao_id = s.id) then
    if p_etiqueta is null or not exists (select 1 from public.etiquetas where id = p_etiqueta and sessao_id = s.id) then
      raise exception 'Escolha uma etiqueta para a resposta.';
    end if;
  else
    p_etiqueta := null;
  end if;

  if not exists (select 1 from public.participantes where sessao_id = s.id and id = p_participante) then
    raise exception 'Entre na sessão de novo pelo QR code.';
  end if;

  select count(*) into n from public.respostas
  where sessao_id = s.id and participante_id = p_participante and criado_em > now() - interval '1 minute';
  if n >= 10 then
    raise exception 'Muitos envios em pouco tempo. Espere um minuto.';
  end if;

  select count(*) into n from public.respostas
  where sessao_id = s.id and criado_em > now() - interval '1 minute';
  if n >= 600 then
    raise exception 'A sala está enviando muito rápido. Tente de novo em instantes.';
  end if;

  insert into public.respostas (sessao_id, atividade_id, participante_id, etiqueta_id, texto, teste)
  values (s.id, p_atividade, p_participante, p_etiqueta, t, s.modo_teste)
  returning * into r;

  update public.participantes set visto_em = now() where sessao_id = s.id and id = p_participante;

  return jsonb_build_object('id', r.id, 'atividade_id', r.atividade_id, 'etiqueta_id', r.etiqueta_id,
    'texto', r.texto, 'criado_em', r.criado_em);
end;
$$;

-- Telão: precisa do código e da chave do telão (que só o painel mostra).
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
    'top', case when s.resultado_visivel then public._top_prioridades(s) else '[]'::jsonb end,
    'votantes', (
      select count(distinct v.participante_id) from public.votos v where v.atividade_id = s.atividade_foco),
    'conectados', (
      select count(*) from public.participantes p
      where p.sessao_id = s.id and p.visto_em > now() - interval '45 seconds')
  );
end;
$$;

-- Facilitador: apaga as respostas e presenças do ensaio.
create or replace function public.limpar_ensaio(p_sessao uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.sou_facilitador() then
    raise exception 'Acesso restrito ao time O&O.';
  end if;
  delete from public.respostas where sessao_id = p_sessao and teste;
  delete from public.participantes where sessao_id = p_sessao;
end;
$$;

revoke all on function public._sessao_publica(public.sessoes) from public, anon, authenticated;
revoke all on function public.entrar_sessao(text, uuid) from public;
revoke all on function public.enviar_resposta(text, uuid, uuid, uuid, text) from public;
revoke all on function public.telao_estado(text, uuid) from public;
revoke all on function public.limpar_ensaio(uuid) from public, anon;
revoke all on function public.sou_facilitador() from public;
grant execute on function public.entrar_sessao(text, uuid) to anon, authenticated;
grant execute on function public.enviar_resposta(text, uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.telao_estado(text, uuid) to anon, authenticated;

-- Participante vota: troca os votos anteriores dele nesta pergunta pelos novos (1 a 3).
create or replace function public.votar(p_codigo text, p_participante uuid, p_atividade uuid, p_respostas uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.sessoes;
  ids uuid[] := array(select distinct unnest(coalesce(p_respostas, '{}')));
  validas int;
begin
  select * into s from public.sessoes where codigo = upper(btrim(p_codigo));
  if not found then
    raise exception 'Sessão não encontrada.';
  end if;
  if not s.votacao_aberta or s.atividade_foco is distinct from p_atividade then
    raise exception 'A votação desta pergunta está fechada.';
  end if;
  if s.votacao_prazo is not null and now() >= s.votacao_prazo + interval '5 seconds' then
    raise exception 'O tempo para votar acabou.';
  end if;
  if cardinality(ids) = 0 then
    raise exception 'Escolha pelo menos uma ideia.';
  end if;
  if cardinality(ids) > 3 then
    raise exception 'Escolha no máximo 3 ideias.';
  end if;
  if not exists (select 1 from public.participantes where sessao_id = s.id and id = p_participante) then
    raise exception 'Entre na sessão de novo pelo QR code.';
  end if;
  select count(*) into validas from public.respostas r
  where r.id = any(ids) and r.atividade_id = p_atividade and r.visivel and r.teste = s.modo_teste;
  if validas <> cardinality(ids) then
    raise exception 'Uma das ideias escolhidas não está mais disponível. Atualize a tela.';
  end if;

  delete from public.votos where atividade_id = p_atividade and participante_id = p_participante;
  insert into public.votos (sessao_id, atividade_id, resposta_id, participante_id)
  select s.id, p_atividade, unnest(ids), p_participante;
  update public.participantes set visto_em = now() where sessao_id = s.id and id = p_participante;
  return to_jsonb(ids);
end;
$$;
revoke all on function public.votar(text, uuid, uuid, uuid[]) from public;
grant execute on function public.votar(text, uuid, uuid, uuid[]) to anon, authenticated;
grant execute on function public.limpar_ensaio(uuid) to authenticated;
grant execute on function public.sou_facilitador() to authenticated;

-- ------------------------------------------------------------------ cronômetro
-- Abrir o envio (ou trocar de pergunta com o envio aberto) começa o cronômetro
-- no relógio do servidor; fechar o envio zera o prazo. O "+1 min" do painel
-- altera envio_prazo diretamente e não passa por aqui.
create or replace function public._cronometro_envio()
returns trigger
language plpgsql set search_path = public
as $$
begin
  -- abrir a votação fecha o envio; abrir o envio ou trocar de pergunta encerra a votação
  if tg_op = 'UPDATE' then
    -- revelar o resultado encerra a votação; trocar de pergunta, abrir envio ou votação esconde de novo
    if new.resultado_visivel and not old.resultado_visivel then
      new.votacao_aberta := false;
      new.envio_aberto := false;
    elsif new.atividade_foco is distinct from old.atividade_foco
       or (new.envio_aberto and not old.envio_aberto)
       or (new.votacao_aberta and not old.votacao_aberta) then
      new.resultado_visivel := false;
    end if;
    if new.votacao_aberta and not old.votacao_aberta then
      new.envio_aberto := false;
    elsif (new.envio_aberto and not old.envio_aberto) or new.atividade_foco is distinct from old.atividade_foco then
      new.votacao_aberta := false;
    end if;
  end if;
  -- cronômetro da votação: começa ao abrir, zera ao fechar
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

create trigger cronometro_envio before insert or update on public.sessoes
  for each row execute function public._cronometro_envio();

-- ------------------------------------------------------------------ avisos em tempo real

create or replace function public._avisar_mudanca()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  sid uuid;
begin
  if tg_table_name = 'sessoes' then
    if tg_op = 'DELETE' then sid := old.id; else sid := new.id; end if;
  else
    if tg_op = 'DELETE' then sid := old.sessao_id; else sid := new.sessao_id; end if;
  end if;

  begin
    perform realtime.send(jsonb_build_object('tabela', tg_table_name), 'mudou', 'sessao-' || sid::text, false);
  exception when others then
    null; -- o aviso é só um atalho: as telas também consultam periodicamente
  end;
  return null;
end;
$$;
revoke all on function public._avisar_mudanca() from public, anon, authenticated;

create trigger avisar_sessoes after insert or update or delete on public.sessoes
  for each row execute function public._avisar_mudanca();
create trigger avisar_atividades after insert or update or delete on public.atividades
  for each row execute function public._avisar_mudanca();
create trigger avisar_etiquetas after insert or update or delete on public.etiquetas
  for each row execute function public._avisar_mudanca();
create trigger avisar_votos after insert or update or delete on public.votos
  for each row execute function public._avisar_mudanca();
create trigger avisar_respostas after insert or update or delete on public.respostas
  for each row execute function public._avisar_mudanca();

-- ------------------------------------------------------------------ primeiro acesso
-- Libere o time O&O como facilitadores (troque pelos e-mails reais) e crie as
-- contas em Authentication → Users com e-mail e senha:
--
--   insert into public.facilitadores (email) values ('nome@oitoeonze.com');

-- sou_facilitador e limpar_ensaio não precisam ser chamadas sem login
revoke execute on function public.sou_facilitador() from anon;
revoke execute on function public.limpar_ensaio(uuid) from anon;

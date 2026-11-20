import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { backend } from '../backend/index.js';
import { fmtData } from '../lib/util.js';
import { MODELOS } from '../lib/modelos.js';
import { Carregando } from './comum.js';
import { MarcaOO } from '../lib/marca.js';
import { SessaoPainel, nomeStatus } from './sessao.js';

export function Painel({ sessaoId }) {
  const [usuario, setUsuario] = useState(undefined);
  useEffect(() => { backend.usuario().then(setUsuario); }, []);

  if (usuario === undefined) return html`<main class="painel"><${Carregando} /></main>`;
  if (!usuario) return html`<${Login} aoEntrar=${setUsuario} />`;

  return html`<main class="painel">
    <header class="painel-topo">
      <a class="painel-logo" href="#/painel"><${MarcaOO} classe="painel-marca" /> Dinâmica</a>
      <div class="painel-usuario">
        ${backend.modo === 'supabase' ? html`<span class="suave">${usuario.email}</span>` : null}
        ${backend.modo === 'supabase' ? html`<button class="btn btn-fantasma btn-pequeno" onClick=${async () => { await backend.sair(); setUsuario(null); }}>Sair</button>` : null}
      </div>
    </header>
    ${sessaoId ? html`<${SessaoPainel} key=${sessaoId} id=${sessaoId} />` : html`<${ListaSessoes} />`}
  </main>`;
}

function Login({ aoEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [indo, setIndo] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setIndo(true); setErro(null);
    try { aoEntrar(await backend.entrarFacilitador(email.trim(), senha)); } catch (err) { setErro(err.message); } finally { setIndo(false); }
  };
  return html`<main class="painel painel-login">
    <form class="cartao login" onSubmit=${entrar}>
      <div class="painel-logo"><${MarcaOO} classe="painel-marca" /> Dinâmica</div>
      <h1>Entrar no painel</h1>
      <p class="suave">Acesso restrito ao time Oito&Onze.</p>
      <label class="rotulo-campo" for="email">E-mail</label>
      <input id="email" class="campo" type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.currentTarget.value)} required />
      <label class="rotulo-campo" for="senha">Senha</label>
      <input id="senha" class="campo" type="password" autocomplete="current-password" value=${senha} onInput=${(e) => setSenha(e.currentTarget.value)} required />
      ${erro ? html`<p class="aviso aviso-erro">${erro}</p>` : null}
      <button class="btn btn-escuro" disabled=${indo}>${indo ? 'Entrando…' : 'Entrar'}</button>
      <a class="link-discreto" href="#/">Voltar</a>
    </form>
  </main>`;
}

function ListaSessoes() {
  const [lista, setLista] = useState(undefined);
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);
  const [verArquivadas, setVerArquivadas] = useState(false);

  const carregar = () => backend.listarSessoes().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  if (erro) return html`<div class="painel-miolo"><p class="aviso aviso-erro">${erro}</p></div>`;
  if (lista === undefined) return html`<${Carregando} />`;
  const ativas = lista.filter((s) => s.status !== 'arquivada');
  const arquivadas = lista.filter((s) => s.status === 'arquivada');

  return html`<div class="painel-miolo">
    <div class="painel-cabeca">
      <div>
        <h1>Sessões</h1>
        <p class="suave">Cada sessão é uma dinâmica com seu QR code, perguntas e etiquetas.</p>
      </div>
      <button class="btn btn-escuro" onClick=${() => setCriando(true)}>Nova sessão</button>
    </div>
    ${criando ? html`<${NovaSessao} aoCancelar=${() => setCriando(false)} />` : null}
    ${ativas.length ? html`<div class="grade-sessoes">${ativas.map((s) => html`<${CartaoSessao} key=${s.id} s=${s} />`)}</div>`
      : html`<p class="vazio">Nenhuma sessão ainda. Crie a primeira.</p>`}
    ${arquivadas.length ? html`<div class="arquivadas">
      <button class="btn btn-fantasma btn-pequeno" onClick=${() => setVerArquivadas(!verArquivadas)}>
        ${verArquivadas ? 'Esconder' : 'Ver'} arquivadas (${arquivadas.length})
      </button>
      ${verArquivadas ? html`<div class="grade-sessoes">${arquivadas.map((s) => html`<${CartaoSessao} key=${s.id} s=${s} />`)}</div>` : null}
    </div>` : null}
  </div>`;
}

function CartaoSessao({ s }) {
  return html`<a class="cartao cartao-sessao" href=${`#/painel/${s.id}`}>
    <div class="cartao-sessao-topo">
      <span class=${`selo selo-${s.status}`}>${nomeStatus(s.status)}</span>
      ${s.modo_teste ? html`<span class="selo selo-teste">Ensaio</span>` : null}
    </div>
    <h2>${s.nome}</h2>
    <p class="suave">${[s.cliente, fmtData(s.data)].filter(Boolean).join(' · ') || 'Sem cliente'}</p>
    <div class="cartao-sessao-rodape">
      <span class="codigo">${s.codigo}</span>
      <span class="suave">${s.total_respostas} respostas</span>
    </div>
  </a>`;
}

function NovaSessao({ aoCancelar }) {
  const [modelo, setModelo] = useState('cooperar');
  const [nome, setNome] = useState(MODELOS.cooperar.nome);
  const [cliente, setCliente] = useState(MODELOS.cooperar.cliente);
  const [data, setData] = useState('');
  const [erro, setErro] = useState(null);
  const [indo, setIndo] = useState(false);

  const trocar = (m) => { setModelo(m); setNome(MODELOS[m].nome); setCliente(MODELOS[m].cliente); };
  const criar = async (e) => {
    e.preventDefault();
    setIndo(true); setErro(null);
    try {
      const s = await backend.criarSessao({ modelo, nome: nome.trim(), cliente: cliente.trim(), data: data || null });
      location.hash = `#/painel/${s.id}`;
    } catch (err) { setErro(err.message); setIndo(false); }
  };

  return html`<form class="cartao nova-sessao" onSubmit=${criar}>
    <h2>Nova sessão</h2>
    <div class="modelos">
      ${Object.entries(MODELOS).map(([k, m]) => html`<label key=${k} class=${`modelo ${modelo === k ? 'marcado' : ''}`}>
        <input type="radio" name="modelo" checked=${modelo === k} onChange=${() => trocar(k)} />
        <strong>${k === 'cooperar' ? 'Método Cooperar' : 'Em branco'}</strong>
        <span class="suave">${m.descricao}</span>
      </label>`)}
    </div>
    <div class="linha-campos">
      <label class="grupo-campo"><span class="rotulo-campo">Nome</span>
        <input class="campo" value=${nome} onInput=${(e) => setNome(e.currentTarget.value)} required /></label>
      <label class="grupo-campo"><span class="rotulo-campo">Cliente</span>
        <input class="campo" value=${cliente} onInput=${(e) => setCliente(e.currentTarget.value)} /></label>
      <label class="grupo-campo grupo-curto"><span class="rotulo-campo">Data</span>
        <input class="campo" type="date" value=${data} onInput=${(e) => setData(e.currentTarget.value)} /></label>
    </div>
    ${erro ? html`<p class="aviso aviso-erro">${erro}</p>` : null}
    <div class="acoes">
      <button type="button" class="btn btn-fantasma" onClick=${aoCancelar}>Cancelar</button>
      <button class="btn btn-escuro" disabled=${indo}>${indo ? 'Criando…' : 'Criar sessão'}</button>
    </div>
  </form>`;
}

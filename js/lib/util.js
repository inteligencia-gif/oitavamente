import { URL_PUBLICA } from '../config.js';

// Depois que o cronômetro zera, quem já estava escrevendo ainda tem este tempo para enviar.
export const TOLERANCIA_MS = 15_000;
// Na votação a tolerância é só para o toque em "Confirmar" chegar ao servidor.
export const TOLERANCIA_VOTO_MS = 5_000;

export function uid() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* contexto sem https */ }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function gerarCodigo(n = 6) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => ALFABETO[x % ALFABETO.length]).join('');
}

export function normalizarCodigo(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Armazenamento local tolerante a navegação privada / bloqueio.
const memoria = new Map();
export const guardar = {
  ler(k) {
    try { return localStorage.getItem(k); } catch { return memoria.get(k) ?? null; }
  },
  gravar(k, v) {
    try { localStorage.setItem(k, v); } catch { memoria.set(k, v); }
  },
};

// Identificador anônimo do celular, um por sessão.
export function idParticipante(codigo) {
  const k = `oo-dinamica-participante-${codigo}`;
  let id = guardar.ler(k);
  if (!id) { id = uid(); guardar.gravar(k, id); }
  return id;
}

export function urlBase() {
  // testando no próprio computador: os links continuam locais
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
  if (URL_PUBLICA && !local) return URL_PUBLICA.endsWith('/') ? URL_PUBLICA : URL_PUBLICA + '/';
  return location.origin + location.pathname;
}
export const linkParticipante = (codigo) => `${urlBase()}#/s/${codigo}`;
export const linkTelao = (codigo, chave) => `${urlBase()}#/telao/${codigo}?k=${chave}`;
export const linkCurto = () => urlBase().replace(/^https?:\/\//, '').replace(/\/$/, '');

export function fmtHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
export function fmtData(d) {
  if (!d) return '';
  const [a, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
}

export function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

// Numeração estável dos participantes: Participante 1, 2, 3… pela ordem do primeiro envio.
export function numerarParticipantes(respostas) {
  const ordem = new Map();
  [...respostas]
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .forEach((r) => { if (!ordem.has(r.participante_id)) ordem.set(r.participante_id, ordem.size + 1); });
  return ordem;
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

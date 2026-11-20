import { useState, useEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { TOLERANCIA_MS } from './util.js';

export const TOLERANCIA_SEG = TOLERANCIA_MS / 1000;
// Prazo final aceito pelo servidor: o prazo do cronômetro mais a tolerância.
export const prazoFinal = (prazo) => (prazo ? new Date(Date.parse(prazo) + TOLERANCIA_MS).toISOString() : null);

// Diferença entre o relógio do servidor e o deste aparelho, para todos os
// celulares e o telão mostrarem o mesmo tempo mesmo com relógios diferentes.
export function useDesvio(agoraServidor) {
  const desvio = useRef(0);
  useEffect(() => {
    if (agoraServidor) desvio.current = Date.parse(agoraServidor) - Date.now();
  }, [agoraServidor]);
  return desvio;
}

// Segundos que faltam até o prazo (null quando não há cronômetro).
export function useRestante(prazo, desvio) {
  const calcular = () => (prazo ? Math.max(0, Math.ceil((Date.parse(prazo) - (Date.now() + (desvio?.current || 0))) / 1000)) : null);
  const [restante, setRestante] = useState(calcular);
  useEffect(() => {
    setRestante(calcular());
    if (!prazo) return undefined;
    const t = setInterval(() => setRestante(calcular()), 250);
    return () => clearInterval(t);
  }, [prazo]);
  return restante;
}

export function fmtTempo(seg) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Envio realmente aberto: aberto pelo facilitador e dentro do prazo.
export const envioAberto = (sessao, restante) => sessao.envio_aberto && (restante === null || restante > 0);

export function Cronometro({ restante, classe = '', alerta = 60 }) {
  if (restante === null || restante === undefined) return null;
  const fim = restante <= alerta;
  return html`<div class=${`cronometro ${fim ? 'cronometro-fim' : ''} ${restante === 0 ? 'cronometro-zero' : ''} ${classe}`} role="timer" aria-live="off">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2.5h5" /></svg>
    <span>${restante === 0 ? 'Tempo esgotado' : fmtTempo(restante)}</span>
  </div>`;
}

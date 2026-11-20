import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { MarcaOO } from '../lib/marca.js';

let libQR = null;
const carregarQR = () => (libQR ||= import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm').then((m) => m.default || m));

export function QR({ texto, tamanho = 240, escura = '#131313', clara = '#FFFFFF', classe = '' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let ativo = true;
    carregarQR()
      .then((QRCode) => QRCode.toDataURL(texto, { margin: 1, width: tamanho * 2, errorCorrectionLevel: 'M', color: { dark: escura, light: clara } }))
      .then((url) => { if (ativo) setSrc(url); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [texto, tamanho, escura, clara]);
  return html`<div class=${`qr ${classe}`} style=${{ width: tamanho, height: tamanho }}>
    ${src ? html`<img src=${src} alt=${`QR code para ${texto}`} width=${tamanho} height=${tamanho} />` : null}
  </div>`;
}

export function Assinatura({ classe = '' }) {
  return html`<div class=${`assinatura ${classe}`}>
    <${MarcaOO} classe="assinatura-marca" />
    <span>Metodologia Oito&Onze</span>
  </div>`;
}

export function Carregando({ texto = 'Carregando…' }) {
  return html`<div class="centro"><div class="giro" aria-hidden="true"></div><p class="suave">${texto}</p></div>`;
}

export function MarcaCliente({ sessao, classe = '' }) {
  const logo = sessao?.visual?.logo_url;
  return html`<div class=${`marca-cliente ${classe}`}>
    ${logo ? html`<img src=${logo} alt=${sessao.cliente || ''} />` : html`<span>${sessao?.cliente || ''}</span>`}
  </div>`;
}

export function useAgora(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

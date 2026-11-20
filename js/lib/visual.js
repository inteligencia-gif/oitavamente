// Visual por sessão: cores e logo do cliente, assinatura O&O fixa.

// Paleta Oito&Onze: amarelo de destaque, preto da marca (nunca #000) e bege.
export const VISUAL_PADRAO = {
  primaria: '#FCF484', // amarelo O&O (sempre com texto preto)
  escura: '#131313',   // preto O&O
  fundo: '#FFFFFF',    // branco (o bege O&O #E7E5DC fica para detalhes)
  logo_url: '',
};

function rgb(hex) {
  const h = String(hex || '').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0);
}

function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Texto legível sobre uma cor de fundo.
export function textoSobre(hex) {
  return luminancia(hex) > 0.45 ? '#131313' : '#FFFFFF';
}

// Variáveis CSS do tema, para aplicar no style de um contêiner.
export function varsVisual(visual) {
  const v = { ...VISUAL_PADRAO, ...(visual || {}) };
  return {
    '--primaria': v.primaria,
    // cor de destaque para textos: a principal se ela aparece no fundo, senão a escura
    '--primaria-texto': contraste(v.primaria, v.fundo) >= 3 ? v.primaria : v.escura,
    '--sobre-primaria': textoSobre(v.primaria),
    '--escura': v.escura,
    '--sobre-escura': textoSobre(v.escura),
    '--fundo': v.fundo,
    '--tinta': textoSobre(v.fundo) === '#FFFFFF' ? '#F7F5F0' : v.escura,
  };
}

export function varsEtiqueta(cor) {
  return { '--cor': cor || '#888888', '--sobre-cor': textoSobre(cor || '#888888') };
}

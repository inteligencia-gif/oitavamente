import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { backend } from '../backend/index.js';

// Busca o estado, ouve os avisos de mudança da sessão e faz uma consulta
// periódica de reserva (se o tempo real cair, a tela continua atualizando).
export function useAoVivo(carregar, deps, { intervalo = 5000, filtro = () => true } = {}) {
  const [dados, setDados] = useState(undefined);
  const [erro, setErro] = useState(null);
  const ref = useRef({ carregar, filtro });
  ref.current = { carregar, filtro };

  const recarregar = useCallback(async () => {
    try {
      const d = await ref.current.carregar();
      setDados(d);
      setErro(null);
      return d;
    } catch (e) {
      setErro(e);
      return undefined;
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    let parar = null;
    let pendente = null;
    let emCurso = false;
    let deNovo = false;

    const buscar = async () => {
      if (emCurso) { deNovo = true; return; }
      emCurso = true;
      const d = await recarregar();
      emCurso = false;
      if (!ativo) return;
      const sid = d?.sessao?.id;
      if (sid && !parar) {
        parar = backend.ouvir(sid, (ev) => {
          if (!ref.current.filtro(ev)) return;
          clearTimeout(pendente);
          pendente = setTimeout(buscar, 250);
        });
      }
      if (deNovo) { deNovo = false; buscar(); }
    };

    setDados(undefined);
    buscar();
    const timer = setInterval(buscar, intervalo);
    const visivel = () => { if (document.visibilityState === 'visible') buscar(); };
    document.addEventListener('visibilitychange', visivel);
    addEventListener('online', buscar);
    return () => {
      ativo = false;
      clearInterval(timer);
      clearTimeout(pendente);
      parar?.();
      document.removeEventListener('visibilitychange', visivel);
      removeEventListener('online', buscar);
    };
  }, deps);

  return { dados, erro, recarregar };
}

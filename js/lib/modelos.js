import { VISUAL_PADRAO } from './visual.js';

// Modelos para começar uma sessão. O texto de cada problemática é editado no painel.
export const MODELOS = {
  cooperar: {
    nome: 'Método Cooperar de Atendimento',
    descricao: '11 problemáticas, uma pergunta para cada, etiquetas “Na agência” e “Na cooperativa”',
    cliente: 'Unicred',
    rotulo_atividade: 'Problemática',
    visual: { ...VISUAL_PADRAO },
    etiquetas: [
      { nome: 'Na agência', cor: '#FFE45C' },
      { nome: 'Na cooperativa', cor: '#7ED99A' },
    ],
    atividades: Array.from({ length: 11 }, (_, i) => ({
      titulo: `Problemática ${i + 1}`,
      texto_apoio: '',
    })),
  },
  branco: {
    nome: 'Nova dinâmica',
    descricao: 'Uma pergunta e duas etiquetas para editar',
    cliente: '',
    rotulo_atividade: 'Pergunta',
    visual: { ...VISUAL_PADRAO },
    etiquetas: [
      { nome: 'Etiqueta 1', cor: '#FFE45C' },
      { nome: 'Etiqueta 2', cor: '#7ED99A' },
    ],
    atividades: [{ titulo: 'Escreva aqui a pergunta', texto_apoio: '' }],
  },
};

// Cores das etiquetas, em tons pastel: amarelo, verde, azul, laranja, rosa e roxo.
// A mesma cor aparece no celular, no mural ao vivo, nos post-its e na legenda do telão.
export const CORES_ETIQUETA = ['#FFE45C', '#7ED99A', '#7DB8FF', '#FFAA5C', '#FF8FBF', '#B99BFF'];

# Ferramenta de Dinâmica O&O — MVP

O participante entra pelo QR code, responde pelo celular sem login e as respostas aparecem ao vivo no telão.
Este MVP cobre a dinâmica do Método Cooperar com a Unicred.

## Telas

| Endereço | Quem usa | O que faz |
|---|---|---|
| `#/s/CODIGO` | Participante (link do QR code) | Vê a pergunta aberta, escreve, marca a etiqueta e envia |
| `#/telao/CODIGO?k=CHAVE` | Telão | Tela de entrada com QR code, pergunta em foco, cartões ao vivo, contadores |
| `#/` ou `#/painel` | Facilitador | Sessões, condução ao vivo, moderação, configuração e exportação |

## Como rodar

É um site estático, sem etapa de build: HTML, CSS e módulos JavaScript (Preact e htm via CDN).

```bash
python3 -m http.server 5173
```

Abra `http://localhost:5173/#/painel`.

### Modo demonstração (padrão)

Sem as chaves do Supabase em `js/config.js`, tudo roda no navegador: os dados ficam no `localStorage`,
e cada aba faz o papel de um celular. Serve para ensaiar o roteiro sozinho, mas não conecta os celulares da sala.
Já vem uma sessão pronta com o código **COOP11**.

### Modo real (Supabase)

1. Rode `supabase/migrations/001_dinamica.sql` no projeto (SQL Editor ou `supabase db push`).
2. Em Authentication → Users, crie as contas do time O&O (e-mail e senha).
3. Libere essas contas como facilitadores:
   `insert into public.facilitadores (email) values ('nome@oitoeonze.com');`
4. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` em `js/config.js` (Project Settings → API).
5. Publique a pasta em qualquer hospedagem estática (Netlify, Vercel, Cloudflare Pages, GitHub Pages)
   e coloque o endereço final em `URL_PUBLICA`, que é o que vai no QR code.

## Segurança

- Participante e telão não leem tabelas: só chamam as funções `entrar_sessao`, `enviar_resposta` e `telao_estado`,
  que conferem código, envio aberto, etiqueta, limite de caracteres e limite de envios (10 por minuto por celular).
- O telão precisa de uma chave própria, que aparece só no painel.
- Só e-mails da tabela `facilitadores` acessam o painel.
- Anônimo por padrão: o celular recebe um identificador aleatório, sem nome.

## Roteiro do dia

1. **Antes:** crie a sessão a partir do modelo "Método Cooperar", escreva as 11 problemáticas em Configurar e ensaie em modo ensaio com vários celulares.
2. **Começar pra valer:** apaga as respostas do ensaio e volta o telão para a tela do QR code.
3. **Durante:** "Começar" abre a problemática 1. Depois é só "Fechar envio", conversar e clicar em "Próxima".
   Ao abrir cada problemática começa um cronômetro (8 minutos por padrão, ajustável em Configurar; 0 desliga).
   Ele aparece no telão, no celular e no painel, fica amarelo no último minuto e fecha o envio ao zerar. O painel tem "+1 min".
   Quando o envio fecha, o telão mostra todas as respostas da pergunta na visão escolhida no painel: Post-its, Nuvem de palavras ou Por etiqueta.
   **Votação:** com o envio fechado, "Abrir votação" leva todas as respostas da pergunta para os celulares. Cada pessoa escolhe até 3 prioridades e pode mudar até a votação fechar. A votação tem 1 minuto por padrão (ajustável em Configurar; 0 desliga), com "+1 min" no painel, e fecha sozinha ao zerar.
   O telão mostra só quantas pessoas votaram. O ranking aparece apenas no painel (ordem "Mais votadas") e na planilha.
   Depois de encerrar, "Mostrar as 3 mais votadas" revela as prioridades no telão e nos celulares (empates no 3º lugar aparecem todos). O ranking completo continua só no painel.
4. **Depois:** clique em "Exportar planilha", que gera as abas Respostas (com votos), Prioridades e Resumo.

## Fora do MVP (v2)

Destacar, agrupar, revelar depois, relatório em PDF e síntese com IA.
O banco já tem o campo `grupo_id` em `respostas`, reservado para o agrupamento.

// Configuração da Ferramenta de Dinâmica O&O.
//
// Sem SUPABASE_URL e SUPABASE_ANON_KEY a ferramenta roda em MODO DEMONSTRAÇÃO:
// os dados ficam só neste navegador e as abas conversam entre si
// (bom para ensaiar sozinho, mas os celulares da sala não se conectam).
//
// Para usar de verdade, aplique supabase/migrations/001_dinamica.sql no projeto
// Supabase e preencha as duas chaves abaixo (Project Settings → API).
export const SUPABASE_URL = 'https://rgpsmckovzrchclxtmha.supabase.co';
// chave pública (anon): pode ficar no site; a segurança está nas regras do banco
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJncHNtY2tvdnpyY2hjbHh0bWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxODA2NzUsImV4cCI6MjExMDc1NjY3NX0.OEklDwq-RfqBlqqBWjrF2NJW1395jL2RKa8Trxf00Rk';

// Endereço público onde a ferramenta está publicada.
// É o que vai no QR code. Vazio = usa o endereço aberto no navegador.
export const URL_PUBLICA = 'https://sala.oitavamente.com/';

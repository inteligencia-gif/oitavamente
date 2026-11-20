-- (já incluído no fim do 001) sou_facilitador e limpar_ensaio não precisam ser chamadas sem login
revoke execute on function public.sou_facilitador() from anon;
revoke execute on function public.limpar_ensaio(uuid) from anon;

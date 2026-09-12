-- Roda uma vez só, na primeira inicialização do container (volume vazio).
-- Cria o banco de teste, separado do banco de desenvolvimento, para os testes
-- automatizados nunca encostarem nos locais reais.
CREATE DATABASE paguessr_test;

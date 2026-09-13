export function normalizeNick(nick: string): string {
  return nick.toLowerCase();
}

// Filtro básico, só pra bloquear os casos mais óbvios (nomes reservados +
// alguns termos ofensivos comuns em PT/EN). Não é moderação de conteúdo
// completa — é um "filtro básico de palavrão", como o escopo pede.
const BLOCKED_SUBSTRINGS = [
  'admin',
  'root',
  'moderator',
  'moderador',
  'suporte',
  'support',
  'system',
  'paguessr',
  'fuck',
  'shit',
  'bitch',
  'puta',
  'porra',
  'caralho',
  'buceta',
  'viado',
  'corno',
  'merda',
];

export function containsBlockedWord(nick: string): boolean {
  const lower = nick.toLowerCase();
  return BLOCKED_SUBSTRINGS.some((word) => lower.includes(word));
}

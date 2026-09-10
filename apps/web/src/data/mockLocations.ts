import type { LocationPoint } from '../types';

export const MOCK_LOCATIONS: LocationPoint[] = [
  {
    id: 'loc-1',
    name: 'Cachoeira de Paulo Afonso & Mirante',
    description: 'Imponente complexo de quedas d’água no cânion do Rio São Francisco, ponto histórico das usinas hidrelétricas da Chesf.',
    category: 'Natureza & Cânion',
    coords: {
      lat: -9.3985,
      lng: -38.204,
    },
    imagePlaceholderText: 'Mirante com vista para o cânion profundo do Rio São Francisco e paredões rochosos avermelhados com as comportas da usina ao fundo.',
  },
  {
    id: 'loc-2',
    name: 'Monumento O Touro e a Sucuri',
    description: 'Monumento lendário localizado no Parque Belvedere, simbolizando a força das águas dominada para a geração de energia elétrica.',
    category: 'Monumento & Praça',
    coords: {
      lat: -9.4045,
      lng: -38.2195,
    },
    imagePlaceholderText: 'Escultura imponente em relevo do touro e da sucuri em praça gramada cercada por palmeiras e vista para o canal de drenagem.',
  },
  {
    id: 'loc-3',
    name: 'Igreja de São Francisco de Assis',
    description: 'Primeira igreja de alvenaria de Paulo Afonso, erguida em 1949 com pedras típicas da região sobre uma colina no centro histórico.',
    category: 'Patrimônio Histórico',
    coords: {
      lat: -9.4038,
      lng: -38.2162,
    },
    imagePlaceholderText: 'Fachada rústica de pedras aparentes, torre sineira lateral característica e jardins arborizados ao redor da colina.',
  },
  {
    id: 'loc-4',
    name: 'Ponte Metálica Presidente Dutra',
    description: 'Ponte histórica inaugurada nos anos 50 sobre o cânion do Rio São Francisco, conectando a Bahia ao estado de Alagoas.',
    category: 'Engenharia & Cartão-Postal',
    coords: {
      lat: -9.3932,
      lng: -38.1965,
    },
    imagePlaceholderText: 'Estrutura de treliça de aço vermelha suspensa sobre o abismo do cânion do Velho Chico com águas verdes esmeralda abaixo.',
  },
  {
    id: 'loc-5',
    name: 'Balneário Prainha (Ayrton Senna)',
    description: 'Tradicional ponto de encontro e banho no lago da Ilha de Paulo Afonso, com quiosques e vista ampla das águas calmas.',
    category: 'Lazer & Orla',
    coords: {
      lat: -9.4185,
      lng: -38.2255,
    },
    imagePlaceholderText: 'Orla arborizada com quiosques à beira do lago, faixa de areia e banhistas aproveitando o pôr do sol no espelho d’água.',
  },
];

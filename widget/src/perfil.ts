/**
 * Atendimento conforme o site onde o widget está colado: boas-vindas, menu de assuntos e convite
 * proativo falam do processo daquele site. Endereço desconhecido usa o perfil geral da COPERSE.
 */
export type Perfil = { boasVindas: string; sugestoes: string[]; convite: string };

const FINAL = 'Eu respondo com base nas páginas oficiais e mostro de onde veio cada informação.';

const GERAL: Perfil = {
  boasVindas: `Olá! Tire dúvidas sobre o Vestibular, o SiSU, os processos seletivos específicos e os cursos de graduação da FURG. ${FINAL}`,
  sugestoes: [
    'O que está com inscrição aberta agora?',
    'Quando são as inscrições do Vestibular?',
    'Como funciona o SiSU?',
    'Quais são as formas de ingresso?',
  ],
  convite: 'Dúvidas sobre os processos seletivos da FURG? Posso ajudar.',
};

const SISU: Perfil = {
  boasVindas: `Olá! Tire dúvidas sobre o SiSU na FURG: inscrição, chamadas, lista de espera, cotas e matrícula. ${FINAL}`,
  sugestoes: [
    'Como funciona o SiSU na FURG?',
    'Como funciona a lista de espera?',
    'Quais documentos preciso para a matrícula?',
    'Como funcionam as cotas?',
  ],
  convite: 'Dúvidas sobre o SiSU na FURG? Posso ajudar.',
};

const VESTIBULAR: Perfil = {
  boasVindas: `Olá! Tire dúvidas sobre o Vestibular FURG: inscrição, isenção da taxa, provas, vagas e resultados. ${FINAL}`,
  sugestoes: [
    'Quando são as inscrições do Vestibular?',
    'Qual é o valor da inscrição?',
    'Como peço isenção da taxa?',
    'Quando e onde é a prova?',
  ],
  convite: 'Dúvidas sobre o Vestibular FURG? Posso ajudar.',
};

export function perfilDoSite(host: string): Perfil {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (/^sisu\d*\.furg\.br$/.test(h)) return SISU;
  if (h === 'vestibular.furg.br') return VESTIBULAR;
  return GERAL;
}

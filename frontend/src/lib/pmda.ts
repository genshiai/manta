const PMDA_BASE_URL = 'https://www.pmda.go.jp/PmdaSearch/rdSearch/02';
const validYjCodePattern = /^[0-9A-Z]{12}$/;

export const buildPmdaDrugInfoUrl = (
  yjCode?: string,
  audience: 'medical' | 'consumer' = 'medical',
): string | undefined => {
  if (!yjCode) {
    return undefined;
  }

  const normalized = yjCode.normalize('NFKC').trim().toUpperCase();
  if (!validYjCodePattern.test(normalized)) {
    return undefined;
  }

  const user = audience === 'medical' ? '1' : '2';
  return `${PMDA_BASE_URL}/${normalized}?user=${user}`;
};

export type CompanyStatus = 'active' | 'liquidation' | 'dissolved';
export function companyStatus(company: { name: string; dissolved: string | null }): CompanyStatus {
  if (company.dissolved) return 'dissolved';
  const name = company.name.normalize('NFD').replace(/\p{M}/gu, '');
  return /\bv likvidaci\b/i.test(name) ? 'liquidation' : 'active';
}

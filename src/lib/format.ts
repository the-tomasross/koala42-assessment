export function date(value: string | null | undefined): string {
  if (!value) return 'Not reported';
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!match) return value;
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

export function companyCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'company' : 'companies'}`;
}

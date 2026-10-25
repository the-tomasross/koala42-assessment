const roles: Record<string, string> = {
  'jednatel': 'Managing director',
  'předseda představenstva': 'Chair of the board',
  'místopředseda představenstva': 'Vice-chair of the board',
  'člen představenstva': 'Board member',
  'předseda dozorčí rady': 'Chair of the supervisory board',
  'místopředseda dozorčí rady': 'Vice-chair of the supervisory board',
  'člen dozorčí rady': 'Supervisory board member',
  'likvidátor': 'Liquidator',
  'prokurista': 'Authorised signatory (prokura)',
  'předseda': 'Chair',
  'místopředseda': 'Vice-chair',
  'člen': 'Member',
  'člen statutárního orgánu': 'Member of the statutory body',
  'komplementář': 'General partner',
  'komanditista': 'Limited partner',
  'společník': 'Partner',
  'ředitel': 'Director',
  'statutární ředitel': 'Statutory director',
  'předseda kontrolní komise': 'Chair of the audit committee',
  'člen kontrolní komise': 'Audit committee member',
  'předseda správní rady': 'Chair of the administrative board',
  'člen správní rady': 'Administrative board member',
};

export function translateRole(role: string): { label: string; original?: string } {
  const original = role.trim();
  const key = original.toLocaleLowerCase('cs');
  const label = Object.hasOwn(roles, key) ? roles[key] : undefined;
  return label ? { label, original } : { label: original };
}

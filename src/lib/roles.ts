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
  'prokura': 'Authorised signatory (prokura)',
  'předseda rady jednatelů': 'Chair of the board of managing directors',
  'člen rady jednatelů': 'Member of the board of managing directors',
  'předseda družstva': 'Chair of the cooperative',
  'místopředseda družstva': 'Vice-chair of the cooperative',
  'výkonný ředitel': 'Executive director',
  'pověřený zmocněnec společníka': "Partner's authorised representative",
};

// The register uses the feminine form for women ("předsedkyně představenstva").
const feminine: Record<string, string> = {
  'předsedkyně': 'předseda', 'místopředsedkyně': 'místopředseda', 'členka': 'člen',
  'jednatelka': 'jednatel', 'likvidátorka': 'likvidátor', 'prokuristka': 'prokurista',
  'ředitelka': 'ředitel', 'společnice': 'společník', 'komplementářka': 'komplementář',
  'komanditistka': 'komanditista',
};

export function translateRole(role: string): { label: string; original?: string } {
  const original = role.trim().replace(/\s+/g, ' ').replace(/[\s:.,;]+$/, '');
  const key = original.toLocaleLowerCase('cs').replace(/\p{L}+/gu, (w) => Object.hasOwn(feminine, w) ? feminine[w] : w);
  const label = Object.hasOwn(roles, key) ? roles[key] : undefined;
  return label ? { label, original } : { label: original };
}

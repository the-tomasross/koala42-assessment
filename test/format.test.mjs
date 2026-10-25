import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyCount } from '../src/lib/format.ts';
import { companyStatus } from '../src/lib/status.ts';
import { translateRole } from '../src/lib/roles.ts';

test('company counts use singular only for one', () => {
  assert.equal(companyCount(0), '0 companies');
  assert.equal(companyCount(1), '1 company');
  assert.equal(companyCount(2), '2 companies');
  assert.equal(companyCount(1234), '1,234 companies');
});

test('dissolution takes priority and liquidation ignores case and accents', () => {
  assert.equal(companyStatus({ name: 'Test v likvidaci', dissolved: '2020-01-01' }), 'dissolved');
  assert.equal(companyStatus({ name: 'Test V LIKVIDACI, s.r.o.', dissolved: null }), 'liquidation');
  assert.equal(companyStatus({ name: 'Test v likvidací', dissolved: null }), 'liquidation');
  assert.equal(companyStatus({ name: 'Test v likvidacich', dissolved: null }), 'active');
  assert.equal(companyStatus({ name: 'Test', dissolved: null }), 'active');
});

test('roles translate every supported term and preserve the Czech original', () => {
  const cases = [
    ['jednatel', 'Managing director'],
    ['předseda představenstva', 'Chair of the board'],
    ['místopředseda představenstva', 'Vice-chair of the board'],
    ['člen představenstva', 'Board member'],
    ['předseda dozorčí rady', 'Chair of the supervisory board'],
    ['místopředseda dozorčí rady', 'Vice-chair of the supervisory board'],
    ['člen dozorčí rady', 'Supervisory board member'],
    ['likvidátor', 'Liquidator'],
    ['prokurista', 'Authorised signatory (prokura)'],
    ['předseda', 'Chair'], ['místopředseda', 'Vice-chair'], ['člen', 'Member'],
    ['člen statutárního orgánu', 'Member of the statutory body'],
    ['komplementář', 'General partner'], ['komanditista', 'Limited partner'],
    ['společník', 'Partner'], ['ředitel', 'Director'], ['statutární ředitel', 'Statutory director'],
    ['předseda kontrolní komise', 'Chair of the audit committee'],
    ['člen kontrolní komise', 'Audit committee member'],
    ['předseda správní rady', 'Chair of the administrative board'],
    ['člen správní rady', 'Administrative board member'],
  ];
  for (const [original, label] of cases) {
    assert.deepEqual(translateRole(`  ${original.toLocaleUpperCase('cs')}  `), { label, original: original.toLocaleUpperCase('cs') });
  }
  assert.deepEqual(translateRole(' neznámá funkce '), { label: 'neznámá funkce' });
  assert.deepEqual(translateRole('constructor'), { label: 'constructor' });
});

import { describe, expect, it } from 'vitest';
import { CATEGORY_OF_KIND, Problem, StepKind } from '../shared/model';
import { checkLatex, extractMath } from '../shared/latex';

const card = (text: string, correct = false) => ({ text, correct, explanation: `por qué ${text}` });
const step = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  kind: 'identify',
  prompt: '¿Cuál?',
  hint: 'pista',
  cards: [card('a', true), card('b'), card('c'), card('d')],
  ...over,
});
const problem = (steps: unknown[]) => ({ id: 'x', version: 1, subject: 'probabilidad', topic: 't', title: 'T', statement: 'E', steps });

describe('Problem', () => {
  it('acepta un problema válido', () => {
    expect(Problem.safeParse(problem([step()])).success).toBe(true);
  });
  it('exige al menos una carta correcta', () => {
    const r = Problem.safeParse(problem([step({ cards: [card('a'), card('b'), card('c'), card('d')] })]));
    expect(r.success).toBe(false);
  });
  it('exige exactamente 4 cartas', () => {
    expect(Problem.safeParse(problem([step({ cards: [card('a', true), card('b'), card('c')] })])).success).toBe(false);
  });
  it('rechaza explicaciones vacías', () => {
    const cards = [card('a', true), card('b'), card('c'), { text: 'd', correct: false, explanation: '  ' }];
    expect(Problem.safeParse(problem([step({ cards })])).success).toBe(false);
  });
  it('rechaza textos repetidos (ignora mayúsculas y espacios)', () => {
    const cards = [card('Binomial', true), card(' binomial '), card('c'), card('d')];
    expect(Problem.safeParse(problem([step({ cards })])).success).toBe(false);
  });
  it('exige hint y version', () => {
    const { hint: _h, ...noHint } = step();
    expect(Problem.safeParse(problem([noHint])).success).toBe(false);
    const { version: _v, ...noVersion } = problem([step()]);
    expect(Problem.safeParse(noVersion).success).toBe(false);
  });
  it('rechaza ids de paso repetidos', () => {
    expect(Problem.safeParse(problem([step(), step()])).success).toBe(false);
  });
});

describe('categorías', () => {
  it('cada kind tiene categoría', () => {
    for (const k of StepKind.options) expect(CATEGORY_OF_KIND[k]).toBeDefined();
    expect(CATEGORY_OF_KIND.parameters).toBe('distribucion');
    expect(CATEGORY_OF_KIND.interpret).toBe('calculo');
  });
});

describe('LaTeX', () => {
  it('extrae inline y display, respeta \\$', () => {
    const { segments } = extractMath('cuesta \\$5, $a+b$ y $$\\int_0^1 x\\,dx$$');
    expect(segments).toEqual([
      { tex: 'a+b', display: false },
      { tex: '\\int_0^1 x\\,dx', display: true },
    ]);
  });
  it('detecta errores de compilación', () => {
    expect(checkLatex('$\\frac{1}{2}$')).toEqual([]);
    expect(checkLatex('$\\frac{1}{$')).toHaveLength(1);
    expect(checkLatex('$\\noexiste$')).toHaveLength(1);
  });
  it('detecta $ sin cerrar', () => {
    expect(checkLatex('precio $x')).toHaveLength(1);
  });
});

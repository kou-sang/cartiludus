// Modelo de contenido de Cartiludus. Los JSON de `content/` se validan con estos esquemas en `build:content`.
import { z } from 'zod';

/** Slug de materia, tema o problema: minúsculas, dígitos y guiones. */
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido (a-z, 0-9, guiones)');

/** Tipo de paso. Determina la categoría de resumen (ver CATEGORY_OF_KIND). */
export const StepKind = z.enum(['identify', 'distribution', 'parameters', 'property', 'setup', 'compute', 'interpret']);
export type StepKind = z.infer<typeof StepKind>;

/** Categorías del resumen de partida y de los agregados en `pq_users`. */
export const CATEGORIES = ['identificarVA', 'distribucion', 'propiedad', 'calculo'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  identificarVA: 'Identificar VA',
  distribucion: 'Distribución',
  propiedad: 'Propiedad',
  calculo: 'Cálculo',
};

export const CATEGORY_OF_KIND: Record<StepKind, Category> = {
  identify: 'identificarVA',
  distribution: 'distribucion',
  parameters: 'distribucion',
  property: 'propiedad',
  setup: 'calculo',
  compute: 'calculo',
  interpret: 'calculo',
};

const Text = z.string().trim().min(1, 'texto vacío');

/** Carta: texto + si es correcta + explicación (se muestra al elegirla o al revelar). */
export const Card = z.object({
  text: Text,
  correct: z.boolean(),
  explanation: Text,
});
export type Card = z.infer<typeof Card>;

export const Step = z
  .object({
    id: Slug,
    kind: StepKind,
    prompt: Text,
    /** Obligatoria. Usarla hace que el acierto valga 0. */
    hint: Text,
    /** Segundos para responder; sin valor = sin límite. Agotado = paso fallado + revelar. */
    timeLimitSec: z.number().int().positive().max(600).optional(),
    cards: z.array(Card).length(4, 'cada paso lleva exactamente 4 cartas'),
  })
  .superRefine((step, ctx) => {
    if (!step.cards.some((c) => c.correct)) {
      ctx.addIssue({ code: 'custom', path: ['cards'], message: 'al menos una carta correcta' });
    }
    const seen = new Set<string>();
    step.cards.forEach((c, i) => {
      const key = normalize(c.text);
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['cards', i, 'text'], message: 'texto de carta repetido' });
      seen.add(key);
    });
  });
export type Step = z.infer<typeof Step>;

export const Problem = z
  .object({
    id: Slug,
    /** Se incrementa al cambiar el contenido: el historial guarda id + versión. */
    version: z.number().int().positive(),
    /** Validada contra los `meta.json` en build:content. */
    subject: Slug,
    topic: Slug,
    title: Text,
    statement: Text,
    difficulty: z.number().int().min(1).max(5).optional(),
    steps: z.array(Step).min(1),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    p.steps.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: 'custom', path: ['steps', i, 'id'], message: 'id de paso repetido' });
      ids.add(s.id);
    });
  });
export type Problem = z.infer<typeof Problem>;

export const SubjectMeta = z.object({
  id: Slug,
  name: Text,
  order: z.number().int().optional(),
  topics: z.array(z.object({ id: Slug, name: Text, order: z.number().int().optional() })).min(1),
});
export type SubjectMeta = z.infer<typeof SubjectMeta>;

/** Índice global emitido en `public/content/index.json`. */
export interface ContentIndex {
  generatedAt: string;
  subjects: Array<{
    id: string;
    name: string;
    topics: Array<{
      id: string;
      name: string;
      /** Ruta del bundle del tema, relativa al sitio. */
      bundle: string;
      problems: Array<{ id: string; version: number; title: string; difficulty?: number; steps: number }>;
    }>;
  }>;
}

/** Bundle por tema: `public/content/<materia>/<tema>.json`. */
export interface TopicBundle {
  subject: string;
  topic: string;
  problems: Problem[];
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

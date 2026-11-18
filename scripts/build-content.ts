// Valida `content/` y emite `public/content/index.json` + un bundle por tema.
// Uso: npm run build:content   (falla con código 1 si hay errores; no escribe nada en ese caso)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Problem, SubjectMeta, type ContentIndex, type TopicBundle } from '../shared/model';
import { checkLatex } from '../shared/latex';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'public', 'content');

const errors: string[] = [];
const err = (file: string, msg: string) => errors.push(`${relative(ROOT, file)}: ${msg}`);

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(file, `JSON inválido (${e instanceof Error ? e.message : e})`);
    return undefined;
  }
}

const dirs = (path: string) => readdirSync(path).filter((n) => statSync(join(path, n)).isDirectory()).sort();
const jsonFiles = (path: string) => readdirSync(path).filter((n) => n.endsWith('.json')).sort();

function latexFields(p: Problem): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['title', p.title],
    ['statement', p.statement],
  ];
  p.steps.forEach((s, i) => {
    out.push([`steps[${i}].prompt`, s.prompt], [`steps[${i}].hint`, s.hint]);
    s.cards.forEach((c, j) => {
      out.push([`steps[${i}].cards[${j}].text`, c.text], [`steps[${i}].cards[${j}].explanation`, c.explanation]);
    });
  });
  return out;
}

const index: ContentIndex = { generatedAt: new Date().toISOString(), subjects: [] };
const bundles: Array<{ path: string; bundle: TopicBundle }> = [];
const problemIds = new Map<string, string>();

if (!existsSync(CONTENT)) {
  console.error('[build:content] no existe content/');
  process.exit(1);
}

const subjectDirs = dirs(CONTENT);
const metas: SubjectMeta[] = [];
for (const subjectDir of subjectDirs) {
  const metaFile = join(CONTENT, subjectDir, 'meta.json');
  if (!existsSync(metaFile)) {
    err(join(CONTENT, subjectDir), 'falta meta.json');
    continue;
  }
  const parsed = SubjectMeta.safeParse(readJson(metaFile));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) err(metaFile, `${issue.path.join('.') || '(raíz)'}: ${issue.message}`);
    continue;
  }
  if (parsed.data.id !== subjectDir) err(metaFile, `id "${parsed.data.id}" ≠ carpeta "${subjectDir}"`);
  metas.push(parsed.data);
}
const subjectIds = new Set(metas.map((m) => m.id));

for (const meta of [...metas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))) {
  const subjectPath = join(CONTENT, meta.id);
  const declared = new Set(meta.topics.map((t) => t.id));
  for (const d of dirs(subjectPath)) if (!declared.has(d)) err(join(subjectPath, d), 'tema no declarado en meta.json');

  const entry: ContentIndex['subjects'][number] = { id: meta.id, name: meta.name, topics: [] };
  for (const topic of [...meta.topics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))) {
    const topicPath = join(subjectPath, topic.id);
    if (!existsSync(topicPath)) {
      err(join(subjectPath, 'meta.json'), `tema "${topic.id}" declarado sin carpeta`);
      continue;
    }
    const problems: Problem[] = [];
    for (const name of jsonFiles(topicPath)) {
      const file = join(topicPath, name);
      const parsed = Problem.safeParse(readJson(file));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) err(file, `${issue.path.join('.') || '(raíz)'}: ${issue.message}`);
        continue;
      }
      const p = parsed.data;
      if (`${p.id}.json` !== name) err(file, `id "${p.id}" ≠ nombre de archivo`);
      if (!subjectIds.has(p.subject)) err(file, `subject "${p.subject}" no existe en ningún meta.json`);
      else if (p.subject !== meta.id) err(file, `subject "${p.subject}" ≠ carpeta "${meta.id}"`);
      if (p.topic !== topic.id) err(file, `topic "${p.topic}" ≠ carpeta "${topic.id}"`);
      const prev = problemIds.get(p.id);
      if (prev) err(file, `id "${p.id}" repetido (también en ${prev})`);
      problemIds.set(p.id, relative(ROOT, file));
      for (const [field, text] of latexFields(p)) {
        for (const issue of checkLatex(text)) err(file, `${field}: LaTeX «${issue.tex}» → ${issue.message}`);
      }
      problems.push(p);
    }
    const bundlePath = `content/${meta.id}/${topic.id}.json`;
    bundles.push({ path: bundlePath, bundle: { subject: meta.id, topic: topic.id, problems } });
    entry.topics.push({
      id: topic.id,
      name: topic.name,
      bundle: `/${bundlePath}`,
      problems: problems.map((p) => ({
        id: p.id,
        version: p.version,
        title: p.title,
        ...(p.difficulty !== undefined ? { difficulty: p.difficulty } : {}),
        steps: p.steps.length,
      })),
    });
  }
  index.subjects.push(entry);
}

if (errors.length > 0) {
  console.error(`[build:content] ${errors.length} error(es):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
for (const { path, bundle } of bundles) {
  const file = join(ROOT, 'public', path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(bundle));
}
const total = [...problemIds.keys()].length;
console.log(`[build:content] OK: ${metas.length} materia(s), ${bundles.length} tema(s), ${total} problema(s).`);

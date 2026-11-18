// Extracción y compilación de LaTeX embebido: `$...$` (inline) y `$$...$$` (display). `\$` es un dólar literal.
import katex from 'katex';

export interface MathSegment {
  tex: string;
  display: boolean;
}

export interface LatexIssue {
  tex: string;
  message: string;
}

/** Devuelve los fragmentos de LaTeX y un error si hay delimitadores sin cerrar. */
export function extractMath(text: string): { segments: MathSegment[]; unclosed: boolean } {
  const segments: MathSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '$') {
      i += 2;
      continue;
    }
    if (ch !== '$') {
      i++;
      continue;
    }
    const display = text[i + 1] === '$';
    const open = display ? 2 : 1;
    const close = findClose(text, i + open, display);
    if (close < 0) return { segments, unclosed: true };
    segments.push({ tex: text.slice(i + open, close), display });
    i = close + open;
  }
  return { segments, unclosed: false };
}

function findClose(text: string, from: number, display: boolean): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') {
      j++;
      continue;
    }
    if (text[j] === '$' && (!display || text[j + 1] === '$')) return j;
  }
  return -1;
}

/** Compila cada fragmento con KaTeX en modo estricto. Lista vacía = todo compila. */
export function checkLatex(text: string): LatexIssue[] {
  const { segments, unclosed } = extractMath(text);
  const issues: LatexIssue[] = [];
  if (unclosed) issues.push({ tex: text, message: 'delimitador $ sin cerrar' });
  for (const { tex, display } of segments) {
    if (tex.trim() === '') {
      issues.push({ tex, message: 'fórmula vacía' });
      continue;
    }
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'error' });
    } catch (error) {
      issues.push({ tex, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return issues;
}

// Texto con LaTeX embebido ($...$ / $$...$$), renderizado con KaTeX.
import katex from 'katex';
import { useMemo } from 'react';
import { extractMath } from '../../shared/latex';

export function Tex({ children }: { children: string }) {
  const html = useMemo(() => render(children), [children]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(/\\\$/g, '$');
}

function render(text: string): string {
  const { segments } = extractMath(text);
  let out = '';
  let rest = text;
  for (const { tex, display } of segments) {
    const delim = display ? '$$' : '$';
    const token = `${delim}${tex}${delim}`;
    const at = rest.indexOf(token);
    if (at < 0) break;
    out += escape(rest.slice(0, at));
    out += katex.renderToString(tex, { displayMode: display, throwOnError: false });
    rest = rest.slice(at + token.length);
  }
  return out + escape(rest);
}

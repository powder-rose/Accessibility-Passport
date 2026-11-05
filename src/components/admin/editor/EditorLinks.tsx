import type { Editor } from '@tiptap/react';
export interface EditorLink {
  from: number;
  to: number;
  href: string;
  text: string;
}
export function editorLinks(editor: Editor): EditorLink[] {
  const links: EditorLink[] = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText) return;
    const mark = node.marks.find((mark) => mark.type.name === 'link');
    if (!mark) return;
    const previous = links.at(-1);
    const href = String(mark.attrs.href || '');
    if (previous && previous.to === position && previous.href === href) {
      previous.to = position + node.nodeSize;
      previous.text += node.text || '';
    } else
      links.push({
        from: position,
        to: position + node.nodeSize,
        href,
        text: node.text || '',
      });
  });
  return links;
}
export default function EditorLinks({
  links,
  onSelect,
  onEdit,
  onRemove,
}: {
  links: EditorLink[];
  onSelect: (link: EditorLink) => void;
  onEdit: (link: EditorLink) => void;
  onRemove: (link: EditorLink) => void;
}) {
  return (
    <section className="editor-links" aria-label="Ссылки в статье">
      <h3>Ссылки в статье ({links.length})</h3>
      {!links.length && <p>В тексте статьи ссылок нет.</p>}
      {links.map((link) => (
        <div className="editor-links__item" key={link.from}>
          <button type="button" onClick={() => onSelect(link)}>
            <strong>{link.text || 'Ссылка без текста'}</strong>
            <small>{link.href}</small>
          </button>
          <div>
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              Открыть ↗
            </a>
            <button type="button" onClick={() => onEdit(link)}>
              Изменить
            </button>
            <button type="button" onClick={() => onRemove(link)}>
              Удалить
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

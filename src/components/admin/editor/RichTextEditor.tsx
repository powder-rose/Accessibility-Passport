import { useEffect, useReducer, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { safeArticleLink } from '@/features/articles/links';
import EditorToolbar from './EditorToolbar';
import EditorLinks, { editorLinks, type EditorLink } from './EditorLinks';
import EditorLinkDialog from './EditorLinkDialog';
import { imageSelectionError, uploadImage } from '../articles/api';

const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    };
  },
});
export default function RichTextEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (content: string) => void;
  disabled?: boolean;
}) {
  const [, refresh] = useReducer((value) => value + 1, 0);
  const [linksOpen, setLinksOpen] = useState(false);
  const [link, setLink] = useState<{
    href: string;
    from: number;
    to: number;
  }>();
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          isAllowedUri: (url) => safeArticleLink(url),
        },
      }),
      ArticleImage.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Текст статьи',
        'aria-multiline': 'true',
      },
    },
    onTransaction: () => refresh(),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML())
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
  }, [value, editor]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);
  if (!editor) return <p role="status">Загрузка редактора…</p>;
  const links = editorLinks(editor);
  const select = (item: EditorLink) =>
    editor
      .chain()
      .focus()
      .setTextSelection({ from: item.from, to: item.to })
      .run();
  async function addImage(file: File) {
    const problem = imageSelectionError(file);
    setError(problem);
    if (problem) return;
    setUploading(true);
    try {
      const image = await uploadImage(file);
      const alt = window.prompt('Введите описание изображения') || '';
      editor!
        .chain()
        .focus()
        .setImage({
          src: image.url,
          alt,
          ...{ width: image.width, height: image.height },
        })
        .run();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить изображение.',
      );
    } finally {
      setUploading(false);
    }
  }
  function editLink() {
    if (editor!.state.selection.empty && !editor!.isActive('link')) {
      setError('Сначала выделите текст для ссылки.');
      return;
    }
    if (editor!.isActive('link')) editor!.chain().extendMarkRange('link').run();
    const { from, to } = editor!.state.selection;
    setLink({
      href: String(editor!.getAttributes('link').href || ''),
      from,
      to,
    });
    setError('');
  }
  return (
    <div className="article-editor-shell">
      <EditorToolbar
        editor={editor}
        linksOpen={linksOpen}
        linksCount={links.length}
        onLink={editLink}
        onLinks={() => setLinksOpen(!linksOpen)}
        onImage={addImage}
        disabled={disabled || uploading}
      />
      {linksOpen && (
        <EditorLinks
          links={links}
          onSelect={select}
          onEdit={(item) => setLink(item)}
          onRemove={(item) =>
            editor
              .chain()
              .focus()
              .setTextSelection({ from: item.from, to: item.to })
              .unsetLink()
              .run()
          }
        />
      )}
      <EditorContent editor={editor} className="article-editor-content" />
      {uploading && <p role="status">Загрузка изображения…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {link && (
        <EditorLinkDialog
          value={link.href}
          onClose={() => setLink(undefined)}
          onSave={(href) => {
            const chain = editor
              .chain()
              .focus()
              .setTextSelection({ from: link.from, to: link.to });
            if (href) chain.setLink({ href }).run();
            else chain.unsetLink().run();
            setLink(undefined);
          }}
        />
      )}
    </div>
  );
}

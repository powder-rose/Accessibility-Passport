import type { Editor } from '@tiptap/react';
export default function EditorToolbar({
  editor,
  linksOpen,
  linksCount,
  onLink,
  onLinks,
  onImage,
  disabled,
}: {
  editor: Editor;
  linksOpen: boolean;
  linksCount: number;
  onLink: () => void;
  onLinks: () => void;
  onImage: (file: File) => void;
  disabled: boolean;
}) {
  const tools = [
    {
      label: 'B',
      title: 'Полужирный',
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'I',
      title: 'Курсив',
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'H2',
      title: 'Заголовок второго уровня',
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'H3',
      title: 'Заголовок третьего уровня',
      active: editor.isActive('heading', { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: '• Список',
      title: 'Маркированный список',
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: '1. Список',
      title: 'Нумерованный список',
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Ссылка',
      title: 'Добавить или изменить ссылку',
      active: editor.isActive('link'),
      run: onLink,
    },
    {
      label: `Ссылки (${linksCount})`,
      title: 'Ссылки в статье',
      active: linksOpen,
      run: onLinks,
    },
    {
      label: 'Tx',
      title: 'Очистить форматирование',
      active: false,
      run: () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
    },
    {
      label: 'Врезка',
      title: 'Выделенный блок',
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Таблица',
      title: 'Вставить таблицу 3 × 3',
      active: editor.isActive('table'),
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];
  const tableTools = [
    [
      '+ строка',
      'Добавить строку снизу',
      () => editor.chain().focus().addRowAfter().run(),
    ],
    [
      '− строка',
      'Удалить текущую строку',
      () => editor.chain().focus().deleteRow().run(),
    ],
    [
      '+ столбец',
      'Добавить столбец справа',
      () => editor.chain().focus().addColumnAfter().run(),
    ],
    [
      '− столбец',
      'Удалить текущий столбец',
      () => editor.chain().focus().deleteColumn().run(),
    ],
    [
      'Удалить таблицу',
      'Удалить всю таблицу',
      () => editor.chain().focus().deleteTable().run(),
    ],
  ] as const;
  return (
    <div
      className="editor-toolbar"
      role="toolbar"
      aria-label="Форматирование текста"
    >
      {tools.map((tool) => (
        <button
          key={tool.title}
          type="button"
          title={tool.title}
          aria-label={tool.title}
          aria-pressed={tool.active}
          disabled={disabled}
          onClick={tool.run}
        >
          {tool.label}
        </button>
      ))}
      {editor.isActive('table') &&
        tableTools.map(([label, title, run]) => (
          <button
            key={title}
            type="button"
            title={title}
            disabled={disabled}
            onClick={run}
          >
            {label}
          </button>
        ))}
      <label className="editor-upload-control">
        Изображение
        <input
          type="file"
          aria-label="Изображение в тексте"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImage(file);
            event.target.value = '';
          }}
        />
      </label>
      <button
        type="button"
        title="Отменить"
        aria-label="Отменить"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </button>
      <button
        type="button"
        title="Повторить"
        aria-label="Повторить"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </button>
    </div>
  );
}

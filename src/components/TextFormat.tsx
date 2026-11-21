import { useEditorState, type Editor } from '@tiptap/react'

const marks = [
  { mark: 'bold', glyph: 'B', label: 'Жирный' },
  { mark: 'italic', glyph: 'I', label: 'Курсив' },
  { mark: 'underline', glyph: 'U', label: 'Подчеркнуть' },
] as const

export function TextFormat({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
    }),
  })
  return (
    <div className="text-format" role="group" aria-label="Форматирование">
      {marks.map(({ mark, glyph, label }) => (
        <button key={mark} type="button" className={`text-format-${mark}`}
          title={label} aria-label={label} aria-pressed={active[mark]}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleMark(mark).run()}>
          {glyph}
        </button>
      ))}
    </div>
  )
}

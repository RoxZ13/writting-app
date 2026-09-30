import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { ProjectData } from '../lib/hooks'

const WIDTH = 190
const GAP = 8

/**
 * Margin notes on the margin, as on a manuscript page: each open note sits next to the words
 * it belongs to. Only when the screen has room beside the text; otherwise they stay in the
 * scene plan, as before. A tap opens the note.
 */
export function MarginNotes({ data, editor, onOpen }: { data: ProjectData; editor: Editor | null; onOpen: (noteId: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{ id: string; top: number; text: string }[]>([])

  useEffect(() => {
    if (!editor) return
    let frame = 0
    const layout = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const wrap = box.current?.parentElement
        const area = wrap?.parentElement
        if (!wrap || !area) return
        const w = wrap.getBoundingClientRect()
        // Room to the right of the text column?
        if (area.getBoundingClientRect().right - w.right < WIDTH + 24) return setPlaced([])
        const seen = new Set<string>()
        const out: { id: string; top: number; text: string }[] = []
        let floor = -Infinity
        editor.view.dom.querySelectorAll<HTMLElement>('[data-comment]').forEach((el) => {
          const id = el.getAttribute('data-comment')!
          if (seen.has(id)) return
          seen.add(id)
          const note = data.notes.find((n) => n.id === id)
          if (!note || note.archived) return
          // Stacked below each other when anchors are close, never on top of one another.
          const top = Math.max(el.getBoundingClientRect().top - w.top, floor)
          out.push({ id, top, text: note.text })
          floor = top + 22 + Math.ceil(note.text.length / 26) * 18 + GAP
        })
        setPlaced(out)
      })
    }
    layout()
    editor.on('update', layout)
    window.addEventListener('resize', layout)
    const ro = new ResizeObserver(layout)
    if (box.current?.parentElement?.parentElement) ro.observe(box.current.parentElement.parentElement)
    return () => {
      cancelAnimationFrame(frame)
      editor.off('update', layout)
      window.removeEventListener('resize', layout)
      ro.disconnect()
    }
  }, [editor, data.notes])

  return (
    <div ref={box} className="margin-notes" aria-label="Заметки на полях">
      {placed.map((n) => (
        <button key={n.id} className="margin-note" style={{ top: n.top, width: WIDTH }} onClick={() => onOpen(n.id)}>
          <span className="margin-note-k">на полях</span>
          {n.text}
        </button>
      ))}
    </div>
  )
}

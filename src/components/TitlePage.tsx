import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../db/db'
import { patch } from '../db/repo'
import { go } from '../lib/router'
import { UNTITLED } from '../lib/stories'

const setFresh = (on: boolean) => {
  window.dispatchEvent(new CustomEvent('manuscript:fresh', { detail: on }))
}

/** The first words of the first phrase, as a working title: «Он вернул ключи, не глядя…». */
export function titleFromText(text: string): string | undefined {
  // A line of dialogue starts with a dash; the title does not need it.
  const words = text.trim().replace(/^[—–-]\s*/, '').split(/\s+/).filter(Boolean)
  if (words.length < 3) return undefined
  const cut = words.slice(0, 6).join(' ').replace(/[\s,;:—–-]+$/, '')
  return words.length > 6 ? `${cut.replace(/[.!?…]+$/, '')}…` : cut.replace(/\.$/, '')
}

/**
 * The title page of a brand-new story: its name and what it is about, on the page itself, above
 * the text — no form to fill before writing. Both are optional. Below them, a quiet door to the
 * board for those who plan first; it fades with the first letter. Shown only when the story is
 * empty on opening, so the page never jumps while the author types.
 */
export function TitlePage({ project, editor, empty }: { project: Project; editor: Editor | null; empty: boolean }) {
  const [shown] = useState(empty)
  const [title, setTitle] = useState(project.title === UNTITLED ? '' : project.title)
  const [about, setAbout] = useState(project.premise ?? '')
  const [typed, setTyped] = useState(false)
  const named = useRef(project.title !== UNTITLED)
  const started = useRef(false)

  useEffect(() => {
    if (!shown) return
    setFresh(true)
    return () => setFresh(false)
  }, [shown])

  useEffect(() => {
    if (!shown || !editor) return
    const onUpdate = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return
      setTyped(true)
      setFresh(false)
      // The first words move a new story from «идея» to «пишу».
      if (project.stage === 'idea' && !started.current) {
        started.current = true
        void patch<Project>('projects', project.id, { stage: 'writing' })
      }
      // No name given: the first phrase becomes a working title, changeable right here.
      if (!named.current) {
        const first = editor.state.doc.firstChild?.textContent ?? ''
        const done = /[.!?…]\s*$/.test(first) || editor.state.doc.childCount > 1
        const t = done ? titleFromText(first) : undefined
        if (t) {
          named.current = true
          setTitle(t)
          void patch<Project>('projects', project.id, { title: t })
        }
      }
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [shown, editor, project.id, project.stage])

  if (!shown) return null
  const saveTitle = () => {
    const t = title.trim()
    if (t) named.current = true
    if ((t || UNTITLED) !== project.title) void patch<Project>('projects', project.id, { title: t || UNTITLED })
  }
  const saveAbout = () => about.trim() !== (project.premise ?? '') && void patch<Project>('projects', project.id, { premise: about.trim() || undefined })
  const toText = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown') return
    e.preventDefault()
    ;(e.target as HTMLInputElement).blur()
    editor?.commands.focus('end')
  }

  return (
    <div className="title-page">
      <input
        className="tp-title"
        aria-label="Название истории"
        placeholder={UNTITLED}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={toText}
      />
      <input
        className="tp-about"
        aria-label="О чём история"
        placeholder="О чём история — если уже знаешь"
        value={about}
        onChange={(e) => setAbout(e.target.value)}
        onBlur={saveAbout}
        onKeyDown={toText}
      />
      <button className={`link-plain tp-door ${typed ? 'gone' : ''}`} tabIndex={typed ? -1 : 0} onClick={() => go({ view: 'board' })}>
        или сначала — сцены из головы → Доска
      </button>
      <div className="tp-rule" />
    </div>
  )
}

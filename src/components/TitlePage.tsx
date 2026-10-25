import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../db/db'
import { patch } from '../db/repo'

const setFresh = (on: boolean) => {
  window.dispatchEvent(new CustomEvent('manuscript:fresh', { detail: on }))
}

/**
 * A brand-new story opening: nothing on the page but the scene and the cursor. The story keeps
 * whatever name the author gives it in the header — it is never taken from the text. The first
 * words move the story from «идея» to «пишу».
 */
export function TitlePage({ project, editor, empty }: { project: Project; editor: Editor | null; empty: boolean }) {
  const [shown] = useState(empty)
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
      setFresh(false)
      // The first words move a new story from «идея» to «пишу».
      if (project.stage === 'idea' && !started.current) {
        started.current = true
        void patch<Project>('projects', project.id, { stage: 'writing' })
      }
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [shown, editor, project.id, project.stage])

  return null
}

import { Modal } from '../lib/ui'

/** One lightweight choice, not an onboarding form: both paths stay available afterwards. */
export function StartStoryChoice({
  busy,
  onChoose,
  onClose,
}: {
  busy: boolean
  onChoose: (view: 'text' | 'board') => void
  onClose: () => void
}) {
  return (
    <Modal label="Новая история" onClose={onClose} className="start-story-choice">
      <div className="stack">
        <h2>С чего начнём?</h2>
        <button className="btn primary big" disabled={busy} onClick={() => onChoose('text')}>
          Начать с фразы
        </button>
        <button className="btn big" disabled={busy} onClick={() => onChoose('board')}>
          Набросать сцены
        </button>
        <div className="small muted">Между текстом и планом можно переключаться в любой момент.</div>
      </div>
    </Modal>
  )
}

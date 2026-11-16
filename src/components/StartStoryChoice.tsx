import { Modal } from '../lib/ui'
import { Icon } from './Icon'

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
        <h2>Как начнём?</h2>
        <button className="start-path primary" disabled={busy} onClick={() => onChoose('text')}>
          <Icon name="pen" size={20} />
          <span>Писать главу</span>
          <Icon name="right" size={18} />
        </button>
        <button className="start-path" disabled={busy} onClick={() => onChoose('board')}>
          <Icon name="plan" size={20} />
          <span>Разложить по сценам</span>
          <Icon name="right" size={18} />
        </button>
      </div>
    </Modal>
  )
}

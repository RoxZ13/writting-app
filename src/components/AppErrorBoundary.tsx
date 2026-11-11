import { Component, type ErrorInfo, type ReactNode } from 'react'
import { downloadBackup } from '../lib/backup'

interface State {
  error?: Error
  backupError?: string
  busy?: boolean
}

/** A render failure must never turn the library into an unexplained blank screen. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Manuscript screen failed', error, info.componentStack)
  }

  private backup = async () => {
    this.setState({ busy: true, backupError: undefined })
    try {
      await downloadBackup()
    } catch (error) {
      this.setState({ backupError: error instanceof Error ? error.message : 'Не получилось создать копию' })
    } finally {
      this.setState({ busy: false })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-page">
        <section className="card fatal-card" role="alert">
          <div className="fatal-mark" aria-hidden="true">!</div>
          <h1>Экран не открылся</h1>
          <p>Книги остаются в хранилище этого устройства. Сначала скачайте аварийную копию, затем перезагрузите Manuscript.</p>
          <div className="row fatal-actions">
            <button className="btn primary" disabled={this.state.busy} onClick={() => void this.backup()}>
              {this.state.busy ? 'Создаю копию…' : 'Скачать аварийную копию'}
            </button>
            <button className="btn" onClick={() => location.reload()}>Перезагрузить</button>
          </div>
          {this.state.backupError && <p className="small" style={{ color: 'var(--danger-ink)' }}>{this.state.backupError}</p>}
          <details className="small muted">
            <summary>Технические подробности</summary>
            <pre className="fatal-details">{this.state.error.message || String(this.state.error)}</pre>
          </details>
        </section>
      </main>
    )
  }
}

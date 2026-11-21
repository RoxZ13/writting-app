import { useEffect, useState } from 'react'
import { download, exportDocx, loadChapters } from '../lib/exporter'
import type { ProjectData } from '../lib/hooks'
import { Modal, toast } from '../lib/ui'

export function BookExport({ data, chapterId, onClose }: { data: ProjectData; chapterId?: string; onClose: () => void }) {
  const [scope, setScope] = useState(chapterId ?? 'book')
  const [result, setResult] = useState<{ scope: string; file?: File }>()
  const file = result?.scope === scope ? result.file : undefined
  const chapterTitle = chapterId ? data.chapterById.get(chapterId)?.title : undefined
  const nativeShare = /\bManuscript(?:IOS|Mac)\//.test(navigator.userAgent)
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }))

  useEffect(() => {
    let cancelled = false
    const prepare = async () => {
      try {
        const chapters = await loadChapters(data, scope === 'book' ? undefined : scope)
        const title = scope === 'book' ? data.project.title : chapters[0]?.chapter.title ?? data.project.title
        const blob = await exportDocx(data.project.title, chapters)
        if (!cancelled) setResult({ scope, file: new File([blob], title.replace(/[\\/:*?"<>|]/g, '_') + '.docx', { type: blob.type }) })
      } catch {
        if (!cancelled) setResult({ scope })
      }
    }
    void prepare()
    return () => { cancelled = true }
  }, [data, scope])

  const share = async () => {
    if (!file) return
    // The installed app sends downloads to the system share sheet.
    if (nativeShare) return download(file, file.name)
    try {
      await navigator.share({ files: [file] })
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') toast('Не удалось открыть отправку. Можно скачать файл.')
    }
  }

  return (
    <Modal label="Экспорт Word" onClose={onClose} className="book-export stack">
      <h2>Экспорт Word</h2>
      {chapterTitle && <label>Что экспортировать
        <select className="input" value={scope} onChange={(event) => { setResult(undefined); setScope(event.target.value) }}>
          <option value={chapterId}>{chapterTitle}</option>
          <option value="book">Вся книга</option>
        </select>
      </label>}
      <div className="row">
        {(nativeShare || canShare) && <button className="btn primary" disabled={!file} onClick={() => void share()}>Поделиться</button>}
        {!nativeShare && <button className={canShare ? 'btn' : 'btn primary'} disabled={!file} onClick={() => file && download(file, file.name)}>Скачать .docx</button>}
        <button className="btn ghost" onClick={onClose}>Закрыть</button>
      </div>
      {!file && <p role="status" className="small muted">{result?.scope === scope ? 'Не удалось собрать файл.' : 'Готовится файл…'}</p>}
    </Modal>
  )
}

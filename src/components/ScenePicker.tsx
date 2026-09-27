import type { ProjectData } from '../lib/hooks'

export function ScenePicker({
  data,
  value,
  onChange,
  emptyLabel,
  className = 'select',
}: {
  data: ProjectData
  value: string | undefined
  onChange: (id: string | undefined) => void
  emptyLabel: string
  className?: string
}) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{emptyLabel}</option>
      {data.outline.map(({ chapter, scenes }, i) => (
        <optgroup key={chapter.id} label={`${i + 1}. ${chapter.title}`}>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

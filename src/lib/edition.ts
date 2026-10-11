import { db, uid, type Chapter, type Character, type Line, type Marker, type Note, type Project, type Scene, type SceneText, type Snapshot } from '../db/db'
import { alive, save } from '../db/repo'
import { emptyDoc } from './text'

/** «Геката Сотейра» → «Геката Сотейра — редакция 2»; «… — редакция 2» → «… — редакция 3». */
export function editionTitle(title: string): string {
  const m = title.match(/^(.*) — редакция (\d+)$/)
  return m ? `${m[1]} — редакция ${Number(m[2]) + 1}` : `${title} — редакция 2`
}

/**
 * «Новая редакция»: the same book rewritten from its own skeleton. A new story with the same
 * chapters, scenes, their goals and beats, branches, heroes, lore and markers — but empty pages.
 * Each scene keeps its old text beside the new one («Было»), so the old edition is a crib,
 * not a draft to patch. The old story stays untouched.
 */
export async function newEdition(projectId: string): Promise<{ projectId: string; firstSceneId?: string }> {
  const old = await db.projects.get(projectId)
  if (!old) throw new Error('no project')
  const now = Date.now()
  const [chapters, scenes, lines, characters, markers, notes] = await Promise.all([
    db.chapters.where('projectId').equals(projectId).toArray().then(alive),
    db.scenes.where('projectId').equals(projectId).toArray().then(alive),
    db.lines.where('projectId').equals(projectId).toArray().then(alive),
    db.characters.where('projectId').equals(projectId).toArray().then(alive),
    db.markers.where('projectId').equals(projectId).toArray().then(alive),
    db.notes.toArray().then((n) => alive(n).filter((x) => x.projectId === projectId && x.kind === 'lore')),
  ])
  const ids = new Map<string, string>()
  const id = (oldId: string) => {
    if (!ids.has(oldId)) ids.set(oldId, uid())
    return ids.get(oldId)!
  }
  const map = (list?: string[]) => list?.map((x) => ids.get(x)).filter((x): x is string => !!x)

  const p: Project = {
    id: uid(),
    title: editionTitle(old.title),
    createdAt: now,
    updatedAt: 0,
    description: old.description,
    color: old.color,
    genre: old.genre,
    stage: 'writing',
    premise: old.premise,
    ending: old.ending,
    drive: old.drive,
    targetChapters: old.targetChapters,
    targetWords: old.targetWords,
    dailyGoal: old.dailyGoal,
    platform: old.platform,
    publishEvery: old.publishEvery,
    ficbookUrl: old.ficbookUrl,
    chapterMin: old.chapterMin,
    chapterMax: old.chapterMax,
    pageChars: old.pageChars,
    lengthUnit: old.lengthUnit,
  }
  await save<Project>('projects', p)

  for (const l of lines) await save<Line>('lines', { ...l, id: id(l.id), projectId: p.id, updatedAt: 0 })
  for (const c of characters) await save<Character>('characters', { ...c, id: id(c.id), projectId: p.id, ignoreSceneIds: undefined, updatedAt: 0 })
  for (const c of chapters)
    await save<Chapter>('chapters', { ...c, id: id(c.id), projectId: p.id, publishedAt: undefined, locked: undefined, updatedAt: 0 })

  const ordered = [...scenes].sort(
    (a, b) => (chapters.find((c) => c.id === a.chapterId)?.order ?? 0) - (chapters.find((c) => c.id === b.chapterId)?.order ?? 0) || a.order - b.order,
  )
  let firstSceneId: string | undefined
  for (const s of scenes) id(s.id)
  for (const s of ordered) {
    const sid = id(s.id)
    const text = await db.texts.get(s.id)
    let rewriteFrom: string | undefined
    // The old text goes beside the new page as «Было».
    if (text && s.wordCount > 0) {
      const snap = await save<Snapshot>('snapshots', {
        id: uid(),
        sceneId: sid,
        projectId: p.id,
        content: text.content,
        wordCount: text.wordCount,
        reason: 'Прежняя редакция',
        createdAt: now,
        updatedAt: now,
      })
      rewriteFrom = snap.id
    }
    const scene: Scene = {
      id: sid,
      projectId: p.id,
      chapterId: ids.get(s.chapterId) ?? s.chapterId,
      title: s.title,
      order: s.order,
      status: 'idea',
      goal: s.goal,
      beats: s.beats.map((b) => ({ ...b, done: false })),
      wordCount: 0,
      charCount: 0,
      epigraph: s.epigraph,
      lineIds: map(s.lineIds),
      characterIds: map(s.characterIds),
      heat: s.heat,
      rewriteFrom,
      updatedAt: 0,
    }
    await save<Scene>('scenes', scene)
    await save<SceneText>('texts', { id: sid, projectId: p.id, content: emptyDoc(), wordCount: 0, updatedAt: 0 })
    if (!chapters.find((c) => c.id === s.chapterId)?.pool) firstSceneId ??= sid
  }

  for (const m of markers)
    await save<Marker>('markers', {
      ...m,
      id: uid(),
      projectId: p.id,
      setupSceneId: m.setupSceneId && ids.get(m.setupSceneId),
      payoffSceneId: m.payoffSceneId && ids.get(m.payoffSceneId),
      setupChapterId: m.setupChapterId && ids.get(m.setupChapterId),
      payoffChapterId: m.payoffChapterId && ids.get(m.payoffChapterId),
      echoSceneIds: map(m.echoSceneIds),
      resolved: false,
      createdAt: now,
      updatedAt: 0,
    })
  for (const n of notes)
    await save<Note>('notes', {
      ...n,
      id: uid(),
      projectId: p.id,
      sceneId: n.sceneId && ids.get(n.sceneId),
      sceneIds: map(n.sceneIds),
      chapterIds: map(n.chapterIds),
      characterIds: map(n.characterIds),
      ignoreSceneIds: undefined,
      updatedAt: 0,
    })

  const cover = await db.texts.get(`cover:${projectId}`)
  if (cover) await save<SceneText>('texts', { ...cover, id: `cover:${p.id}`, projectId: p.id, updatedAt: 0 })
  if (firstSceneId) await save<Project>('projects', { ...p, lastSceneId: firstSceneId })
  return { projectId: p.id, firstSceneId }
}

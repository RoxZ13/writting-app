import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SceneText } from '../db/db'
import { save } from '../db/repo'

/**
 * A book's cover picture. It lives in its own record (id `cover:<projectId>`) so the image travels to
 * the cloud once, not with every change to the project.
 */
const coverId = (projectId: string) => `cover:${projectId}`

export function useCover(projectId: string): string | undefined {
  return useLiveQuery(async () => {
    const t = await db.texts.get(coverId(projectId))
    return t && !t.deleted ? (t.content as { src?: string } | undefined)?.src || undefined : undefined
  }, [projectId])
}

export async function setCover(projectId: string, src: string | undefined) {
  const existing = await db.texts.get(coverId(projectId))
  await save<SceneText>('texts', { ...(existing ?? { id: coverId(projectId), projectId, wordCount: 0, updatedAt: 0 }), content: { src: src ?? '' } })
}

/** Scale a picture down to cover size and keep it as a JPEG data URL, so it works offline. */
export async function imageToCover(blob: Blob, maxSide = 900): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  return canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * A picture from a link. When the site lets the browser read the image, it is saved inside the app
 * (works offline); otherwise the link itself is kept and the picture loads from the site.
 */
export async function coverFromUrl(url: string): Promise<{ src: string; offline: boolean }> {
  const clean = url.trim()
  if (!/^https?:\/\//i.test(clean)) throw new Error('Нужна ссылка, которая начинается с https://')
  try {
    const res = await fetch(clean, { mode: 'cors' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) throw new Error('not an image')
    return { src: await imageToCover(blob), offline: true }
  } catch {
    // Check that it is at least a picture the browser can show.
    await new Promise<void>((ok, fail) => {
      const img = new Image()
      img.onload = () => ok()
      img.onerror = () => fail(new Error('По этой ссылке не нашлась картинка'))
      img.src = clean
    })
    return { src: clean, offline: false }
  }
}

/** A picture copied elsewhere (long press → «Скопировать» on a phone, right click → «Копировать изображение»). */
export async function coverFromClipboard(): Promise<string> {
  if (!navigator.clipboard?.read) throw new Error('Этот браузер не даёт вставить картинку — сохрани её и выбери файлом')
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) return imageToCover(await item.getType(type))
  }
  throw new Error('В буфере нет картинки. Скопируй обложку и попробуй снова')
}

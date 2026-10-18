import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from '../firebase'
import { compressImage } from './imageCompress'
import { docPath, examStoragePrefix } from './paths'

const PARALLEL_UPLOADS = 3

// Storage files belonging to one ExamImage (images uploaded before thumbnails existed have none)
export function imageFiles(image) {
  return [image.path, image.thumbPath].filter(Boolean)
}

function deleteImageFiles(image) {
  return Promise.all(imageFiles(image).map(deleteFile))
}

function deleteFile(path) {
  return deleteObject(ref(storage, path)).catch((error) => {
    if (error.code !== 'storage/object-not-found') console.warn(`Could not delete ${path}`, error)
  })
}

// Read-modify-write of the exam's `images` array inside a transaction, so two admins
// uploading or reordering at the same time don't overwrite each other.
async function updateImages(examIds, change) {
  const examRef = doc(db, docPath(examIds))
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(examRef)
    if (!snapshot.exists()) throw Object.assign(new Error('الامتحان غير موجود'), { code: 'not-found' })
    const { images, result } = change(snapshot.data().images ?? [])
    tx.update(examRef, { images, updatedAt: serverTimestamp() })
    return result
  })
}

// Compresses and uploads one file to Storage; returns its ExamImage metadata.
async function uploadOne(examIds, file, onProgress) {
  const { blob, width, height, extension, thumb } = await compressImage(file)
  const id = crypto.randomUUID()
  const prefix = examStoragePrefix(examIds)
  const path = `${prefix}/${id}.${extension}`
  const thumbPath = `${prefix}/${id}_thumb.${thumb.extension}`

  const total = blob.size + thumb.blob.size
  const task = uploadBytesResumable(ref(storage, path), blob, { contentType: blob.type })
  task.on('state_changed', (s) => onProgress(s.bytesTransferred / total))
  await task
  try {
    const thumbTask = uploadBytesResumable(ref(storage, thumbPath), thumb.blob, {
      contentType: thumb.blob.type,
    })
    thumbTask.on('state_changed', (s) => onProgress((blob.size + s.bytesTransferred) / total))
    await thumbTask
    const [url, thumbUrl] = await Promise.all([
      getDownloadURL(ref(storage, path)),
      getDownloadURL(ref(storage, thumbPath)),
    ])
    // serverTimestamp() isn't allowed inside arrays, so use the client clock
    return { id, url, path, thumbUrl, thumbPath, width, height, size: blob.size, uploadedAt: Timestamp.now() }
  } catch (error) {
    await Promise.all([deleteFile(path), deleteFile(thumbPath)])
    throw error
  }
}

/**
 * Uploads `files` and appends them, in the given order, to the exam's images.
 * onProgress(index, { progress, status, error }) is called per file.
 * Resolves with the number of files that failed.
 */
export async function uploadExamImages(examIds, files, onProgress) {
  const results = new Array(files.length)
  let next = 0

  async function worker() {
    while (next < files.length) {
      const i = next++
      try {
        onProgress(i, { progress: 0, status: 'uploading' })
        results[i] = await uploadOne(examIds, files[i], (progress) =>
          onProgress(i, { progress, status: 'uploading' }),
        )
        onProgress(i, { progress: 1, status: 'saving' })
      } catch (error) {
        onProgress(i, { progress: 0, status: 'error', error })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, files.length) }, worker))

  const uploaded = results.filter(Boolean)
  if (uploaded.length > 0) {
    try {
      await updateImages(examIds, (images) => ({ images: [...images, ...uploaded] }))
    } catch (error) {
      // Don't leave files in Storage that no exam points to
      await Promise.all(uploaded.map(deleteImageFiles))
      results.forEach((image, i) => image && onProgress(i, { progress: 0, status: 'error', error }))
      throw error
    }
  }
  results.forEach((image, i) => image && onProgress(i, { progress: 1, status: 'done' }))
  return files.length - uploaded.length
}

// `orderedIds` is the new page order. Images added meanwhile by someone else stay, at the end.
export function reorderExamImages(examIds, orderedIds) {
  return updateImages(examIds, (images) => {
    const byId = new Map(images.map((image) => [image.id, image]))
    const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean)
    const rest = images.filter((image) => !orderedIds.includes(image.id))
    return { images: [...reordered, ...rest] }
  })
}

export async function deleteExamImage(examIds, imageId) {
  const removed = await updateImages(examIds, (images) => ({
    images: images.filter((image) => image.id !== imageId),
    result: images.find((image) => image.id === imageId),
  }))
  // The doc no longer references the files, so a failure here only leaves orphan files
  if (removed) await deleteImageFiles(removed)
}

// Uploads `file` in place of `imageId`, keeping its position.
export async function replaceExamImage(examIds, imageId, file, onProgress = () => {}) {
  const image = await uploadOne(examIds, file, onProgress)
  let old
  try {
    old = await updateImages(examIds, (images) => {
      const index = images.findIndex((x) => x.id === imageId)
      if (index === -1) throw Object.assign(new Error('الصورة لم تعد موجودة'), { code: 'not-found' })
      return { images: images.with(index, image), result: images[index] }
    })
  } catch (error) {
    await deleteImageFiles(image)
    throw error
  }
  await deleteImageFiles(old)
}

import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import {
  deleteByToken,
  FULL_TRANSFORM,
  ROOT_FOLDER,
  THUMB_TRANSFORM,
  transformedUrl,
  uploadImage,
} from './cloudinary'
import { compressImage } from './imageCompress'
import { docPath, examStoragePrefix } from './paths'

const PARALLEL_UPLOADS = 3

// Images live on Cloudinary. Deleting there needs the API secret, which can't be in the
// browser, so removing an image only removes it from Firestore (it disappears from the app);
// the Cloudinary file stays until it's cleaned up with the secret outside the app.

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

// Compresses (≤2000px WebP, so uploads stay small on slow connections) and uploads one
// image or PDF page; returns its ExamImage metadata plus the short-lived delete token.
async function uploadOne(examIds, source, onProgress) {
  const { blob } = await compressImage(source)
  const id = crypto.randomUUID()
  const uploaded = await uploadImage(blob, {
    folder: `${ROOT_FOLDER}/${examStoragePrefix(examIds)}`,
    publicId: id,
    onProgress,
  })
  return {
    image: {
      id,
      publicId: uploaded.public_id,
      url: transformedUrl(uploaded.secure_url, FULL_TRANSFORM),
      thumbUrl: transformedUrl(uploaded.secure_url, THUMB_TRANSFORM),
      width: uploaded.width,
      height: uploaded.height,
      size: uploaded.bytes,
      // serverTimestamp() isn't allowed inside arrays, so use the client clock
      uploadedAt: Timestamp.now(),
    },
    deleteToken: uploaded.delete_token,
  }
}

/**
 * Uploads `sources` (image files or PDF pages) and appends them, in order, to the exam's images.
 * onProgress(index, { progress, status, error }) is called per source.
 * Resolves with the number that failed.
 */
export async function uploadExamImages(examIds, sources, onProgress) {
  const results = new Array(sources.length)
  let next = 0

  async function worker() {
    while (next < sources.length) {
      const i = next++
      try {
        onProgress(i, { progress: 0, status: 'uploading' })
        results[i] = await uploadOne(examIds, sources[i], (progress) =>
          onProgress(i, { progress, status: 'uploading' }),
        )
        onProgress(i, { progress: 1, status: 'saving' })
      } catch (error) {
        onProgress(i, { progress: 0, status: 'error', error })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, sources.length) }, worker))

  const uploaded = results.filter(Boolean)
  if (uploaded.length > 0) {
    try {
      await updateImages(examIds, (images) => ({
        images: [...images, ...uploaded.map((r) => r.image)],
      }))
    } catch (error) {
      // Don't leave files on Cloudinary that no exam points to
      await Promise.all(uploaded.map((r) => deleteByToken(r.deleteToken)))
      results.forEach((r, i) => r && onProgress(i, { progress: 0, status: 'error', error }))
      throw error
    }
  }
  results.forEach((r, i) => r && onProgress(i, { progress: 1, status: 'done' }))
  return sources.length - uploaded.length
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

export function deleteExamImage(examIds, imageId) {
  return updateImages(examIds, (images) => ({
    images: images.filter((image) => image.id !== imageId),
  }))
}

// Uploads `file` in place of `imageId`, keeping its position.
export async function replaceExamImage(examIds, imageId, file, onProgress = () => {}) {
  const { image, deleteToken } = await uploadOne(examIds, file, onProgress)
  try {
    await updateImages(examIds, (images) => {
      const index = images.findIndex((x) => x.id === imageId)
      if (index === -1) throw Object.assign(new Error('الصورة لم تعد موجودة'), { code: 'not-found' })
      return { images: images.with(index, image) }
    })
  } catch (error) {
    await deleteByToken(deleteToken)
    throw error
  }
}

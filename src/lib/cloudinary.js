// Browser uploads to Cloudinary through an *unsigned upload preset* (no API secret in the app).
// Set the preset up as described in .env.example so it only accepts images into one folder.

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
const API = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`

// Everything this app uploads goes under this folder in the Cloudinary media library
export const ROOT_FOLDER = 'azhar-exams'

function cloudinaryError(message, cause) {
  return Object.assign(new Error(message, { cause }), { code: 'cloudinary' })
}

/**
 * Uploads `blob` as `${folder}/${publicId}`. Uses XHR (not fetch) for upload progress.
 * Resolves with Cloudinary's response: { public_id, secure_url, width, height, bytes, delete_token? }.
 */
export function uploadImage(blob, { folder, publicId, onProgress = () => {} }) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return Promise.reject(
      cloudinaryError('إعدادات Cloudinary غير موجودة (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET)'),
    )
  }

  const form = new FormData()
  form.append('file', blob)
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', folder)
  form.append('public_id', publicId)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/image/upload`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      let body
      try {
        body = JSON.parse(xhr.responseText)
      } catch (error) {
        reject(cloudinaryError(`Cloudinary: استجابة غير متوقعة (${xhr.status})`, error))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(cloudinaryError(`Cloudinary: ${body.error?.message ?? xhr.status}`))
    }
    xhr.onerror = () => reject(cloudinaryError('تعذّر الاتصال بـ Cloudinary، تحقق من اتصالك بالإنترنت'))
    xhr.send(form)
  })
}

// Undo an upload within ~10 minutes, using the delete_token the preset returns
// (needs "Return delete token" enabled on the preset). Best effort: never throws.
export async function deleteByToken(token) {
  if (!token) return
  try {
    const form = new FormData()
    form.append('token', token)
    await fetch(`${API}/delete_by_token`, { method: 'POST', body: form })
  } catch (error) {
    console.warn('Could not roll back Cloudinary upload', error)
  }
}

// Delivery URL with a transformation, e.g. w_480 thumbnails. f_auto picks WebP/AVIF per
// browser and q_auto picks the quality, so phones get the smallest file they can show.
export function transformedUrl(secureUrl, transformation) {
  return secureUrl.replace('/image/upload/', `/image/upload/${transformation}/`)
}

export const THUMB_TRANSFORM = 'c_limit,w_480,f_auto,q_auto'
export const FULL_TRANSFORM = 'f_auto,q_auto'

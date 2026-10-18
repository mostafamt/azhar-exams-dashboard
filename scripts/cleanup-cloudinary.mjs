// Deletes Cloudinary images that no exam in Firestore uses any more.
//
// The app can't delete from Cloudinary (that needs the API secret, which must never ship to the
// browser), so deleting a page/exam/subject in the app leaves its files behind. Run this on your
// own machine now and then to remove them.
//
//   npm run cleanup:cloudinary                 # dry run: only lists what would be deleted
//   npm run cleanup:cloudinary -- --delete     # actually delete
//   npm run cleanup:cloudinary -- --min-age-hours=48
//
// Needs in .env (no VITE_ prefix, so Vite never puts them in the website):
//   CLOUDINARY_API_KEY=...      CLOUDINARY_API_SECRET=...
// (Cloudinary console > Settings > API Keys)

import { initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore } from 'firebase/firestore'

const ROOT_FOLDER = 'azhar-exams/'
const LEVELS = ['grades', 'sections', 'subjects', 'exams']

const args = process.argv.slice(2)
const DELETE = args.includes('--delete')
const ALLOW_EMPTY = args.includes('--allow-empty')
// Files younger than this are skipped: an admin may be mid-upload (uploaded, not saved yet)
const MIN_AGE_HOURS = Number(args.find((a) => a.startsWith('--min-age-hours='))?.split('=')[1] ?? 24)

const env = process.env
const CLOUD = env.VITE_CLOUDINARY_CLOUD_NAME
for (const [name, value] of Object.entries({
  VITE_CLOUDINARY_CLOUD_NAME: CLOUD,
  CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
  VITE_FIREBASE_PROJECT_ID: env.VITE_FIREBASE_PROJECT_ID,
})) {
  if (!value) {
    console.error(`Missing ${name} in .env`)
    process.exit(1)
  }
}

const ADMIN_API = `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/upload`
const AUTH = 'Basic ' + Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64')

async function cloudinary(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Authorization: AUTH } })
  const body = await res.json()
  if (!res.ok) throw new Error(`Cloudinary ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`)
  return body
}

// Every image under azhar-exams/ (the Admin API pages 500 at a time)
async function listCloudinaryImages() {
  const all = []
  let cursor
  do {
    const params = new URLSearchParams({ prefix: ROOT_FOLDER, max_results: '500' })
    if (cursor) params.set('next_cursor', cursor)
    const page = await cloudinary(`${ADMIN_API}?${params}`)
    all.push(...page.resources)
    cursor = page.next_cursor
  } while (cursor)
  return all
}

// public_id from a delivery URL, for images saved without a publicId field:
// https://res.cloudinary.com/<cloud>/image/upload/<transformations>/v123/<public_id>.<ext>
function publicIdFromUrl(url) {
  return url?.match(/\/image\/upload\/(?:.*\/)?v\d+\/(.+)\.[a-z0-9]+$/i)?.[1]
}

// public_ids referenced by any exam. Reads are public under firestore.rules, so no login needed.
// Any read error aborts the script: an incomplete list would make used images look orphaned.
async function listUsedPublicIds() {
  const db = getFirestore(
    initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID }),
  )
  const used = new Set()
  let exams = 0

  async function walk(path, depth) {
    const snapshot = await getDocs(collection(db, path))
    for (const d of snapshot.docs) {
      if (LEVELS[depth] === 'exams') {
        exams++
        for (const image of d.data().images ?? []) {
          const id = image.publicId ?? publicIdFromUrl(image.url)
          if (id) used.add(id)
        }
      } else {
        await walk(`${path}/${d.id}/${LEVELS[depth + 1]}`, depth + 1)
      }
    }
  }
  await walk(LEVELS[0], 0)
  return { used, exams }
}

// The Admin API deletes up to 100 public_ids per call
async function deleteImages(publicIds) {
  let deleted = 0
  for (let i = 0; i < publicIds.length; i += 100) {
    const params = new URLSearchParams()
    publicIds.slice(i, i + 100).forEach((id) => params.append('public_ids[]', id))
    const result = await cloudinary(`${ADMIN_API}?${params}`, { method: 'DELETE' })
    deleted += Object.values(result.deleted).filter((status) => status === 'deleted').length
  }
  return deleted
}

const formatMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const [images, { used, exams }] = await Promise.all([listCloudinaryImages(), listUsedPublicIds()])
console.log(`Cloudinary: ${images.length} images under ${ROOT_FOLDER}`)
console.log(`Firestore:  ${used.size} images used by ${exams} exams`)

if (used.size === 0 && images.length > 0 && !ALLOW_EMPTY) {
  console.error(
    '\nNo exam uses any image, so every file would count as unused. Refusing in case Firestore ' +
      'was read wrong (e.g. wrong project in .env). Re-run with --allow-empty if this is intended.',
  )
  process.exit(1)
}

const cutoff = Date.now() - MIN_AGE_HOURS * 3600 * 1000
const unused = images.filter((image) => !used.has(image.public_id))
const orphans = unused.filter((image) => new Date(image.created_at).getTime() < cutoff)
const tooNew = unused.length - orphans.length

if (orphans.length === 0) {
  console.log('\nNothing to clean up.' + (tooNew ? ` (${tooNew} unused file(s) newer than ${MIN_AGE_HOURS}h skipped)` : ''))
  process.exit(0)
}

console.log(`\nUnused images older than ${MIN_AGE_HOURS}h: ${orphans.length} (${formatMB(orphans.reduce((n, i) => n + i.bytes, 0))})`)
for (const image of orphans) console.log(`  ${image.public_id}  ${image.created_at}`)
if (tooNew) console.log(`(${tooNew} unused file(s) newer than ${MIN_AGE_HOURS}h skipped)`)

if (!DELETE) {
  console.log('\nDry run, nothing deleted. Re-run with --delete to delete these files.')
  process.exit(0)
}

const deleted = await deleteImages(orphans.map((image) => image.public_id))
console.log(`\nDeleted ${deleted} of ${orphans.length} images.`)
process.exit(deleted === orphans.length ? 0 : 1)

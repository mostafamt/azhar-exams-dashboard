// One-off: copies every admins/{uid} record to users/{uid} with role 'admin', so admin checks
// can read the single `users` collection (see firestore.rules → isAdmin()).
//
//   ACCESS_TOKEN=… node scripts/migrate-admins.mjs            # dry run: prints what would change
//   ACCESS_TOKEN=… node scripts/migrate-admins.mjs --write
//
// ACCESS_TOKEN is an OAuth token of a project owner (e.g. `gcloud auth print-access-token`).
// Existing users/{uid} documents only get `role: 'admin'`; their other fields are kept.
// Run it after deploying the transitional rules, and before the dashboard/function that read `users`.

const PROJECT = 'azhar-exams-cd421'
const ROOT = `projects/${PROJECT}/databases/(default)/documents`
const DOCS = `https://firestore.googleapis.com/v1/${ROOT}`

const token = process.env.ACCESS_TOKEN
if (!token) throw new Error('ACCESS_TOKEN is not set')
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT }

async function call(url, init) {
  const res = await fetch(url, { headers, ...init })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

const { documents = [] } = await call(`${DOCS}/admins?pageSize=300`)
const uids = documents.map((d) => d.name.split('/').at(-1))
if (uids.length === 0) {
  console.log('No admins/{uid} documents; nothing to migrate.')
  process.exit(0)
}

// Name and email come from Firebase Auth; the admins documents are empty.
const { users: accounts = [] } = await call(
  `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
  { method: 'POST', body: JSON.stringify({ localId: uids }) },
)
const accountByUid = new Map(accounts.map((a) => [a.localId, a]))

// batchGet answers with one { found } or { missing } entry per requested document.
const results = await call(`${DOCS}:batchGet`, {
  method: 'POST',
  body: JSON.stringify({ documents: uids.map((uid) => `${ROOT}/users/${uid}`) }),
})
const hasProfile = new Set(results.filter((r) => r.found).map((r) => r.found.name.split('/').at(-1)))

const writes = uids.map((uid) => {
  const account = accountByUid.get(uid)
  const name = `${ROOT}/users/${uid}`
  if (hasProfile.has(uid)) {
    console.log(`${uid}  ${account?.email ?? '(no auth account)'}  → set role 'admin' on existing profile`)
    return { update: { name, fields: { role: { stringValue: 'admin' } } }, updateMask: { fieldPaths: ['role'] } }
  }
  const email = account?.email ?? ''
  const displayName = account?.displayName || email.split('@')[0] || uid
  console.log(`${uid}  ${email || '(no auth account)'}  → create profile «${displayName}»`)
  return {
    update: {
      name,
      fields: {
        name: { stringValue: displayName },
        email: { stringValue: email },
        role: { stringValue: 'admin' },
      },
    },
    currentDocument: { exists: false },
    updateTransforms: [
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ],
  }
})

if (!process.argv.includes('--write')) {
  console.log(`\n${writes.length} admins. Dry run; pass --write to apply.`)
  process.exit(0)
}

// One atomic commit, so admins are migrated all together or not at all.
await call(`${DOCS}:commit`, { method: 'POST', body: JSON.stringify({ writes }) })
console.log(`Migrated ${writes.length} admins to users/{uid}.`)

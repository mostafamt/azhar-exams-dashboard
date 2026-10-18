# Exam Images Dashboard — Implementation Plan

Goal: a dashboard for students where admins upload exam images. Content is organised as
**Grade → Section → Subject → Exam → Images**. Every level gets full CRUD (create, read, update, delete)
against Firestore.

---

## 1. Data model

### 1.1 Firestore path

```
grades/{gradeId}
  sections/{sectionId}
    categories/{categoryId}     ← groups subjects (e.g. اللغة العربية → الأدب، النحو…)
    subjects/{subjectId}        ← `categoryId` points at one of the section's categories
      exams/{examId}            ← holds the image list
```

Categories (added 2026-10-18, modelled on azhar.eg/exams) are a field-based grouping, not a path
level, so subject URLs and Storage paths don't change. Subjects with no or unknown `categoryId` show
under "أخرى". Deleting a category moves its subjects to "أخرى"; deleting a section deletes its categories.

What is already in the database (2026-10-18):

```
grades/third-secondary                         { name: "الصف الثالث الثانوي" }
  sections/literary                            { name: "القسم الأدبي" }
  sections/scientific                          { name: "القسم العلمي" }
    subjects/physics                           { name: "الفيزياء" }
      exams/2026                               { name: "" }
```

### 1.2 Document shapes

All levels share the same base fields. IDs are short English slugs (readable URLs); `name` is the Arabic display label.

| Field       | Type        | Notes                                              |
|-------------|-------------|----------------------------------------------------|
| `name`      | string      | Arabic display name (already used)                 |
| `order`     | number      | Sort order in lists (optional, default by `name`)  |
| `createdAt` | Timestamp   | `serverTimestamp()` on create                      |
| `updatedAt` | Timestamp   | `serverTimestamp()` on every update                |

The **exam** document adds:

| Field    | Type                | Notes                                              |
|----------|---------------------|----------------------------------------------------|
| `year`   | number              | e.g. `2026`                                        |
| `term`   | string (optional)   | e.g. `"first"`, `"second"`, `"retake"`             |
| `images` | array of `ExamImage`| ordered list; array order = page order             |

```js
// ExamImage
{
  id: "a1b2c3",                 // random id, also the Storage file name
  url: "https://firebasestorage...",  // getDownloadURL() result
  path: "exams/third-secondary/scientific/physics/2026/a1b2c3.webp", // needed to delete
  width: 1600,
  height: 2263,
  size: 184233,                 // bytes, after compression
  uploadedAt: Timestamp
}
```

> **Update 2026-10-18 — images moved to Cloudinary** (free plan; Firebase Storage would need Blaze).
> Browser uploads go through an unsigned upload preset (`src/lib/cloudinary.js`) into
> `azhar-exams/exams/{grade}/{section}/{subject}/{exam}/{id}`. Each `ExamImage` stores `publicId`,
> `url` (`f_auto,q_auto`) and `thumbUrl` (`c_limit,w_480,f_auto,q_auto`) — thumbnails are Cloudinary
> transformations, not separate uploads. Deleting from Cloudinary needs the API secret, so deletes in
> the app only remove Firestore entries; files stay on Cloudinary until cleaned up outside the app.
> Firebase Storage, `storage.rules` and its tests were removed. The Storage notes below are historical.

### 1.3 Why the images are stored this way

- **The image files go in Firebase Storage, not Firestore.** A Firestore document is limited to 1 MiB, so it can't hold image data. Firestore keeps only each image's metadata and URL.
- **Image metadata is an array on the exam document, not a subcollection.** An exam has a limited number of pages (roughly 2–30). With an array, one read loads the whole exam, and reordering pages is a single write. Fifty images of metadata take about 15 KB, well under the 1 MiB limit. If one exam ever needs hundreds of images, switch to an `exams/{examId}/images` subcollection.
- **Storage path:** `exams/{gradeId}/{sectionId}/{subjectId}/{examId}/{imageId}.webp`. It mirrors the Firestore path, so you can clean up an exam's files just by knowing the exam's path.

---

## 2. Project structure

```
src/
  firebase.js                  # exists — add getStorage / getAuth exports
  lib/
    paths.js                   # path builders for Firestore + Storage
    crud.js                    # generic create/read/update/delete for any level
    examImages.js              # upload / delete / reorder images
    cascadeDelete.js           # recursive delete (docs + Storage files)
    imageCompress.js           # resize + convert to webp before upload
  hooks/
    useCollection.js           # live list (onSnapshot) for any level
    useDocument.js             # live single doc
    useAuth.js                 # current user + isAdmin
  pages/
    GradesPage.jsx             # /                                   list grades
    SectionsPage.jsx           # /:gradeId                           list sections
    SubjectsPage.jsx           # /:gradeId/:sectionId                list subjects
    ExamsPage.jsx              # /:gradeId/:sectionId/:subjectId     list exams
    ExamPage.jsx               # /:gradeId/:sectionId/:subjectId/:examId  view/manage images
    LoginPage.jsx              # /login (admins only)
  components/
    Breadcrumbs.jsx
    ItemList.jsx               # reusable list with add/edit/delete actions (admin)
    ItemFormDialog.jsx         # create/edit name, id, order
    ConfirmDialog.jsx          # delete confirmation (shows what will be removed)
    ImageUploader.jsx          # drag & drop, multi-file, progress bars
    ImageGrid.jsx              # thumbnails, drag-to-reorder, delete (admin)
    ImageViewer.jsx            # full-screen viewer with zoom / next / prev
```

`src/hooks/useGrades.js` will be replaced by the generic `useCollection`.

**New dependencies:**
- `react-router` for routing
- `@dnd-kit/sortable` for reordering images (optional; up/down buttons work as a fallback)

---

## 3. CRUD layer

### 3.1 Path builders — `lib/paths.js`

Each level is described as a list of IDs, so the same code works at every depth.

```js
const LEVELS = ['grades', 'sections', 'subjects', 'exams']

// ids = []                          -> "grades"
// ids = ['third-secondary']         -> "grades/third-secondary/sections"
// ids = ['third-secondary','scientific'] -> ".../sections/scientific/subjects"
export function collectionPath(ids) {
  return ids.reduce((p, id, i) => `${p}/${id}/${LEVELS[i + 1]}`, LEVELS[0])
}

export function docPath(ids) {           // ids includes the doc's own id
  return `${collectionPath(ids.slice(0, -1))}/${ids.at(-1)}`
}

export function examStoragePrefix([g, s, sub, e]) {
  return `exams/${g}/${s}/${sub}/${e}`
}
```

### 3.2 Generic CRUD — `lib/crud.js`

| Operation | Function                          | Firestore call                                  |
|-----------|-----------------------------------|-------------------------------------------------|
| Create    | `createItem(parentIds, id, data)` | `setDoc(doc(...), {...data, createdAt, updatedAt})` — slug ID chosen by admin; fail if it already exists (check with `getDoc`, or use a transaction) |
| Read list | `listItems(parentIds)`            | `getDocs(query(collection(...), orderBy('order')))` |
| Read one  | `getItem(ids)`                    | `getDoc(doc(...))`                              |
| Live list | `useCollection(parentIds)`        | `onSnapshot(...)` — UI updates instantly after any CRUD |
| Update    | `updateItem(ids, patch)`          | `updateDoc(doc(...), {...patch, updatedAt})`    |
| Delete    | `deleteItem(ids)`                 | → `cascadeDelete(ids)` (see 3.4)                |

**Slug rule:** IDs must be lowercase `a-z0-9-` (e.g. `third-secondary`, `2026-first-term`). Validate this in the form.
**IDs are permanent:** Firestore cannot rename a document ID. Editing an item only changes `name`/`order`. To change an ID you would have to copy the item and all its children, so the UI won't offer it.

### 3.3 Exam images — `lib/examImages.js`

**Upload** `uploadExamImages(examIds, files, onProgress)`:
1. For each file: compress with `imageCompress.js` (max 2000px on the long side, WebP at quality ~0.85, using canvas). This shrinks a phone photo from about 4 MB to about 200 KB.
2. `uploadBytesResumable(ref(storage, `${prefix}/${imageId}.webp`), blob)` and report progress to the UI.
3. `getDownloadURL()`.
4. After all uploads finish, append the metadata to the exam in a transaction (`runTransaction`: read `images`, push the new entries, write back). A transaction avoids lost updates when two admins upload at once.
5. If a Firestore write fails, delete the files that were already uploaded so nothing is left orphaned.

**Read:** comes with the exam document (`useDocument(examIds)`), so no extra query is needed.

**Update / reorder** `reorderExamImages(examIds, orderedImageIds)`: rebuild the array in the new order and `updateDoc`.
**Replace one image:** upload the new file, swap that entry in the array, then delete the old Storage file.

**Delete** `deleteExamImage(examIds, imageId)`:
1. In a transaction, remove the entry from `images`.
2. Then `deleteObject(ref(storage, image.path))`. If this fails, log it; the leftover file can be cleaned up later, and nothing visible breaks.

### 3.4 Cascading delete — `lib/cascadeDelete.js`

Deleting a document in Firestore **does not delete its subcollections**. If the app only deleted `grades/third-secondary`, its sections, subjects, exams and images would stay in the database, orphaned. The delete helper therefore walks the whole tree:

```
deleteItem(ids):
  if level < exams: for each child in collectionPath(ids): deleteItem([...ids, child.id])
  if level == exams: delete every Storage file under examStoragePrefix(ids)  (listAll + deleteObject)
  deleteDoc(doc(docPath(ids)))
```

- Delete children before parents, so if the process fails partway it can simply be run again.
- Group Firestore deletes with `writeBatch`, at most 500 operations per batch.
- Before deleting, count what will be removed and show it in the confirm dialog, e.g. "This will delete 2 sections, 7 subjects, 31 exams and 412 images." The admin must type the item's name to confirm.
- **Later improvement:** move this into a callable Cloud Function that uses `firestore.recursiveDelete()`, so a closed browser tab can't leave a delete half-finished. The client-side version is fine at the current data size.

---

## 4. Authentication and security rules

Students only read; admins have full CRUD. **Currently, anyone holding the web config can write to the database if your rules allow it**, so this phase must be finished before going live.

- Turn on **Firebase Authentication** with Email/Password and create the admin accounts by hand.
- Mark a user as admin with a document `admins/{uid}`, created in the console. (Custom claims are cleaner but need the Admin SDK or a Cloud Function to set.)
- Students don't need to log in, because reading is public.

**`firestore.rules`**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function isAdmin() {
      return request.auth != null &&
             exists(/databases/$(db)/documents/admins/$(request.auth.uid));
    }

    // covers grades and every nested sections/subjects/exams doc
    match /grades/{path=**} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /admins/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false;            // console only
    }
  }
}
```

**`storage.rules`**
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /exams/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
                   && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid))
                   && (request.resource == null            // delete
                       || (request.resource.size < 5 * 1024 * 1024
                           && request.resource.contentType.matches('image/.*')));
    }
  }
}
```

Deploy the rules with the Firebase CLI (`firebase init firestore storage`, then `firebase deploy --only firestore:rules,storage`), so they are versioned in this repo.

---

## 5. UI

- **RTL / Arabic:** set `<html lang="ar" dir="rtl">` and use an Arabic font such as Cairo or Noto Naskh Arabic. Write all UI text in Arabic.
- **Navigation:** each level is a page of cards, with breadcrumbs (Grade › Section › Subject › Exam). The URL mirrors the Firestore path, so any page can be bookmarked.
- **Admin mode:** when `isAdmin` is true, every list shows Add, edit (pencil) and delete (trash) actions, and the exam page shows the uploader and reorder handles. Students see the same pages without those controls.
- **Exam page:** a thumbnail grid that opens a full-screen viewer with swipe, next/prev and pinch-zoom. Use `loading="lazy"` on the thumbnails.
- **Feedback:** loading skeletons, an empty state at each level ("No subjects yet"), and toasts for success and errors. Translate common Firestore error codes such as `permission-denied` and `not-found`.

---

## 6. Implementation phases

| # | Phase | Deliverable | Done when |
|---|-------|-------------|-----------|
| 1 ✅ | Foundation (done 2026-10-18 — the four list pages became one generic `LevelPage.jsx`) | `paths.js`, `crud.js`, `useCollection`, `useDocument`; react-router; Storage/Auth exports in `firebase.js` | Can browse grades → sections → subjects → exams (read only) using existing data |
| 2 ✅ | CRUD for hierarchy (done 2026-10-18 — admin controls show only in `npm run dev` until phase 4) | `ItemList`, `ItemFormDialog`, `ConfirmDialog`, `cascadeDelete.js` | Admin can create / rename / reorder / delete at every level; deleting a grade leaves no orphans |
| 3 🟡 | Exam images (code done 2026-10-18; upload/replace untested until Firebase Storage is enabled — reorder/up-down buttons used instead of drag-and-drop) | `imageCompress.js`, `examImages.js`, `ImageUploader`, `ImageGrid` | Upload many images with progress, reorder, replace, delete; Storage and Firestore stay consistent |
| 4 🟡 | Auth and rules (code + rules done 2026-10-18, 11/11 emulator tests pass via `npm run test:rules`; waiting on: enable Auth, create admin, `npm run deploy:rules`) | `LoginPage`, `useAuth`, `firestore.rules`, `storage.rules` deployed | Logged-out user can read but every write is rejected by rules; admin can write |
| 5 🟡 | Student experience (code done 2026-10-18; viewer gestures not yet tried on a real phone — no images uploaded yet. Toasts skipped: errors show inline) | `ImageViewer`, RTL styling, breadcrumbs, empty/loading states | Usable on a phone |
| 6 🟡 | Hardening (code done 2026-10-18: `deleteNode` function (4/4 emulator tests, opt-in via `VITE_DELETE_WITH_FUNCTION`), thumbnails generated in the browser instead of the Resize Images extension. Not yet deployed. Hosting dropped: the app is deployed to the team's own server) | Cloud Function for recursive delete, image thumbnails via the "Resize Images" extension, Firebase Hosting deploy | — |

---

## 7. Testing

- **Firebase Emulator Suite** (Firestore, Storage and Auth emulators): call `connectFirestoreEmulator` etc. in `firebase.js` when `import.meta.env.DEV && VITE_USE_EMULATORS`, so development never touches production data.
- **Unit tests (Vitest):** `paths.js`, slug validation, and the array logic for reorder and delete.
- **Rules tests (`@firebase/rules-unit-testing`):** an anonymous user can't write, an admin can, uploads over 5 MB or of a non-image type are rejected.
- **Manual checklist:** create the full chain from grade to images, then reorder, replace and delete an image, then delete the grade. Confirm in the console that no documents or Storage files are left behind.

---

## 8. Open questions

1. **Should students see everything?** If some content is restricted (e.g. by subscription or school), reads need auth and per-grade rules.
2. **Exam metadata:** is `year` + `term` enough, or are fields like exam type (final/monthly) or a model answer needed?
3. ~~**PDFs:**~~ Done 2026-10-18: the exam uploader accepts PDFs; pdf.js (lazy-loaded) renders each page in the browser and it is stored as WebP pages + thumbnails like photos (`src/lib/pdfPages.js`). The PDF itself isn't kept.
4. **Exam IDs:** the existing exam is `2026`. If a subject has more than one exam per year, IDs need a suffix (e.g. `2026-first-term`).

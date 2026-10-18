# Question Bank (بنك الأسئلة) — Implementation Plan

> Status: **live** (2026-10-18). Rules deployed and the bank seeded with 20 questions from the 2026 booklets.
> Open questions in §6 were settled with the defaults: one shared bank, choices not
> shuffled, text-only questions typed by hand. The source image's URL and size are copied into
> `source`, so the "view source" button opens it without reading the exam.

Goal: a new page, **بنك الأسئلة**, that shows **multiple-choice questions**, with no limit on how many.
The first 20 were seeded from the 2026 booklets to get the feature going (see §5, step 6).
Admins write the questions by reading them off the exam images already in the dashboard, from any subject.
Each question has a body, 4 choices and 1 correct answer. Students can read the questions and try to answer them.

---

## 1. Data model

### 1.1 Firestore path

You asked for `questions/mcq-questions/document`. A Firestore path must alternate collection and document
(`collection/doc/collection/doc`), so a question can't be stored directly at that 3-segment path. The
closest valid layout:

```
questions/                        ← collection
  mcq-questions                   ← document (bank metadata, e.g. title)
    items/                        ← subcollection
      q01, q02, …                 ← one document per question
```

This keeps `questions/mcq-questions` as the parent you asked for, and leaves room for other kinds of
questions later (e.g. `questions/essay-questions/items/...`).

Question ids are `q` + a number of at least 2 digits: `q01`, `q02`, …, `q99`, `q100`, … (updated
2026-10-18: the bank was first capped at 20 with ids `q01`–`q20`; the cap was removed). The rules
reject any other id, and the number gives the display order. A new question takes one past the
highest id, so it always appears at the end.

### 1.2 Question document — `questions/mcq-questions/items/{qNN}`

| Field           | Type                | Notes                                                        |
|-----------------|---------------------|--------------------------------------------------------------|
| `body`          | string              | Question text (Arabic), 1–1000 chars                         |
| `choices`       | array of 4 strings  | Exactly 4 non-empty strings, each ≤ 300 chars                |
| `correctIndex`  | number              | `0`–`3`, index into `choices`                                |
| `source`        | map (optional)      | Where the question came from (see below)                     |
| `createdAt`     | Timestamp           | `serverTimestamp()` on create                                |
| `updatedAt`     | Timestamp           | `serverTimestamp()` on every update                          |

```js
// Example
{
  body: 'ما وحدة قياس شدة التيار الكهربي؟',
  choices: ['الفولت', 'الأمبير', 'الأوم', 'الوات'],
  correctIndex: 1,
  source: {
    gradeId: 'third-secondary',
    sectionId: 'scientific',
    subjectId: 'physics',
    examId: '2026',
    imageId: 'a1b2c3…',        // ExamImage.id in that exam's `images` array
    subjectName: 'الفيزياء',     // copied for display, so the page needn't read the exam tree
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

**Why `correctIndex` and not the correct answer's text:** if an admin fixes a typo in a choice, the
correct answer doesn't silently break. Shuffling (if wanted, see §6) is done in the UI.

**Why `source` is a reference, not a copy of the image:** the image already lives on Cloudinary and in the
exam's `images` array. If the exam or image is later deleted, the question still works; the page just
hides the "view source" link.

---

## 2. Security rules — `firestore.rules`

Same model as the rest of the app: public read, admin write.

```
match /questions/{bankId} {
  allow read: if true;
  allow write: if isAdmin() && bankId == 'mcq-questions';

  match /items/{questionId} {
    allow read: if true;
    allow create, update: if isAdmin()
      && bankId == 'mcq-questions'
      && questionId.matches('q(0[1-9]|[1-9][0-9]+)')
      && validMcq();
    allow delete: if isAdmin();
  }
}

function validMcq() {
  let d = request.resource.data;
  return d.body is string && d.body.size() > 0 && d.body.size() <= 1000
    && d.choices is list && d.choices.size() == 4
    && d.choices[0] is string && d.choices[0].size() > 0 && d.choices[0].size() <= 300
    && d.choices[1] is string && d.choices[1].size() > 0 && d.choices[1].size() <= 300
    && d.choices[2] is string && d.choices[2].size() > 0 && d.choices[2].size() <= 300
    && d.choices[3] is string && d.choices[3].size() > 0 && d.choices[3].size() <= 300
    && d.correctIndex is int && d.correctIndex >= 0 && d.correctIndex <= 3;
}
```

**Rules tests** (added to `tests/rules.test.js`):
- anyone can read a question; a logged-out user can't write one
- admin can create `q01`, `q21`, `q100`; `q00`, `q1`, `q0100` and `abc` are rejected
- rejected: 3 or 5 choices, an empty choice, `correctIndex` of `4` or `"1"`, a missing body

---

## 3. Code changes

### 3.1 New files

```
src/
  lib/
    questions.js              # path constants + CRUD for MCQ questions
  pages/
    QuestionBankPage.jsx      # /question-bank
  components/
    QuestionCard.jsx          # one question: body, 4 choices, answer feedback, admin actions
    QuestionFormDialog.jsx    # create/edit: body, 4 choice inputs, radio for the correct one, source picker
    SourceImagePicker.jsx     # pick grade → section → subject → exam → image, with the image shown beside the form
```

### 3.2 `lib/questions.js`

| Function                         | Firestore call                                               |
|----------------------------------|--------------------------------------------------------------|
| `MCQ_ITEMS_PATH`                 | `'questions/mcq-questions/items'`                            |
| `questionId(n)`                  | `n → 'q' + String(n).padStart(2, '0')`                       |
| `nextFreeQuestionId(items)`      | one past the highest id (`q21` after `q20`)                  |
| `saveQuestion(id, data)`         | `setDoc` with `createdAt` (new) / `updatedAt`                |
| `deleteQuestion(id)`             | `deleteDoc`                                                  |

Reuse `createDoc()` from `lib/crud.js` for creation (it already rejects a taken id inside a transaction,
so two admins adding at once can't overwrite each other). `qNN` matches the existing `SLUG_PATTERN`.

The list is read with the existing `useCollectionAt` hook in `hooks/useCollection.js` (export it, or add
`useQuestions()` beside `useCategories()`). `sortItems` falls back to sorting by `name`, so the page sorts
by `id` instead.

### 3.3 Routing and navigation

- `App.jsx`: add `<Route path="question-bank" element={<QuestionBankPage />} />` **above** `:gradeId`.
- `lib/crud.js`: add `'question-bank'` to `RESERVED_GRADE_IDS`, so no grade can take that URL.
- `Navbar.jsx`: add a `NavLink` to `/question-bank` labelled **بنك الأسئلة**, next to الرئيسية.

---

## 4. UI

### 4.1 Student view

- Page title **بنك الأسئلة** and a counter, e.g. "20 سؤالًا".
- Questions listed in number order (q01, q02, …), numbered from 1.
- Each card shows the body and 4 choices labelled أ، ب، ج، د.
- Clicking a choice locks the card and shows feedback: the chosen choice is marked green (correct) or red
  (wrong), and the correct one is marked green.
- A "إعادة المحاولة" button at the bottom clears all answers. Answers are kept only in React state; nothing
  is saved (no student accounts exist).
- If the question has a `source`, a small link "من امتحان الفيزياء 2026" opens that page in the existing
  `ImageViewer`.
- Empty state: "لا توجد أسئلة بعد".

### 4.2 Admin view (when `isAdmin`)

- "إضافة سؤال" button (no limit on the number of questions).
- Every card shows the correct answer up front, plus edit (pencil) and delete (trash) buttons.
- **Question form dialog** (reuses `Modal`):
  1. **Source image (optional):** pick grade → section → subject → exam, then a thumbnail from that exam's
     `images`. The chosen image appears beside the form (large, scrollable), so the admin can copy the
     question from it.
  2. Body (textarea), 4 choice inputs, a radio button beside each to mark the correct one.
  3. Validation before saving: body and all 4 choices filled, exactly one correct choice, choices not
     duplicated.
- Delete asks for a simple confirmation (no cascade; a question has no children).

All UI text in Arabic, RTL, using the existing styles in `App.css`.

---

## 5. Implementation steps

| # | Step | Done when |
|---|------|-----------|
| 1 ✅ | Rules + rules tests (§2) | `npm run test:rules` passes, including the new cases (9/9) |
| 2 ✅ | `lib/questions.js`, `useQuestions` hook, route, navbar link, reserved id | Empty `/question-bank` page reachable from the navbar |
| 3 ✅ | `QuestionCard` + student view | Questions added in the console show and can be answered |
| 4 ✅ | `QuestionFormDialog` (without source) + delete | Admin can add, edit and delete questions |
| 5 ✅ | `SourceImagePicker` + "view source" link | Admin picks an exam image while writing; students can open it |
| 6 ✅ | Deploy rules (`npm run deploy:rules`); seed 20 questions with `scripts/seed-question-bank.mjs` (2026-10-18) | Live |

---

## 6. Open questions

1. **Path:** is `questions/mcq-questions/items/{q01, q02, …}` OK, or do you prefer another subcollection name
   than `items` (e.g. `list`)?
2. **One bank or one per subject?** As written there is one shared bank mixing subjects.
   If you want one bank per subject later, the path would become e.g. `questions/{subjectId}/items/...`.
3. ~~**Exactly 20 or up to 20?**~~ Settled 2026-10-18: no limit. 20 questions were only the starting set.
4. **Shuffle choices** for students on each visit? Default: no, show them in stored order.
5. **Images inside questions:** some exam questions contain a figure or equation. Should a question be
   able to hold a cropped image (uploaded to Cloudinary like exam pages)? Not included in this plan.
6. **Extracting questions automatically:** a later step could send an exam image to an AI model and
   pre-fill the form for the admin to check. Not included in this plan; questions are typed by hand.

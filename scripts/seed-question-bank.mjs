// Seeds the question bank (questions/mcq-questions/items/q01…) with MCQs copied from the
// 2026 booklets (البوكليت التجريبي). Each question's `source` is filled from the live exam doc.
//
//   node scripts/seed-question-bank.mjs            # dry run: prints the questions to review
//   ACCESS_TOKEN=… node scripts/seed-question-bank.mjs --write
//
// ACCESS_TOKEN is an OAuth token of a project owner (e.g. from the Firebase CLI login). Writes
// fail if a question id already exists, so the script never overwrites admin edits.

const PROJECT = 'azhar-exams-cd421'
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const GRADE = 'third-secondary'
const EXAM = 'booklet-2026'

// [sectionId, subjectId, page, body, choices, correctIndex]
const QUESTIONS = [
  ['scientific', 'chemistry', 3, 'أفضل هذه الطرق للحصول على الأسيتالدهيد ........',
    ['أكسدة الإيثانول', 'اختزال حمض الخليك', 'الهيدرة الحفزية للأستيلين', 'جميع ما سبق'], 2],
  ['scientific', 'biology', 3, '........ هي مجموعة الهرمونات المسئولة عن نمو البروستاتا والحويصلات المنوية في الذكر.',
    ['الإندروجينات', 'الإستروجينات', 'TSH', 'ACTH'], 0],
  ['scientific', 'chemistry', 3, 'عند إمرار غاز H₂S في محلول كبريتات النحاس II ........',
    ['يتكون راسب أسود', 'يتكون راسب أسود بعد التسخين', 'يتكون راسب أبيض', 'لا يتكون راسب'], 0],
  ['scientific', 'biology', 3, 'أي الكائنات الحية التالية يتكاثر بالتجدد؟',
    ['الجمبري', 'الضفدعة', 'السلمندر', 'الأسفنج'], 3],
  ['scientific', 'chemistry', 3, 'في النظام المتزن: CH₃COOH + H₂O ⇌ CH₃COO⁻ + H₃O⁺\nماذا يحدث عند إضافة قطرات من حمض HCl إلى هذا النظام؟',
    ['ينشط في اتجاه اليسار ويزداد تركيز CH₃COO⁻', 'ينشط في اتجاه اليسار ويقل تركيز CH₃COO⁻',
      'ينشط في اتجاه اليمين ويزداد تركيز CH₃COO⁻', 'ينشط في اتجاه اليمين ويقل تركيز CH₃COO⁻'], 1],
  ['scientific', 'nahw', 3, 'قال تعالى: ﴿فَأَرْسَلْنَا عَلَيْهِمُ الطُّوفَانَ وَالْجَرَادَ وَالْقُمَّلَ وَالضَّفَادِعَ وَالدَّمَ﴾\nكلمة (الطوفان) تُعرب:',
    ['خبر (ما) النافية', 'مفعولًا به', 'مفعولًا مطلقًا', 'حالًا'], 1],
  ['scientific', 'chemistry', 3, 'أحد هذه التفاعلات لا يصلح لتحضير كبريتات الحديد II:',
    ['تفاعل الحديد مع حمض الكبريتيك المخفف', 'تفاعل أكسيد الحديد II مع حمض الكبريتيك المخفف',
      'تفاعل الحديد مع كبريتات النحاس II', 'تفاعل أكسيد الحديد III مع حمض الكبريتيك المركز'], 3],
  ['scientific', 'biology', 3, 'المفاصل التي توجد بين أجسام الفقرات العظمية في الإنسان هي مفاصل ........',
    ['ليفية', 'زلالية محدودة', 'زلالية واسعة', 'غضروفية'], 3],
  ['scientific', 'chemistry', 3, 'يمكننا التمييز بين الإيثانول وحمض الإيثانويك باستخدام ........',
    ['الصوديوم', 'البوتاسيوم', 'بيكربونات الصوديوم', 'كلها صحيحة'], 2],
  ['literary', 'history', 3, 'أصبح الوفد المصري ممثلًا قانونيًا للأمة المصرية بعد ........',
    ['فرض الأحكام العرفية على البلاد', 'مقابلة الوفد مع المندوب السامي', 'تأليف سعد زغلول لهيئة الوفد', 'التفويض الشعبي'], 3],
  ['scientific', 'chemistry', 3, 'كثير من التفاعلات الكيميائية تتضاعف سرعتها تقريبًا إذا ارتفعت درجة الحرارة بمقدار ........ درجة مئوية.',
    ['10°C', '20°C', '30°C', '40°C'], 0],
  ['scientific', 'biology', 3, 'المادة التي تحفز نضج الخلايا الليمفاوية الجذعية إلى الخلايا التائية هي ........',
    ['الكيموكينات', 'الإنترليوكينات', 'التيموسين', 'الإنترفيرونات'], 2],
  ['scientific', 'chemistry', 5, 'ناتج الهيدرة الحفزية للبروباين هو ........',
    ['البروبانون', 'البروبانال', 'كحول ثالثي', '(أ) و (ب) معًا'], 0],
  ['scientific', 'nahw', 3, 'قال تعالى: ﴿وَلَمَّا وَقَعَ عَلَيْهِمُ الرِّجْزُ قَالُوا يَا مُوسَى ادْعُ لَنَا رَبَّكَ بِمَا عَهِدَ عِندَكَ لَئِن كَشَفْتَ عَنَّا الرِّجْزَ لَنُؤْمِنَنَّ لَكَ﴾\nوردت كلمة (الرجز) في الآية مرتين:',
    ['الأولى مبتدأ، والثانية مفعول به', 'الأولى خبر، والثانية مفعول به',
      'الأولى فاعل، والثانية مفعول به', 'الأولى خبر، والثانية اسم لناسخ محذوف'], 2],
  ['scientific', 'chemistry', 5, 'عند إضافة محلول كلوريد الباريوم إلى محلول ملح ........ يتكون راسب أبيض لا يذوب في الأحماض.',
    ['نيترات', 'فوسفات', 'كبريتات', 'كبريتيد'], 2],
  ['scientific', 'biology', 3, 'لتكوين بروتين من 300 حمض أميني فإن عدد لفات جزيء DNA الذي سيتم نسخه لتكوين البروتين هو ........ لفة.',
    ['15', '30', '45', '90'], 3],
  ['scientific', 'chemistry', 5, 'كمية الكهرباء اللازمة لفصل 3 g من الألومنيوم (Al = 27) بالتحليل الكهربي لمصهور البوكسيت ........',
    ['1 F', '⅓ F', '3 F', '6 F'], 1],
  ['scientific', 'biology', 3, 'الجزيء المسئول عن قراءة لغتي الأحماض الأمينية والنيوكليوتيدات هو ........',
    ['بلمرة RNA', 'tRNA', 'mRNA', 'DNA'], 1],
  ['scientific', 'chemistry', 5, 'خام من خامات الحديد أصفر اللون سهل الاختزال هو ........',
    ['الهيماتيت', 'المجنتيت', 'السيدريت', 'الليمونيت'], 3],
  ['scientific', 'chemistry', 5, 'مجموعة الـ OH في الكحولات ........',
    ['غير متأينة وليس لها نشاط كيميائي', 'غير متأينة ولها نشاط كيميائي',
      'متأينة وليس لها نشاط كيميائي', 'متأينة ولها نشاط كيميائي'], 1],
]

// Firestore REST value encoding
function encode(value) {
  if (value === null) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (Number.isInteger(value)) return { integerValue: String(value) }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } }
}

function decode(field) {
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('mapValue' in field) return Object.fromEntries(Object.entries(field.mapValue.fields ?? {}).map(([k, v]) => [k, decode(v)]))
  if ('arrayValue' in field) return (field.arrayValue.values ?? []).map(decode)
  return null
}

async function getDoc(path) {
  const res = await fetch(`${DOCS}/${path}`)
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  return Object.fromEntries(Object.entries((await res.json()).fields ?? {}).map(([k, v]) => [k, decode(v)]))
}

const cache = new Map()
async function cached(path) {
  if (!cache.has(path)) cache.set(path, await getDoc(path))
  return cache.get(path)
}

async function buildQuestion([sectionId, subjectId, page, body, choices, correctIndex]) {
  const subjectPath = `grades/${GRADE}/sections/${sectionId}/subjects/${subjectId}`
  const subject = await cached(subjectPath)
  const exam = await cached(`${subjectPath}/exams/${EXAM}`)
  const image = exam.images[page - 1]
  if (!image) throw new Error(`${subjectId}: no page ${page}`)
  if (choices.length !== 4 || new Set(choices).size !== 4 || !(correctIndex >= 0 && correctIndex <= 3)) {
    throw new Error(`invalid question: ${body}`)
  }
  return {
    body,
    choices,
    correctIndex,
    source: {
      gradeId: GRADE,
      sectionId,
      subjectId,
      examId: EXAM,
      imageId: image.id,
      subjectName: subject.name || subjectId,
      examName: exam.name || EXAM,
      page,
      url: image.url,
      thumbUrl: image.thumbUrl ?? image.url,
      width: image.width ?? null,
      height: image.height ?? null,
    },
  }
}

const questions = []
for (const q of QUESTIONS) questions.push(await buildQuestion(q))
const ids = questions.map((_, i) => `q${String(i + 1).padStart(2, '0')}`)

if (!process.argv.includes('--write')) {
  const letters = ['أ', 'ب', 'ج', 'د']
  questions.forEach((q, i) => {
    console.log(`${ids[i]} [${q.source.subjectName} ص${q.source.page}] ${q.body.replace(/\n/g, ' ')}`)
    console.log(`     ✓ ${letters[q.correctIndex]}) ${q.choices[q.correctIndex]}`)
  })
  console.log(`\n${questions.length} questions. Dry run; pass --write to insert.`)
  process.exit(0)
}

const token = process.env.ACCESS_TOKEN
if (!token) throw new Error('ACCESS_TOKEN is not set')

// One atomic commit; each write fails if that id already exists.
const res = await fetch(`${DOCS.replace(/\/documents$/, '/documents:commit')}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    writes: questions.map((q, i) => ({
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/questions/mcq-questions/items/${ids[i]}`,
        fields: encode(q).mapValue.fields,
      },
      currentDocument: { exists: false },
      updateTransforms: [
        { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      ],
    })),
  }),
})
if (!res.ok) throw new Error(`commit failed: ${res.status} ${await res.text()}`)
console.log(`Inserted ${questions.length} questions (${ids[0]}…${ids.at(-1)}).`)

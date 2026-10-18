// The content tree: grades/{g}/sections/{s}/subjects/{sub}/exams/{e}
export const LEVELS = ['grades', 'sections', 'subjects', 'exams']

export const LEVEL_LABELS = {
  grades: 'الصفوف',
  sections: 'الأقسام',
  subjects: 'المواد',
  exams: 'الامتحانات',
}

export const TERM_LABELS = {
  first: 'الفصل الدراسي الأول',
  second: 'الفصل الدراسي الثاني',
  retake: 'الدور الثاني',
}

export const LEVEL_SINGULAR = {
  grades: 'صف',
  sections: 'قسم',
  subjects: 'مادة',
  exams: 'امتحان',
  categories: 'تصنيف',
}

// Collection holding the children of `parentIds`.
// []                               -> "grades"
// ['third-secondary']              -> "grades/third-secondary/sections"
// ['third-secondary','scientific'] -> "grades/third-secondary/sections/scientific/subjects"
export function collectionPath(parentIds) {
  return parentIds.reduce(
    (path, id, i) => `${path}/${id}/${LEVELS[i + 1]}`,
    LEVELS[0],
  )
}

// Document addressed by `ids` (last id is the document's own id).
export function docPath(ids) {
  return `${collectionPath(ids.slice(0, -1))}/${ids.at(-1)}`
}

// Name of the level a list of children belongs to, e.g. [] -> 'grades'.
export function childLevel(parentIds) {
  return LEVELS[parentIds.length]
}

// Categories group the subjects of one section (like "اللغة العربية" → الأدب، النحو…).
// They live beside the subjects; a subject points at one through its `categoryId` field.
export function categoriesPath(sectionIds) {
  return `${docPath(sectionIds)}/categories`
}

export function examStoragePrefix([gradeId, sectionId, subjectId, examId]) {
  return `exams/${gradeId}/${sectionId}/${subjectId}/${examId}`
}

// App URL for a node in the tree.
export function routeFor(ids) {
  return '/' + ids.map(encodeURIComponent).join('/')
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

import { useParams } from 'react-router'

// Route params in tree order, e.g. ['third-secondary', 'scientific'].
export function useRouteIds() {
  const { gradeId, sectionId, subjectId, examId } = useParams()
  return [gradeId, sectionId, subjectId, examId].filter(Boolean)
}

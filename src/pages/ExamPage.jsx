import { Breadcrumbs } from '../components/Breadcrumbs'
import { ImageGrid } from '../components/ImageGrid'
import { ImageUploader } from '../components/ImageUploader'
import { Empty, ErrorMessage, Loading } from '../components/Status'
import { useDocument } from '../hooks/useDocument'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useRouteIds } from '../hooks/useRouteIds'
import { TERM_LABELS } from '../lib/paths'

export function ExamPage() {
  const ids = useRouteIds()
  const { data: exam, loading, error } = useDocument(ids)
  const isAdmin = useIsAdmin()
  const images = exam?.images ?? []

  return (
    <>
      <Breadcrumbs ids={ids} />
      <header className="page-header">
        <h1>{exam?.name || ids.at(-1)}</h1>
        <span className="card-meta">
          {[exam?.year, TERM_LABELS[exam?.term], images.length > 0 && `${images.length} صفحة`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </header>
      {loading ? (
        <Loading variant="images" />
      ) : error ? (
        <ErrorMessage error={error} />
      ) : !exam ? (
        <Empty>هذا الامتحان غير موجود</Empty>
      ) : (
        <>
          {isAdmin && <ImageUploader examIds={ids} />}
          {images.length === 0 ? (
            <Empty>لا توجد صور لهذا الامتحان بعد</Empty>
          ) : (
            <ImageGrid examIds={ids} images={images} isAdmin={isAdmin} />
          )}
        </>
      )}
    </>
  )
}

import { useState } from 'react'
import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CategoryDeleteDialog } from '../components/CategoryDeleteDialog'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import { ItemFormDialog } from '../components/ItemFormDialog'
import { Empty, ErrorMessage, Loading } from '../components/Status'
import { useCategories, useCollection } from '../hooks/useCollection'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useRouteIds } from '../hooks/useRouteIds'
import { childLevel, LEVEL_LABELS, LEVEL_SINGULAR, routeFor, TERM_LABELS } from '../lib/paths'

// Splits subjects into their categories (in category order), then "أخرى" for the rest.
function groupByCategory(subjects, categories) {
  const known = new Set(categories.map((c) => c.id))
  const groups = categories.map((category) => ({
    category,
    items: subjects.filter((s) => s.categoryId === category.id),
  }))
  const others = subjects.filter((s) => !known.has(s.categoryId))
  if (others.length > 0) groups.push({ category: null, items: others })
  return groups
}

function EditDeleteButtons({ label, onEdit, onDelete }) {
  return (
    <>
      <button type="button" className="icon-button" aria-label={`تعديل ${label}`} title="تعديل" onClick={onEdit}>
        <Pencil size={18} aria-hidden="true" />
      </button>
      <button type="button" className="icon-button danger" aria-label={`حذف ${label}`} title="حذف" onClick={onDelete}>
        <Trash2 size={18} aria-hidden="true" />
      </button>
    </>
  )
}

function Cards({ ids, items, level, isAdmin, setDialog }) {
  return (
    <ul className="cards">
      {items.map((item) => (
        <li key={item.id} className="card-item">
          <Link className="card" to={routeFor([...ids, item.id])}>
            <span className="card-title">{item.name || item.id}</span>
            {level === 'exams' && (
              <span className="card-meta">
                {[item.year, TERM_LABELS[item.term], `${item.images?.length ?? 0} صفحة`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </Link>
          {isAdmin && (
            <div className="card-actions">
              <EditDeleteButtons
                label={item.name || item.id}
                onEdit={() => setDialog({ type: 'edit', item })}
                onDelete={() => setDialog({ type: 'delete', item })}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

// Lists the children of the current route: grades, sections, subjects or exams.
export function LevelPage() {
  const ids = useRouteIds()
  const { items, loading, error } = useCollection(ids)
  const isAdmin = useIsAdmin()
  const level = childLevel(ids)
  const isSubjects = level === 'subjects'
  const categories = useCategories(isSubjects ? ids : null)
  // { type: 'create' | 'edit' | 'delete' | 'createCategory' | 'editCategory' | 'deleteCategory', item?, categoryId? }
  const [dialog, setDialog] = useState(null)
  const closeDialog = () => setDialog(null)

  const groups = isSubjects && categories.items.length > 0 ? groupByCategory(items, categories.items) : null
  // Students don't need to see categories that have no subjects yet
  const visibleGroups = groups?.filter((g) => isAdmin || g.items.length > 0)

  return (
    <>
      <Breadcrumbs ids={ids} />
      <header className="page-header">
        <h1>{LEVEL_LABELS[level]}</h1>
        {isAdmin && (
          <div className="page-actions">
            {isSubjects && (
              <button type="button" onClick={() => setDialog({ type: 'createCategory' })}>
                <FolderPlus size={18} aria-hidden="true" />
                إضافة تصنيف
              </button>
            )}
            <button type="button" className="primary" onClick={() => setDialog({ type: 'create' })}>
              <Plus size={18} aria-hidden="true" />
              إضافة {LEVEL_SINGULAR[level]}
            </button>
          </div>
        )}
      </header>

      {loading || categories.loading ? (
        <Loading />
      ) : error || categories.error ? (
        <ErrorMessage error={error ?? categories.error} />
      ) : items.length === 0 && !(isAdmin && groups) ? (
        <Empty>لا توجد {LEVEL_LABELS[level]} بعد</Empty>
      ) : visibleGroups ? (
        visibleGroups.map(({ category, items: groupItems }) => (
          <section key={category?.id ?? '_others'} className="category">
            <header className="category-header">
              <h2>{category ? category.name || category.id : 'أخرى'}</h2>
              {isAdmin && category && (
                <div className="category-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`إضافة مادة إلى ${category.name}`}
                    title="إضافة مادة"
                    onClick={() => setDialog({ type: 'create', categoryId: category.id })}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </button>
                  <EditDeleteButtons
                    label={category.name || category.id}
                    onEdit={() => setDialog({ type: 'editCategory', item: category })}
                    onDelete={() =>
                      setDialog({ type: 'deleteCategory', item: category, count: groupItems.length })
                    }
                  />
                </div>
              )}
            </header>
            {groupItems.length === 0 ? (
              <p className="status">لا توجد مواد في هذا التصنيف بعد</p>
            ) : (
              <Cards ids={ids} items={groupItems} level={level} isAdmin={isAdmin} setDialog={setDialog} />
            )}
          </section>
        ))
      ) : (
        <Cards ids={ids} items={items} level={level} isAdmin={isAdmin} setDialog={setDialog} />
      )}

      {dialog?.type === 'create' && (
        <ItemFormDialog
          parentIds={ids}
          categories={categories.items}
          defaultCategoryId={dialog.categoryId}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'edit' && (
        <ItemFormDialog parentIds={ids} item={dialog.item} categories={categories.items} onClose={closeDialog} />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDeleteDialog ids={[...ids, dialog.item.id]} item={dialog.item} onClose={closeDialog} />
      )}
      {dialog?.type === 'createCategory' && <ItemFormDialog parentIds={ids} isCategory onClose={closeDialog} />}
      {dialog?.type === 'editCategory' && (
        <ItemFormDialog parentIds={ids} item={dialog.item} isCategory onClose={closeDialog} />
      )}
      {dialog?.type === 'deleteCategory' && (
        <CategoryDeleteDialog
          sectionIds={ids}
          category={dialog.item}
          subjectCount={dialog.count}
          onClose={closeDialog}
        />
      )}
    </>
  )
}

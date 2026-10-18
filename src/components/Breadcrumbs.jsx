import { Link } from 'react-router'
import { useDocument } from '../hooks/useDocument'
import { routeFor } from '../lib/paths'

function Crumb({ ids, isLast }) {
  const { data } = useDocument(ids)
  const label = data?.name || ids.at(-1)
  return (
    <li>
      {isLast ? <span aria-current="page">{label}</span> : <Link to={routeFor(ids)}>{label}</Link>}
    </li>
  )
}

export function Breadcrumbs({ ids }) {
  return (
    <nav aria-label="مسار التنقل" className="breadcrumbs">
      <ol>
        <li>
          {ids.length === 0 ? <span aria-current="page">الرئيسية</span> : <Link to="/">الرئيسية</Link>}
        </li>
        {ids.map((_, i) => (
          <Crumb key={i} ids={ids.slice(0, i + 1)} isLast={i === ids.length - 1} />
        ))}
      </ol>
    </nav>
  )
}

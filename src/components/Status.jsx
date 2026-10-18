import { errorMessage } from '../lib/errors'

export function Loading({ variant = 'cards', count = 6 }) {
  return (
    <ul className={variant === 'images' ? 'image-grid' : 'cards'} aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`skeleton skeleton-${variant}`} />
      ))}
    </ul>
  )
}

export function ErrorMessage({ error }) {
  return (
    <p className="status error" role="alert">
      {errorMessage(error)}
    </p>
  )
}

export function Empty({ children }) {
  return <p className="status empty">{children}</p>
}

import { useEffect, useRef } from 'react'

// Native <dialog> shown as a modal while mounted. Escape / backdrop click call onClose.
export function Modal({ title, onClose, wide, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // The backdrop belongs to the <dialog> itself, so check the click is outside its box
        if (e.target !== ref.current) return
        const box = ref.current.getBoundingClientRect()
        const inside =
          e.clientX >= box.left && e.clientX <= box.right &&
          e.clientY >= box.top && e.clientY <= box.bottom
        if (!inside) onClose()
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  )
}

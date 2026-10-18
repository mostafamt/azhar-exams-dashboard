import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'

const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5
const SWIPE_DISTANCE = 60

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const NO_ZOOM = { scale: 1, x: 0, y: 0 }

// Keeps the image from being panned off-screen
function bounded(stage, { scale, x, y }) {
  const box = stage.getBoundingClientRect()
  const maxX = ((scale - 1) * box.width) / 2
  const maxY = ((scale - 1) * box.height) / 2
  return { scale, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) }
}

// Zooms `from` to `scale`, keeping the point under (clientX, clientY) in place
function zoomAt(stage, from, scale, clientX, clientY) {
  scale = clamp(scale, 1, MAX_SCALE)
  const box = stage.getBoundingClientRect()
  const px = clientX - box.left - box.width / 2
  const py = clientY - box.top - box.height / 2
  const ratio = scale / from.scale
  return bounded(stage, { scale, x: px - (px - from.x) * ratio, y: py - (py - from.y) * ratio })
}

// Full-screen page viewer: swipe / arrow keys to change page, pinch, double-tap or
// ctrl+wheel to zoom, drag to pan while zoomed. The parent owns `index` (kept in the URL).
export function ImageViewer({ images, index, onIndexChange, onClose }) {
  const dialogRef = useRef(null)
  const stageRef = useRef(null)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(0)
  const [zoom, setZoom] = useState(NO_ZOOM)
  const [zoomIndex, setZoomIndex] = useState(index)
  const [interacting, setInteracting] = useState(false)

  // Each page opens unzoomed
  if (zoomIndex !== index) {
    setZoomIndex(index)
    setZoom(NO_ZOOM)
  }

  const image = images[index]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1
  const go = (delta) => {
    const next = index + delta
    if (next >= 0 && next < images.length) onIndexChange(next)
  }

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  // Warm the cache for the neighbouring pages
  useEffect(() => {
    for (const neighbour of [images[index - 1], images[index + 1]]) {
      if (neighbour) new Image().src = neighbour.url
    }
  }, [images, index])

  // ctrl+wheel / trackpad pinch: needs a non-passive listener so the browser doesn't zoom the page
  useEffect(() => {
    const stage = stageRef.current
    function handleWheel(e) {
      if (!e.ctrlKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setZoom((z) => zoomAt(stage, z, z.scale * factor, e.clientX, e.clientY))
    }
    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [])

  const stage = () => stageRef.current

  function handleKeyDown(e) {
    // Right-to-left: the next page is to the left
    if (e.key === 'ArrowLeft') go(1)
    else if (e.key === 'ArrowRight') go(-1)
    else if (e.key === '+' || e.key === '=') setZoom((z) => bounded(stage(), { ...z, scale: clamp(z.scale * 1.5, 1, MAX_SCALE) }))
    else if (e.key === '-') setZoom((z) => bounded(stage(), { ...z, scale: clamp(z.scale / 1.5, 1, MAX_SCALE) }))
    else if (e.key === '0') setZoom(NO_ZOOM)
  }

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setInteracting(true)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const points = [...pointers.current.values()]

    if (points.length === 2) {
      const [a, b] = points
      gesture.current = {
        type: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
      }
    } else if (points.length === 1) {
      gesture.current = { type: 'drag', startX: e.clientX, startY: e.clientY, zoom }
    }
  }

  function handlePointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current

    if (g?.type === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      setZoom(zoomAt(stage(), g.zoom, g.zoom.scale * (distance / g.distance), (a.x + b.x) / 2, (a.y + b.y) / 2))
    } else if (g?.type === 'drag' && g.zoom.scale > 1) {
      setZoom(bounded(stage(), { ...g.zoom, x: g.zoom.x + e.clientX - g.startX, y: g.zoom.y + e.clientY - g.startY }))
    }
  }

  function handlePointerUp(e) {
    const g = gesture.current
    pointers.current.delete(e.pointerId)

    if (g?.type === 'drag' && g.zoom.scale === 1) {
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
        // Right-to-left: swiping right brings in the next page from the left
        go(dx > 0 ? 1 : -1)
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        handleTap(e)
      }
    }
    // Lifting one finger of a pinch shouldn't turn into a swipe
    gesture.current = pointers.current.size > 0 ? { type: 'none' } : null
    if (pointers.current.size === 0) setInteracting(false)
  }

  function handleTap(e) {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      setZoom(zoom.scale > 1 ? NO_ZOOM : zoomAt(stage(), zoom, DOUBLE_TAP_SCALE, e.clientX, e.clientY))
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="viewer"
      aria-label={`صفحة ${index + 1} من ${images.length}`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="viewer-bar">
        <button type="button" className="viewer-button" onClick={onClose} aria-label="إغلاق">
          <X size={22} aria-hidden="true" />
        </button>
        <span className="viewer-counter">
          {index + 1} / {images.length}
        </span>
        <a className="viewer-button" href={image.url} target="_blank" rel="noreferrer" aria-label="فتح الصورة الأصلية">
          <ExternalLink size={20} aria-hidden="true" />
        </a>
      </div>

      <div
        ref={stageRef}
        className="viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          key={image.id}
          src={image.url}
          alt={`صفحة ${index + 1}`}
          draggable={false}
          style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            transition: interacting ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>

      {/* In RTL "previous" sits on the right, "next" on the left */}
      <button
        type="button"
        className="viewer-nav viewer-prev"
        onClick={() => go(-1)}
        disabled={!hasPrev}
        aria-label="الصفحة السابقة"
      >
        <ChevronRight size={32} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="viewer-nav viewer-next"
        onClick={() => go(1)}
        disabled={!hasNext}
        aria-label="الصفحة التالية"
      >
        <ChevronLeft size={32} aria-hidden="true" />
      </button>
    </dialog>
  )
}

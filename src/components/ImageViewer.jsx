import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'

const MAX_ZOOM = 4
const DOUBLE_TAP_ZOOM = 2.5
const SWIPE_DISTANCE = 60

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Full-screen page viewer. The page sits in a native scroll box, so wheel, trackpad,
// touch, keyboard and the scrollbar all scroll it. `zoom` is the page width as a
// fraction of the screen width: 1 (the default) fills the width, and it can go down
// to fitting the whole page. Swipe / arrow keys change page; pinch, double-tap or
// ctrl+wheel zoom. The parent owns `index` (kept in the URL).
export function ImageViewer({ images, index, onIndexChange, onClose }) {
  const dialogRef = useRef(null)
  const stageRef = useRef(null)
  // Point to keep still across a zoom: { fx, fy } fractions of the page, { px, py } in the stage
  const anchor = useRef(null)
  const touch = useRef(null)
  const drag = useRef(null)
  const lastTap = useRef(0)
  const [zoomState, setZoomState] = useState({ index, zoom: 1 })

  // Each page opens filling the width, scrolled to the top
  const zoom = zoomState.index === index ? zoomState.zoom : 1

  const image = images[index]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1
  const go = (delta) => {
    const next = index + delta
    if (next >= 0 && next < images.length) onIndexChange(next)
  }

  // Smallest zoom: the whole page fits on screen
  function minZoom() {
    const stage = stageRef.current
    const img = stage.querySelector('img')
    const aspect = image.width && image.height ? image.width / image.height : img.naturalWidth / img.naturalHeight || 1 / 1.414
    return Math.min(1, (stage.clientHeight * aspect) / stage.clientWidth)
  }

  // Zooms to `next`, keeping the point under (clientX, clientY) in place
  function zoomTo(next, clientX, clientY) {
    const stage = stageRef.current
    const img = stage.querySelector('img')
    next = clamp(next, minZoom(), MAX_ZOOM)
    if (next === zoom) return
    const box = stage.getBoundingClientRect()
    const page = img.getBoundingClientRect()
    const px = (clientX ?? box.left + box.width / 2) - box.left
    const py = (clientY ?? box.top + box.height / 2) - box.top
    anchor.current = {
      fx: (px + box.left - page.left) / page.width,
      fy: (py + box.top - page.top) / page.height,
      px,
      py,
    }
    setZoomState({ index, zoom: next })
  }

  // After a zoom renders, scroll so the anchored point is back under the pointer
  useLayoutEffect(() => {
    const a = anchor.current
    if (!a) return
    anchor.current = null
    const stage = stageRef.current
    const img = stage.querySelector('img')
    stage.scrollLeft = img.offsetLeft + a.fx * img.offsetWidth - a.px
    stage.scrollTop = img.offsetTop + a.fy * img.offsetHeight - a.py
  }, [zoom])

  useLayoutEffect(() => {
    stageRef.current.scrollTo(0, 0)
  }, [index])

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    // A modal dialog doesn't stop the site behind it from scrolling
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      dialog.close()
      root.style.overflow = overflow
    }
  }, [])

  // Warm the cache for the neighbouring pages
  useEffect(() => {
    for (const neighbour of [images[index - 1], images[index + 1]]) {
      if (neighbour) new Image().src = neighbour.url
    }
  }, [images, index])

  // ctrl+wheel / trackpad pinch and two-finger touch pinch need non-passive listeners
  // so the browser zooms the page instead of the whole site. Plain wheel scrolls natively.
  const zoomRef = useRef(zoomTo)
  useLayoutEffect(() => {
    zoomRef.current = zoomTo
  })
  useEffect(() => {
    const stage = stageRef.current
    let pinch = null

    function handleWheel(e) {
      if (!e.ctrlKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      zoomRef.current(Number(stage.dataset.zoom) * factor, e.clientX, e.clientY)
    }
    function handleTouchMove(e) {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const [a, b] = e.touches
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const zoom = Number(stage.dataset.zoom)
      if (!pinch) pinch = { distance, zoom }
      zoomRef.current(pinch.zoom * (distance / pinch.distance), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
    }
    function handleTouchEnd(e) {
      if (e.touches.length < 2) pinch = null
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    stage.addEventListener('touchmove', handleTouchMove, { passive: false })
    stage.addEventListener('touchend', handleTouchEnd)
    stage.addEventListener('touchcancel', handleTouchEnd)
    return () => {
      stage.removeEventListener('wheel', handleWheel)
      stage.removeEventListener('touchmove', handleTouchMove)
      stage.removeEventListener('touchend', handleTouchEnd)
      stage.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [])

  // Only swipe pages when the page doesn't scroll sideways
  const pansSideways = () => stageRef.current.scrollWidth > stageRef.current.clientWidth + 1

  function handleKeyDown(e) {
    const stage = stageRef.current
    // Right-to-left: the next page is to the left
    if (e.key === 'ArrowLeft' && !pansSideways()) go(1)
    else if (e.key === 'ArrowRight' && !pansSideways()) go(-1)
    else if (e.key === 'ArrowDown') stage.scrollBy({ top: 80 })
    else if (e.key === 'ArrowUp') stage.scrollBy({ top: -80 })
    else if (e.key === 'PageDown' || e.key === ' ') stage.scrollBy({ top: stage.clientHeight * 0.9 })
    else if (e.key === 'PageUp') stage.scrollBy({ top: -stage.clientHeight * 0.9 })
    else if (e.key === 'Home') stage.scrollTo({ top: 0 })
    else if (e.key === 'End') stage.scrollTo({ top: stage.scrollHeight })
    else if (e.key === '+' || e.key === '=') zoomTo(zoom * 1.5)
    else if (e.key === '-') zoomTo(zoom / 1.5)
    else if (e.key === '0') zoomTo(1)
    else return
    e.preventDefault()
  }

  function handleDoubleTap(clientX, clientY) {
    zoomTo(zoom > 1.01 ? 1 : DOUBLE_TAP_ZOOM, clientX, clientY)
  }

  // Touch: native scrolling; we only watch for swipes and double-taps
  function handleTouchStart(e) {
    touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
  }

  function handleTouchEnd(e) {
    const start = touch.current
    touch.current = null
    if (!start || e.touches.length > 0) return
    const { clientX, clientY } = e.changedTouches[0]
    const dx = clientX - start.x
    const dy = clientY - start.y
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5 && !pansSideways()) {
      // Right-to-left: swiping right brings in the next page from the left
      go(dx > 0 ? 1 : -1)
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        e.preventDefault() // no synthetic click / dblclick
        handleDoubleTap(clientX, clientY)
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
    }
  }

  // Mouse: drag to scroll
  function handlePointerDown(e) {
    // Presses on the stage itself (not the page) are on its scrollbars
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.tagName !== 'IMG') return
    const stage = stageRef.current
    drag.current = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop }
    stage.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    const d = drag.current
    if (!d) return
    const stage = stageRef.current
    stage.scrollLeft = d.left - (e.clientX - d.x)
    stage.scrollTop = d.top - (e.clientY - d.y)
  }

  function handlePointerUp(e) {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(e.clientY - d.y) && !pansSideways()) {
      go(dx > 0 ? 1 : -1)
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
        data-zoom={zoom}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={(e) => handleDoubleTap(e.clientX, e.clientY)}
      >
        <img
          key={image.id}
          src={image.url}
          alt={`صفحة ${index + 1}`}
          width={image.width}
          height={image.height}
          draggable={false}
          style={{ width: `${zoom * 100}%` }}
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

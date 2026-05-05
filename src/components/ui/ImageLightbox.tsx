import { Minus, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from './Button'

export function ImageLightbox({
  open,
  imageUrl,
  title,
  onClose,
}: {
  open: boolean
  imageUrl: string
  title?: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const canZoomOut = useMemo(() => zoom > 0.5, [zoom])
  const canZoomIn = useMemo(() => zoom < 4, [zoom])

  if (!open || !imageUrl) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close image preview"
        onClick={() => {
          setZoom(1)
          onClose()
        }}
      />
      <div className="relative z-10 w-full max-w-6xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold text-slate-100">{title ?? 'Image preview'}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="!bg-white !px-2 !py-2"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))))}
              disabled={!canZoomOut}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[4rem] text-center text-xs font-semibold text-slate-100">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="secondary"
              className="!bg-white !px-2 !py-2"
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.2).toFixed(2))))}
              disabled={!canZoomIn}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              className="!bg-white !px-2 !py-2"
              onClick={() => {
                setZoom(1)
                onClose()
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-2">
          <img
            src={imageUrl}
            alt={title ?? 'Product image'}
            className="mx-auto origin-top transition-transform duration-150"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>
      </div>
    </div>
  )
}

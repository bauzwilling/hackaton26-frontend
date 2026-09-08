import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { readPartColorHex } from '../partColors.js'
import type { BlockInsert } from '../types'

export interface BlockMarkerOverlayHandle {
  redraw(project: (x: number, y: number) => { left: number; top: number }, markerSizePx: number, selectedId: string, markerShape?: string): void
}

interface BlockMarkerOverlayProps {
  markers?: BlockInsert[]
  selectedId?: string
  markerShape?: string
}

const BlockMarkerOverlay = forwardRef<BlockMarkerOverlayHandle, BlockMarkerOverlayProps>(
  function BlockMarkerOverlay({ markers = [], selectedId = '', markerShape = 'cross' }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawState = useRef<{
      project: ((x: number, y: number) => { left: number; top: number }) | null
      size: number
      selectedId: string
      shape: string
    }>({ project: null, size: 8, selectedId, shape: markerShape })

    const paint = useCallback(() => {
      const canvas = canvasRef.current
      const parent = canvas?.parentElement
      const project = drawState.current.project
      if (!canvas || !parent || !project) return
      const rect = parent.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)
      const summary = getComputedStyle(document.documentElement).getPropertyValue('--color-text-summary').trim() || '#333333'
      const selected = readPartColorHex('orange') || '#ff8c00'
      const half = drawState.current.size / 2
      context.lineWidth = Math.max(1, Math.min(2, drawState.current.size * 0.05))
      for (const marker of markers) {
        const { left, top } = project(marker.x, marker.y)
        context.strokeStyle = marker.id === drawState.current.selectedId ? selected : summary
        context.beginPath()
        if (drawState.current.shape === 'circle') {
          context.arc(left, top, half, 0, Math.PI * 2)
        } else {
          context.moveTo(left - half, top)
          context.lineTo(left + half, top)
          context.moveTo(left, top - half)
          context.lineTo(left, top + half)
        }
        context.stroke()
      }
    }, [markers])

    useImperativeHandle(ref, () => ({
      redraw(project, markerSizePx, nextSelectedId, shape = 'cross') {
        drawState.current = { project: project as typeof drawState.current.project, size: markerSizePx, selectedId: nextSelectedId, shape }
        paint()
      },
    }), [paint])

    useEffect(() => {
      const parent = canvasRef.current?.parentElement
      if (!parent) return
      const observer = new ResizeObserver(paint)
      observer.observe(parent)
      return () => observer.disconnect()
    }, [paint])

    useEffect(() => {
      drawState.current.selectedId = selectedId
      drawState.current.shape = markerShape
      paint()
    }, [markerShape, paint, selectedId])

    return <canvas ref={canvasRef} className="block-markers-canvas" />
  },
)

export default BlockMarkerOverlay

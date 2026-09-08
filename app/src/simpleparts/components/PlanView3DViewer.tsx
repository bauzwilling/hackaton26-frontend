import { forwardRef } from 'react'
import Dxf2DViewer from './Dxf2DViewer'
import type { CameraState, UnknownRecord, ViewerHandle } from '../types'

interface PlanView3DViewerProps {
  dxf: UnknownRecord
  cameraStateToRestore?: CameraState | null
  hiddenLayers?: string[]
  showLayerPanel?: boolean
  showEditLayers?: boolean
  highlightColor: number
  selectedHandles?: string[]
  shadedHandlesFromSelection: (handles: string[]) => string[]
  onHiddenLayersChange?: (layers: string[]) => void
  onReady?: () => void
  onEditLayers?: () => void
}

const PlanView3DViewer = forwardRef<ViewerHandle, PlanView3DViewerProps>(function PlanView3DViewer({
  shadedHandlesFromSelection,
  ...props
}, ref) {
  return (
    <div className="plan-view-3d">
      <Dxf2DViewer
        ref={ref}
        {...props}
        pickingEnabled
        rectangleCrossingMode="center"
        highlightSafeHandles={shadedHandlesFromSelection}
      />
    </div>
  )
})

export default PlanView3DViewer

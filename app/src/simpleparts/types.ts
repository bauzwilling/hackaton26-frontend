export type UnknownRecord = Record<string, any>

export interface Point2 {
  x: number
  y: number
}

export interface BBox2 {
  minX: number
  minY: number
  maxX: number
  maxY: number
  centerX: number
  centerY: number
}

export interface PartBoundary {
  id: string
  memberHandles: string[]
  bbox?: BBox2
  layerOutliers?: UnknownRecord[]
  [key: string]: any
}

export interface BlockInsert extends Point2 {
  id: string
  name?: string
}

export interface CameraState {
  zoom: number
  worldTargetX: number
  worldTargetY: number
}

export interface ViewerHandle {
  getContainerEl(): HTMLElement | null
  getCamera(): any
  getControls(): any
  getCanvas(): HTMLCanvasElement | null
  getOriginOffset(): { x: number; y: number; z: number }
  captureCameraState(): CameraState | null
  restoreCameraState(state: CameraState | null): void
  applyHighlight(handles: string[]): void
  clearHighlight(): void
  zoomToEntity(handles: string[]): void
  setControlsChangeListener(listener: (() => void) | null): void
  resize(): void
  pickAtClient?(clientX: number, clientY: number): UnknownRecord | null
  pickInRect?(rect: UnknownRecord, mode: string): string[]
  partWorldCenter?(handle: string): BBox2 | null
}

export interface MaterialOption {
  id: string
  label: string
  allowedThicknessesMm: number[]
  allowedSizesMm: Point2[]
}

export type ChatMessageKind =
  | 'text' | 'file' | 'result' | 'error' | 'warning' | 'confirm'
  | 'text-position-select' | 'sheet-size-select' | 'material-select'
  | 'nesting-result' | 'thinking'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  kind: ChatMessageKind
  content: string
  meta?: UnknownRecord
}

export type MetadataOverrides = Record<string, Record<string, string>>

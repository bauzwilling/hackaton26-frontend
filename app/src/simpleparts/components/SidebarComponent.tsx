import ChatPanelComponent from './ChatPanelComponent'
import databLogo from '../assets/dataBLogo.png'
import type { ChatMessage, MaterialOption } from '../types'
import '../simpleparts-react.css'

interface SidebarProps {
  messages?: ChatMessage[]
  busy?: boolean
  busyMessage?: string
  hasBoxes?: boolean
  canStartNesting?: boolean
  canStopNesting?: boolean
  nestRevealPaused?: string | null
  canStartLeftoverNesting?: boolean
  nestingButtonPrompt?: string
  leftoverNestingButtonPrompt?: string
  nestingNeedsRerun?: boolean
  activeSheetSizeSelectId?: string | null
  activeSheetSizeConfirmId?: string | null
  activeMaterialSelectId?: string | null
  activeMaterialConfirmId?: string | null
  activeConfirmId?: string | null
  materials?: MaterialOption[]
  inputRequirementsOpenTick?: number
  onSendText?: (text: string) => void
  onAttachFile?: (file: File) => void
  onAttachError?: (message: string) => void
  onClearAll?: () => void
  onStartNesting?: () => void
  onStopNesting?: () => void
  onShowNestingResult?: () => void
  onSheetSizeChoice?: (choice: any) => void
  onModifySheetSize?: (choice: any) => void
  onMaterialChoice?: (choice: MaterialOption) => void
  onModifyMaterial?: (choice: any) => void
  onConfirmChoice?: (choice: any) => void
}

export default function SidebarComponent(props: SidebarProps) {
  return (
    <aside className="sidebar">
      <header className="brand">
        <img className="brand-logo" src={databLogo} alt="datab" width="32" height="42" />
        <h1>Simple Parts</h1>
      </header>
      <div className="chat-slot">
        <ChatPanelComponent {...props} />
      </div>
    </aside>
  )
}

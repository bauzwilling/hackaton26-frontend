# Studio Demo: Feedback Update

**Branch:** `LRL-SF-feedback` · 8 commits · ~50 files · +4,271 / −517

This update responds to the feedback received on the demo. The goal: a UI/UX demo that shows customers and investors the vision, with every role able to complete its part of the workflow. Nothing here depends on the new backend; admin data is session-only for now.

---

## 1. Feedback and status

| Feedback | Status | What was done / what is needed |
|---|---|---|
| Responsiveness is poor; zooming and moving windows often fails, especially on touchpad | **Addressed, needs re-test** | Canvas interaction reworked: drag to pan, stronger pinch/scroll zoom, far-zoom clicks now reach the canvas instead of being swallowed by window chrome, grid snap off while dragging. |
| Admin roles don't work | **Addressed** | New **Profile Manager** and **Machine Inventory** windows for admins (see section 2). |
| No role can show the whole process | **Partly addressed** | Each role now has a defined path (designer: tour; operator/manager: Jobs/Orbit; admin: Profile/Machine). Each role still needs a guided tour. For now only implemented for USER role. |
| Operator role gives no response, no zooming | **Addressed** | Operators get role-scoped Help, steered to Jobs/Orbit, plus the canvas fixes above. |
| Starting point should always be the same | **Addressed** | Every role lands on the shared hero and opens apps via Concierge; role-scoped suggestion chips steer operator, manager, and admin. The designer tour still begins from the hero and restores the previous workspace on exit. |
| Some windows appear locked automatically; how to unlock? | **Addressed** | Windows now have an explicit lock control in their chrome. Window locking, maximizing and hiding has been made more obvious. |
| Logic of window sorting unclear | **Addressed** | New app windows open one under the other. Their childres (Plyworks -> JoinWiz -> Nesting) open to the right of the parent. |

---

## 2. What changed

### Role-aware Help and Concierge
- **Help** opens a docked Concierge chat scoped to the user's role, replacing the old generic canvas tour.
- Offer chips: "what can I do?" and "give me a tour".
- Answers use each role's capabilities (`roleCapabilities.ts`, `prompts/concierge.md`).
- On-screen windows minimize when Help starts.

### Guided tour for designers (user role)
- Path: chrome, Concierge "design something", Plyworks, canvas windows, Produce.
- Starts from the home screen; exiting restores the previous workspace.
- Overlay controls to step through or exit.
- Only implemented for USER role and none other.

### Admin tools
- **Profile Manager:** add, edit, suspend, change Profiles.
- **Machine Inventory:** add, enable, disable machines.
- DataB (platform) admins manage all companies; company admins see only their own.
- Login, Orbit and Jobs pick up changes within the same browser tab.
- **Demo limit:** data lives in session-scoped stores (`directoryStore`, `companyStore`, `machineStore`) and is not persisted.

### Role-based windows and chat
- Each role can only open the windows it owns (designers: design apps; operators/managers: Jobs/Orbit; admins: Profile/Machine).
- For non-design roles, Concierge politely declines chat-driven design changes and points to the right screen instead of pretending to act.
- Attach, logs and file-drop hints are hidden where they don't apply.

### Window chrome
- Accent bars, lock control, fly-into-Windows animation when hiding.
- Selection menu at far zoom so windows stay usable when zoomed out.
- Maximize restores with a soft zoom-out.

### Canvas interaction (mouse, trackpad, touch)
- Primary-drag pans; pinch zoom is stronger; zoom buttons sit beside the chat.
- Box-drag (marquee) multi-select removed because it conflicted with pan, especially on touch.

### Landscape and mobile
- Portrait shows a "rotate" overlay; the app stays mounted, so no state is lost.
- On narrow screens Concierge becomes a slide-over drawer; the canvas stays full-bleed.
- Keyboard inset handling, safe areas, long-press as right-click, touch-friendlier Plyworks and Simple Parts viewers.

---

## 3. Fixes inside the larger changes

- **Two chats on the home screen:** right-click on the empty canvas no longer opens a second Ask menu next to the docked Concierge.
- **Far-zoom clicks:** clicks now reach the canvas instead of being eaten by window chrome.
- **Maximize restore:** no more awkward camera after restoring.
- **Phone keyboard:** the message box is no longer covered.
- **Rotation mid-session:** Studio state survives rotating the device.

---

## 4. Suggested walkthrough to verify

| Role | Try this |
|---|---|
| Designer (user) | Help, "Give me a tour", exit, confirm the previous layout returns. |
| Operator / Manager | Help, confirm it points to Jobs/Orbit; try zoom and pan; ask chat for a design change and confirm it declines politely. |
| Admin (company) | Open Profile Manager and Machine Inventory; confirm only the admin's own company is visible. |
| Admin (DataB) | Same windows; confirm all companies are visible. |
| Any role, trackpad | Pan, pinch/scroll zoom, move, lock, hide and re-find windows, zoom far out and select a window. |
| Phone / tablet | Rotate to landscape, open chat, type with keyboard open, pan and pinch the board. |

---

## 5. Known limits

- Admin profile/machine edits last for the browser session only (no database yet).
- Concierge guides non-design roles to the right screens; it does not operate Jobs/Orbit/admin actions by chat.
- Landscape-only is deliberate; portrait is not supported.

---

## 6. Open items

Confirmation of the **single agreed start state** (home screen with Concierge docked?) for all roles?

---

## Appendix: commits (oldest to newest)

1. `b03dfbf` Rewire Help to role-scoped Concierge chat
2. `1139f3d` Live user-role Studio tour, hero reset/restore
3. `74dbd99` Profile Manager and Machine Inventory (session-scoped admins)
4. `7c76f64` Per-role Concierge and Studio window allowlists
5. `15f98b0` Window chrome: accent, lock, hide fly, far-zoom menu
6. `f552b6b` Disable floating ask menu on Studio landing
7. `99d3a8f` Mouse/trackpad/touch canvas and landscape gate
8. `07a78f3` Mobile landscape: overlay chat and touch viewers

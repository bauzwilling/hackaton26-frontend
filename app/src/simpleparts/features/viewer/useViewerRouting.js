import { computed } from 'vue'

/**
 * Derive which viewer surface to show (dxf-vuer vs threejs).
 *
 * @param {ReturnType<import('../shared/createAppState.js').createAppState>} state
 */
export function useViewerRouting(state) {
  const showNestingMeshView = computed(
    () =>
      state.viewMode.value === 'input'
      && !state.postNestMetadataEditing.value
      && Boolean(
        state.summonedPreview.value?.assignedMeshes3d?.length
        || state.summonedPreview.value?.unassignedMeshes3d?.length,
      ),
  )

  const showMeshPreview = computed(
    () =>
      state.viewMode.value === 'input'
      && !showNestingMeshView.value
      && Boolean(state.meshPreview.value?.length),
  )

  const showPreviewNotice = computed(
    () =>
      state.viewMode.value === 'input'
      && !showNestingMeshView.value
      && !showMeshPreview.value
      && Boolean(state.previewNotice.value),
  )

  /** @type {import('vue').ComputedRef<'nestingMesh' | 'inputMesh' | 'notice' | 'empty'>} */
  const activeViewer = computed(() => {
    if (showNestingMeshView.value) return 'nestingMesh'
    if (showMeshPreview.value) return 'inputMesh'
    if (showPreviewNotice.value) return 'notice'
    return 'empty'
  })

  return {
    activeViewer,
    showNestingMeshView,
    showMeshPreview,
    showPreviewNotice,
  }
}

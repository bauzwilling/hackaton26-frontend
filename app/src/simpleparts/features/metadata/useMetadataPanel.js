import { computed } from 'vue'

export function useMetadataPanel(state) {
  const viewerClickForProperties = computed(
    () =>
      state.clickForProperties.value
      || (!!state.selectedFile.value && !state.showMetadataColors.value),
  )

  function markModified(handle) {
    const h = String(handle)
    if (!state.modifiedHandles.value.includes(h)) {
      state.modifiedHandles.value = [...state.modifiedHandles.value, h]
    }
  }

  function markModifiedPart(entry) {
    if (!entry) return
    const keys = [
      entry.partKey,
      entry.id,
      entry.selectionMeshId,
      entry.boundaryId,
      ...(entry.aliasKeys ?? []),
      ...(entry.memberHandles ?? []),
    ]
    for (const key of keys) {
      const k = String(key ?? '').trim()
      if (k) markModified(k)
    }
  }

  return {
    viewerClickForProperties,
    markModified,
    markModifiedPart,
  }
}

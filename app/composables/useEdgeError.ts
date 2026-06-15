// * Centralized mapping of back-office edge-function error codes to localized,
// * user-facing reasons. Every admin/employee mutation that fails should run its
// * caught error through here so the user always learns *why* it failed instead
// * of seeing a raw code (e.g. `club_has_products`) or nothing at all.
// *
// * Stores rethrow failures either as `new Error(err.message)` — where the
// * message *is* the edge code — or as the raw EdgeError (which also carries
// * `.code`). `edgeErrorCode()` handles both shapes.

// * Pull a stable machine code out of anything thrown by a store / invokeEdge.
export function edgeErrorCode(err: unknown): string | null {
  if (!err) return null
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown }
    if (typeof e.code === 'string' && e.code) return e.code
    if (typeof e.message === 'string' && e.message) return e.message
  }
  return null
}

export function useEdgeError() {
  const { t, te } = useI18n()
  const toast = useToast()

  // * Map a caught error to a localized reason. Unknown / undocumented codes
  // * fall back to a generic message so the user always learns *that* it failed.
  function edgeErrorMessage(err: unknown): string {
    const code = edgeErrorCode(err)
    if (code) {
      const key = `admin.edgeErrors.${code}`
      if (te(key)) return t(key)
    }
    return t('admin.edgeErrors._generic')
  }

  // * Pop an error toast with the mapped reason. Use for fire-and-forget
  // * actions (toggles, reorders, row actions) that have no inline error slot.
  function notifyEdgeError(err: unknown, title?: string) {
    toast.add({
      title: title ?? t('admin.edgeErrors._title'),
      description: edgeErrorMessage(err),
      color: 'error',
    })
  }

  return { edgeErrorMessage, notifyEdgeError, edgeErrorCode }
}

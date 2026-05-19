// * Wrapper around supabase.functions.invoke() that returns a typed result and
// * surfaces HTTP-level and function-level errors in a consistent shape.
// * Every admin/employee mutation in the UI goes through this composable.
export interface EdgeError {
  status: number
  code?: string
  message: string
  detail?: unknown
}

export async function invokeEdge<T = unknown>(
  name: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ data: T | null; error: EdgeError | null }> {
  const client = useSupabaseClient()
  const { method = 'POST', body, query } = options

  let path = name
  if (query) {
    const qs = new URLSearchParams(query).toString()
    path = `${name}?${qs}`
  }

  try {
    const { data, error } = await client.functions.invoke<T>(path, {
      method,
      body: body === undefined ? undefined : body,
    })
    if (error) {
      // * Supabase wraps non-2xx as FunctionsHttpError; try to extract the JSON body
      let parsed: any = null
      const ctx = (error as any).context
      if (ctx?.response) {
        try {
          parsed = await ctx.response.clone().json()
        } catch {
          parsed = null
        }
      }
      return {
        data: null,
        error: {
          status: ctx?.response?.status ?? 500,
          code: parsed?.error,
          message: parsed?.error ?? error.message ?? 'Edge function error',
          detail: parsed,
        },
      }
    }
    return { data: data ?? null, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { data: null, error: { status: 500, message } }
  }
}

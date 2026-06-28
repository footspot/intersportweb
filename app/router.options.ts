import type { RouterConfig } from '@nuxt/schema'

// * Scroll handling for the SPA. The storefront home flow drives its own
// * in-page scrolling (useHomeFlow.scrollToSelector), so a router-issued
// * scroll-to-top on a same-path query change (e.g. selecting a club adds
// * `?club=…`) must NOT fire — it caused a jump-to-top that the flow then had to
// * scroll back down from (the visible "up then down" before landing).
export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    // * Back/forward — honour the remembered position.
    if (savedPosition) return savedPosition
    // * Anchor links — let the browser handle the hash target.
    if (to.hash) return { el: to.hash, top: 0 }
    // * Same path, only the query changed — keep the current scroll; the home
    // * flow scrolls to the right section itself.
    if (to.path === from.path) return false
    // * A real page change — start at the top.
    return { top: 0 }
  },
}

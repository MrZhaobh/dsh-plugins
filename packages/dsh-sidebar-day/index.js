//#region lib/types/index.js
/**
 * Sidebar day browser, node half. Pure UI plugin: the empty apply exists so the
 * plugin appears in the host cordis.yml / Loader (load and lifecycle follow the
 * host; the browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration).
 */
/** Host plugin body — no host-side behavior for the sidebar day browser. */
function apply() {}
//#endregion
export { apply };

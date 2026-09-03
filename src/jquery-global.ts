import $ from "jquery";
import Popper from "popper.js";

/**
 * bootstrap-material-design's dist is an inconsistent UMD: its header `require`s
 * `jquery` and `popper.js`, but the plugin registrations inside are bootstrap 4
 * source that closes over the *bare globals* `jQuery` and `Popper`. `arrive` does
 * the same -- its factory ends `})(window, typeof jQuery === 'undefined' ? null :
 * jQuery, undefined)`.
 *
 * So the globals have to exist, but they used to be filled by CDN script tags in
 * index.html while the bundler pulled in a second, separate copy for the `require`
 * calls -- two jQueries on the page (a slim 3.2.1 and a full 3.7.1) with plugins
 * split across them. Publishing the bundled copies as the globals here collapses
 * that to one instance each.
 *
 * This must be its own module: `import` declarations are hoisted, so an assignment
 * sitting alongside `import "bootstrap-material-design"` would run too late.
 * See vendor-globals.ts for the ordering.
 */
window.jQuery = window.$ = $;
window.Popper = Popper;

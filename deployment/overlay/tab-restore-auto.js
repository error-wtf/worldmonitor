/* Retired compatibility hook. Panel visibility is owned synchronously by
 * PanelLayoutManager; this file must never manufacture tabs or reload the page. */
(() => { 'use strict'; window.__wmTabRestoreAuto = true; })();

// src/content.js - wiring only. Loads after data.js + render.js.
(function () {
    'use strict';

    const REFRESH_INTERVAL_MS = 60 * 1000; // poll every 60s
    const { getUsageInfo } = window.GrokRL.data;
    const { renderChip, hideChip, findModeSelectWrapper, CHIP_ID } = window.GrokRL.render;

    async function refresh() {
        try {
            const info = await getUsageInfo();
            renderChip(info);
        } catch (e) {
            hideChip(); // not logged in, fetch failed, etc.
        }
    }

    refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);

    // Re-render on SPA navigation / DOM changes (query bar mounts async).
    const observer = new MutationObserver(() => {
        if (!document.getElementById(CHIP_ID) && findModeSelectWrapper()) {
            refresh();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
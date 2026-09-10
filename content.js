(function () {
    'use strict';

    // ============================================================
    // DATA LAYER
    // ============================================================

    const REFRESH_INTERVAL_MS = 60 * 1000; // poll every 60s
    const CHIP_ID = 'grok-rate-limit-chip';

    // Map the label shown on the native model-select button ("Fast", "Expert", ...)
    // to the modelName string the rate-limits API expects. Extend as needed.
    const MODEL_LABEL_TO_API_NAME = {
        'Fast': 'grok-3',
        'Expert': 'grok-4',
        'Auto': 'grok-3'
    };
    const DEFAULT_MODEL_NAME = 'grok-3';
    const DEFAULT_REQUEST_KIND = 'DEFAULT';

    function getCurrentModelLabel() {
        const trigger = document.querySelector('#model-select-trigger');
        if (!trigger) return null;
        const span = trigger.querySelector('span.truncate');
        return span ? span.textContent.trim() : null;
    }

    function getCurrentModelApiName() {
        const label = getCurrentModelLabel();
        return (label && MODEL_LABEL_TO_API_NAME[label]) || DEFAULT_MODEL_NAME;
    }

    async function fetchRateLimits(requestKind, modelName) {
        const res = await fetch('https://grok.com/rest/rate-limits', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestKind, modelName })
        });
        if (!res.ok) throw new Error('rate-limits fetch failed: ' + res.status);
        return res.json(); // { totalQueries, remainingQueries, windowSizeSeconds, ... }
    }

    async function fetchActiveSubscription() {
        try {
            const res = await fetch('https://grok.com/rest/subscriptions', {
                method: 'GET',
                credentials: 'include'
            });
            if (!res.ok) return null;
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.subscriptions || []);
            return list.find(s => s.status === 'SUBSCRIPTION_STATUS_ACTIVE') || null;
        } catch (e) {
            return null;
        }
    }

    // Minimal protobuf field walk (length-delimited / varint only, enough for this response).
    function decodeProtoFields(bytes) {
        const fields = {};
        let i = 0;
        while (i < bytes.length) {
            const tagByte = bytes[i];
            const fieldNum = tagByte >> 3;
            const wireType = tagByte & 0x07;
            i++;
            if (wireType === 0) { // varint
                let val = 0, shift = 0, b;
                do { b = bytes[i++]; val |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
                fields[fieldNum] = val;
            } else if (wireType === 5) { // fixed32 (float)
                const buf = bytes.slice(i, i + 4);
                fields[fieldNum] = new DataView(buf.buffer, buf.byteOffset, 4).getFloat32(0, true);
                i += 4;
            } else if (wireType === 1) { // fixed64
                i += 8;
            } else if (wireType === 2) { // length-delimited
                let len = 0, shift = 0, b;
                do { b = bytes[i++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
                fields[fieldNum] = bytes.slice(i, i + len);
                i += len;
            } else {
                break; // unknown wire type, bail
            }
        }
        return fields;
    }

    async function fetchCreditsConfig() {
        const res = await fetch('https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/grpc-web+proto',
                'X-Grpc-Web': '1'
            },
            body: new Uint8Array([0, 0, 0, 0, 0]) // empty request message
        });
        if (!res.ok) throw new Error('credits-config fetch failed: ' + res.status);
        const buf = new Uint8Array(await res.arrayBuffer());
        // grpc-web frame: 1 byte flag + 4 byte length prefix before the actual proto message
        const msgBytes = buf.slice(5);
        const fields = decodeProtoFields(msgBytes);
        return {
            usedPercent: typeof fields[1] === 'number' ? fields[1] : null,
            periodEndUnix: typeof fields[5] === 'number' ? fields[5] : null
        };
    }

    async function getUsageInfo() {
        const sub = await fetchActiveSubscription();
        const isPaid = !!sub;

        if (isPaid) {
            const credits = await fetchCreditsConfig();
            return {
                tier: 'paid',
                used: credits.usedPercent,
                total: 100,
                displayMode: 'percent', // no raw count available for paid tier
                resetLabel: credits.periodEndUnix
                    ? new Date(credits.periodEndUnix * 1000).toLocaleString()
                    : 'unknown'
            };
        }

        const modelName = getCurrentModelApiName();
        const data = await fetchRateLimits(DEFAULT_REQUEST_KIND, modelName);
        const used = data.totalQueries - data.remainingQueries;
        return {
            tier: 'free',
            used,
            total: data.totalQueries,
            displayMode: 'fraction',
            modelLabel: getCurrentModelLabel() || modelName,
            resetLabel: 'rolling ' + Math.round((data.windowSizeSeconds || 86400) / 3600) + 'h'
        };
    }

    // ============================================================
    // RENDER LAYER
    // ============================================================

    function getColorForPercentage(usedPercent) {
        if (usedPercent < 50) return '#a1a1aa';
        if (usedPercent < 75) return '#ca8a04';
        if (usedPercent < 88) return '#eab308';
        if (usedPercent < 94) return '#f97316';
        return '#ef4444';
    }

    function isNativeCreditsButton(btn) {
        if (!btn || btn.tagName !== 'BUTTON') return false;
        const aria = btn.getAttribute('aria-label') || '';
        if (!/credits used/i.test(aria)) return false;
        const paths = btn.querySelectorAll('svg path');
        let hasNeedle = false, hasArc = false;
        for (const p of paths) {
            const d = p.getAttribute('d') || '';
            if (d.includes('m12 14 4-4')) hasNeedle = true;
            if (d.includes('M3.34 19')) hasArc = true;
        }
        return hasNeedle && hasArc;
    }

    function findNativeCreditsButton() {
        const header = document.querySelector('header') || document.body;
        for (const btn of header.querySelectorAll('button[aria-label*="credits used"]')) {
            if (isNativeCreditsButton(btn)) return btn;
        }
        return null;
    }

    function findModeSelectWrapper() {
        return document.querySelector('[data-query-bar-mode-select]');
    }

    function buildChip() {
        const chip = document.createElement('div');
        chip.id = CHIP_ID;
        chip.className = 'inline-flex items-center gap-1 h-10 px-3 rounded-full text-sm font-semibold';
        chip.innerHTML = `
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 14 4-4"></path>
                <path d="M3.34 19a10 10 0 1 1 17.32 0"></path>
            </svg>
            <span class="grok-rate-limit-text"></span>
        `;
        return chip;
    }

    function getOrCreateChip() {
        let chip = document.getElementById(CHIP_ID);
        if (chip) return chip;

        const wrapper = findModeSelectWrapper();
        if (!wrapper || !wrapper.parentElement) return null;

        chip = buildChip();
        wrapper.parentElement.insertBefore(chip, wrapper);
        return chip;
    }

    function renderTooltip(chip, info) {
        chip.title = info.tier === 'free'
            ? `Model: ${info.modelLabel}\nResets: ${info.resetLabel}`
            : `Plan: Paid\nResets: ${info.resetLabel}`;
    }

    function renderChip(info) {
        const nativeBtn = findNativeCreditsButton();
        const usedPercent = info.total ? (info.used / info.total) * 100 : 0;
        const color = getColorForPercentage(usedPercent);

        if (nativeBtn) {
            // Skin the native button instead of injecting our own element.
            nativeBtn.style.color = color;
            const existing = document.getElementById(CHIP_ID);
            if (existing) existing.remove();
            nativeBtn.title = info.tier === 'free'
                ? `Model: ${info.modelLabel}\nResets: ${info.resetLabel}`
                : `Plan: Paid\nResets: ${info.resetLabel}`;
            return;
        }

        const chip = getOrCreateChip();
        if (!chip) return;

        chip.style.color = color;
        const textEl = chip.querySelector('.grok-rate-limit-text');
        textEl.textContent = info.displayMode === 'fraction'
            ? `${info.used}/${info.total}`
            : `${Math.round(usedPercent)}%`;
        renderTooltip(chip, info);
    }

    function hideChip() {
        const chip = document.getElementById(CHIP_ID);
        if (chip) chip.remove();
    }

    // ============================================================
    // ORCHESTRATION
    // ============================================================

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

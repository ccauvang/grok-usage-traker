// src/render.js - build/skin the chip. No fetch calls here.
(function () {
    'use strict';

    const CHIP_ID = 'grok-rate-limit-chip';

    function getColorForPercentage(usedPercent) {
        if (usedPercent < 50) return '#a1a1aa';
        if (usedPercent < 75) return '#FCE5B5';
        if (usedPercent < 88) return '#FFC824';
        if (usedPercent < 94) return '#FF7E22';
        return '#FF3838';
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
        if (!wrapper) return null;

        chip = buildChip();
        // inside wrapper, not before it - parent layout changed, sibling now lands on its own row
        wrapper.prepend(chip);
        return chip;
    }

    function tooltipText(info) {
        return info.tier === 'free'
            ? `Model: ${info.modelLabel}\nResets: ${info.resetLabel}`
            : `Plan: Paid\nResets: ${info.resetLabel}`;
    }

    function renderChip(info) {
        const nativeBtn = findNativeCreditsButton();
        const usedPercent = info.total ? ((info.total - info.used) / info.total) * 100 : 0;
        const color = getColorForPercentage(usedPercent);

        if (nativeBtn) {
            // Skin native button instead of injecting our own element.
            nativeBtn.style.color = color;
            const existing = document.getElementById(CHIP_ID);
            if (existing) existing.remove();
            nativeBtn.title = tooltipText(info);
            return;
        }

        const chip = getOrCreateChip();
        if (!chip) return;

        chip.style.color = color;
        const textEl = chip.querySelector('.grok-rate-limit-text');
        textEl.textContent = info.displayMode === 'fraction'
            ? `${info.used}/${info.total}`
            : `${Math.round(usedPercent)}%`;
        chip.title = tooltipText(info);
    }

    function hideChip() {
        const chip = document.getElementById(CHIP_ID);
        if (chip) chip.remove();
    }

    window.GrokRL = window.GrokRL || {};
    window.GrokRL.render = { renderChip, hideChip, findModeSelectWrapper, CHIP_ID };
})();
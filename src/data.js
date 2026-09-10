// src/data.js - fetch + parse rate limit / billing data. No DOM writes here.
(function () {
    'use strict';

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
        // grpc-web frame: 1 byte flag + 4 byte length prefix before actual proto message
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
        const used = data.remainingQueries;
        return {
            tier: 'free',
            used: used,
            total: data.totalQueries,
            displayMode: 'fraction',
            modelLabel: getCurrentModelLabel() || modelName,
            resetLabel: 'rolling ' + Math.round((data.windowSizeSeconds || 86400) / 3600) + 'h'
        };
    }

    window.GrokRL = window.GrokRL || {};
    window.GrokRL.data = { getUsageInfo };
})();
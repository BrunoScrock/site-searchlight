/* Prospecção Web — Camada de persistência local.
   Hoje usa localStorage; a interface StorageAdapter permite trocar por
   Supabase, Firebase ou um backend próprio sem alterar a interface. */

const StorageAdapter = (function () {
    "use strict";

    const PREFIX = "pw:";

    const KEYS = {
        prospects: PREFIX + "prospects",
        history: PREFIX + "history",
        cache: PREFIX + "cache",
        prefs: PREFIX + "prefs",
        metrics: PREFIX + "metrics"
    };

    let available = null;
    const memoryFallback = {};

    function isAvailable() {
        if (available !== null) return available;
        try {
            const key = PREFIX + "__test";
            window.localStorage.setItem(key, "1");
            window.localStorage.removeItem(key);
            available = true;
        } catch (error) {
            available = false;
        }
        return available;
    }

    function readRaw(key) {
        if (!isAvailable()) {
            return Object.prototype.hasOwnProperty.call(memoryFallback, key) ? memoryFallback[key] : null;
        }
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeRaw(key, value) {
        if (!isAvailable()) {
            memoryFallback[key] = value;
            return true;
        }
        try {
            window.localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.warn("[Prospecção Web] Não foi possível gravar no localStorage:", error && error.message);
            return false;
        }
    }

    function removeRaw(key) {
        if (!isAvailable()) {
            delete memoryFallback[key];
            return true;
        }
        try {
            window.localStorage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    function get(key, fallback) {
        const raw = readRaw(key);
        if (raw == null) return fallback;
        return Utils.safeJsonParse(raw, fallback);
    }

    function set(key, value) {
        return writeRaw(key, JSON.stringify(value));
    }

    function remove(key) {
        return removeRaw(key);
    }

    function estimateUsage() {
        if (!isAvailable()) return 0;
        let total = 0;
        Object.keys(KEYS).forEach(function (name) {
            const value = window.localStorage.getItem(KEYS[name]);
            if (value) total += value.length * 2;
        });
        return total;
    }

    function clearAll() {
        Object.keys(KEYS).forEach(function (name) { removeRaw(KEYS[name]); });
        return true;
    }

    return {
        KEYS: KEYS,
        PREFIX: PREFIX,
        isAvailable: isAvailable,
        get: get,
        set: set,
        remove: remove,
        estimateUsage: estimateUsage,
        clearAll: clearAll
    };
})();

const Store = (function () {
    "use strict";

    const KEYS = StorageAdapter.KEYS;
    const MAX_HISTORY = 50;
    const MAX_CACHE_ENTRIES = 20;

    /* ---------- preferências ---------- */

    function getPrefs() {
        return StorageAdapter.get(KEYS.prefs, {});
    }

    function setPref(key, value) {
        const prefs = getPrefs();
        prefs[key] = value;
        StorageAdapter.set(KEYS.prefs, prefs);
        return prefs;
    }

    function mergePrefs(partial) {
        const prefs = Object.assign(getPrefs(), partial || {});
        StorageAdapter.set(KEYS.prefs, prefs);
        return prefs;
    }

    function resetPrefs() {
        StorageAdapter.remove(KEYS.prefs);
        return {};
    }

    /* ---------- prospecções (§25, §26, §27) ---------- */

    function listProspects() {
        const list = StorageAdapter.get(KEYS.prospects, []);
        return Array.isArray(list) ? list : [];
    }

    function saveProspects(list) {
        return StorageAdapter.set(KEYS.prospects, list);
    }

    function makeProspectKey(business) {
        return [business.providerId || business.id || "", Utils.normalizeBusinessName(business.name), Utils.phoneDigits(business.phone), Utils.normalizeAddress(business.address).slice(0, 40)].join("|");
    }

    function getProspectById(id) {
        return listProspects().find(function (item) { return item.id === id; }) || null;
    }

    function findProspect(business) {
        const key = makeProspectKey(business);
        return listProspects().find(function (item) { return item.key === key || item.id === business.id; }) || null;
    }

    function isProspectSaved(business) {
        return !!findProspect(business);
    }

    function addProspect(business) {
        const existing = findProspect(business);
        if (existing) return { added: false, prospect: existing };
        const prospect = {
            id: Utils.uid("pr"),
            key: makeProspectKey(business),
            name: business.name || "",
            category: business.category || "",
            subcategory: business.subcategory || "",
            country: business.country || "",
            state: business.state || "",
            city: business.city || "",
            neighborhood: business.neighborhood || "",
            location: formatLocation(business),
            address: business.address || "",
            phone: business.phone || "",
            website: business.website || "",
            instagram: (business.socials && business.socials.instagram) || business.instagram || "",
            facebook: (business.socials && business.socials.facebook) || business.facebook || "",
            tiktok: (business.socials && business.socials.tiktok) || business.tiktok || "",
            youtube: (business.socials && business.socials.youtube) || business.youtube || "",
            mapsUrl: business.mapsUrl || "",
            rating: business.rating || "",
            reviews: business.reviews || "",
            status: business.status || "",
            statusLabel: business.statusLabel || "",
            reason: business.reason || "",
            score: business.opportunity ? business.opportunity.score : 0,
            leadStatus: "Novo",
            notes: "",
            provider: business.provider || "",
            providerId: business.id || "",
            searchedAt: business.searchedAt || new Date().toISOString(),
            savedAt: new Date().toISOString()
        };
        const list = listProspects();
        list.unshift(prospect);
        saveProspects(list);
        return { added: true, prospect: prospect };
    }

    function removeProspect(id) {
        const list = listProspects();
        const next = list.filter(function (item) { return item.id !== id; });
        saveProspects(next);
        return list.length !== next.length;
    }

    function updateProspect(id, changes) {
        const list = listProspects();
        let updated = null;
        const next = list.map(function (item) {
            if (item.id !== id) return item;
            updated = Object.assign({}, item, changes, { updatedAt: new Date().toISOString() });
            return updated;
        });
        if (updated) saveProspects(next);
        return updated;
    }

    function setLeadStatus(id, leadStatus) {
        return updateProspect(id, { leadStatus: leadStatus });
    }

    function setNotes(id, notes) {
        return updateProspect(id, { notes: notes });
    }

    function clearProspects() {
        StorageAdapter.remove(KEYS.prospects);
        return true;
    }

    function formatLocation(business) {
        return [business.neighborhood, business.city, business.state, business.country]
            .filter(function (part) { return part && String(part).trim(); })
            .join(" · ");
    }

    /* ---------- histórico (§46) ---------- */

    function listHistory() {
        const list = StorageAdapter.get(KEYS.history, []);
        return Array.isArray(list) ? list : [];
    }

    function addHistory(entry) {
        const list = listHistory();
        const record = {
            id: Utils.uid("hs"),
            label: buildHistoryLabel(entry.params || {}),
            params: Object.assign({}, entry.params || {}),
            total: entry.total || 0,
            summary: entry.summary || null,
            searchedAt: entry.searchedAt || new Date().toISOString()
        };
        const signature = JSON.stringify(record.params);
        const withoutSame = list.filter(function (item) { return JSON.stringify(item.params) !== signature; });
        withoutSame.unshift(record);
        saveHistory(withoutSame.slice(0, MAX_HISTORY));
        return record;
    }

    function saveHistory(list) {
        return StorageAdapter.set(KEYS.history, list.slice(0, MAX_HISTORY));
    }

    function buildHistoryLabel(params) {
        const parts = [params.city, params.category, params.state, params.country].filter(function (part) {
            return part && String(part).trim();
        });
        return parts.length ? parts.join(" · ") : "Busca sem local";
    }

    function removeHistory(id) {
        const list = listHistory();
        saveHistory(list.filter(function (item) { return item.id !== id; }));
        return true;
    }

    function clearHistory() {
        StorageAdapter.remove(KEYS.history);
        return true;
    }

    /* ---------- cache com TTL (§68) ---------- */

    function readCache() {
        const cache = StorageAdapter.get(KEYS.cache, {});
        const now = Date.now();
        const valid = {};
        Object.keys(cache).forEach(function (key) {
            const entry = cache[key];
            if (!entry || typeof entry !== "object") return;
            if (entry.expiresAt && entry.expiresAt < now) return;
            valid[key] = entry;
        });
        if (Object.keys(valid).length !== Object.keys(cache).length) {
            StorageAdapter.set(KEYS.cache, valid);
        }
        return valid;
    }

    function getCached(key) {
        if (!CONFIG.cacheEnabled) return null;
        const entry = readCache()[key];
        return entry ? entry.value : null;
    }

    function setCached(key, value) {
        if (!CONFIG.cacheEnabled) return false;
        const cache = readCache();
        cache[key] = { value: value, createdAt: Date.now(), expiresAt: Date.now() + CONFIG.cacheTtlMs };
        const keys = Object.keys(cache);
        if (keys.length > MAX_CACHE_ENTRIES) {
            keys
                .sort(function (a, b) { return cache[a].createdAt - cache[b].createdAt; })
                .slice(0, keys.length - MAX_CACHE_ENTRIES)
                .forEach(function (key2) { delete cache[key2]; });
        }
        return StorageAdapter.set(KEYS.cache, cache);
    }

    function clearCache() {
        StorageAdapter.remove(KEYS.cache);
        return true;
    }

    /* ---------- métricas (§45) ---------- */

    function getMetrics() {
        return StorageAdapter.get(KEYS.metrics, { searches: 0, businessesFound: 0, withoutWebsite: 0, withWebsite: 0, firstSearchAt: null });
    }

    function recordSearch(summary) {
        const metrics = getMetrics();
        metrics.searches += 1;
        metrics.businessesFound += (summary && summary.total) || 0;
        metrics.withoutWebsite += (summary && summary.withoutWebsite) || 0;
        metrics.withWebsite += (summary && summary.withWebsite) || 0;
        if (!metrics.firstSearchAt) metrics.firstSearchAt = new Date().toISOString();
        StorageAdapter.set(KEYS.metrics, metrics);
        return metrics;
    }

    function resetMetrics() {
        StorageAdapter.set(KEYS.metrics, { searches: 0, businessesFound: 0, withoutWebsite: 0, withWebsite: 0, firstSearchAt: null });
        return true;
    }

    /* ---------- geral ---------- */

    function clearEverything() {
        return StorageAdapter.clearAll();
    }

    function getSnapshot() {
        return {
            prospects: listProspects(),
            history: listHistory(),
            metrics: getMetrics(),
            prefs: getPrefs(),
            storageAvailable: StorageAdapter.isAvailable(),
            estimatedBytes: StorageAdapter.estimateUsage()
        };
    }

    return {
        getPrefs: getPrefs,
        setPref: setPref,
        mergePrefs: mergePrefs,
        resetPrefs: resetPrefs,
        listProspects: listProspects,
        getProspectById: getProspectById,
        findProspect: findProspect,
        isProspectSaved: isProspectSaved,
        addProspect: addProspect,
        removeProspect: removeProspect,
        updateProspect: updateProspect,
        setLeadStatus: setLeadStatus,
        setNotes: setNotes,
        clearProspects: clearProspects,
        listHistory: listHistory,
        addHistory: addHistory,
        removeHistory: removeHistory,
        clearHistory: clearHistory,
        getCached: getCached,
        setCached: setCached,
        clearCache: clearCache,
        getMetrics: getMetrics,
        recordSearch: recordSearch,
        resetMetrics: resetMetrics,
        clearEverything: clearEverything,
        getSnapshot: getSnapshot,
        isAvailable: StorageAdapter.isAvailable
    };
})();

/* Prospecção Web — Utilitários de normalização, formatação e I/O. */

const Utils = (function () {
    "use strict";

    const SOCIAL_SUFFIXES = ["ltda", "me", "eireli", "s.a", "sa", "e.p", "inc", "llc", "ltd", "limited", "co", "corp", "company", "grupo", "comercio", "comERCIO", "solucoes", "prestacao", "servicos", "center", "centro"];

    const LEGAL_NOISE = /\b(ltda|me|eireli|epp|s\.?a\.?|s\.?r\.?|inc\.?|llc|ltd\.?|limited|corp\.?|company|co\.?|grupo|comercio|comercio|comercial|servicos|servicos|solucoes|solucoes|prestacao|prestacao|do|da|dos|das|de|em|e)\b/g;

    function stripAccents(value) {
        return String(value == null ? "" : value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function slugify(value) {
        return stripAccents(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60);
    }

    function collapseSpaces(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }

    /* ---------- normalizações (§49) ---------- */

    function normalizeUrl(input) {
        let value = collapseSpaces(input);
        if (!value) return "";
        if (/^(javascript|mailto|tel|data|about):/i.test(value)) return "";
        value = value.replace(/^["'<(\s]+|["'>)\s.,]+$/g, "");
        if (/^www\./i.test(value)) value = "http://" + value;
        else if (!/^https?:\/\//i.test(value)) {
            if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?)/i.test(value)) return "";
            value = "http://" + value;
        }
        try {
            const parsed = new URL(value);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
            if (!parsed.hostname.includes(".")) return "";
            return parsed.toString();
        } catch (error) {
            return "";
        }
    }

    function isValidUrl(input) {
        return normalizeUrl(input) !== "";
    }

    function getHostname(input) {
        const normalized = normalizeUrl(input);
        if (!normalized) return "";
        try {
            return new URL(normalized).hostname.toLowerCase();
        } catch (error) {
            return "";
        }
    }

    function normalizeDomain(input) {
        const host = getHostname(input);
        return host.replace(/^www\d?\./, "").replace(/\.$/, "");
    }

    function getDomainLabel(input) {
        const domain = normalizeDomain(input);
        if (!domain) return "";
        const parts = domain.split(".");
        if (parts.length < 2) return domain;
        const tld = parts[parts.length - 2];
        return parts[parts.length - 3] || parts[0];
    }

    function isSubDomainOf(host, domain) {
        if (!host || !domain) return false;
        return host === domain || host.endsWith("." + domain);
    }

    /* Converte para E.164 quando possível.
       National: BR 10/11 dígitos (2+8 ou 2+9), US/CA 10, demais países 6..12. */
    const NATIONAL_LENGTHS = { "55": [10, 11], "1": [10], "351": [9], "34": [9], "44": [9, 10], "49": [10, 11], "39": [9, 10], "61": [9] };

    function normalizePhone(input, defaultDial) {
        let value = collapseSpaces(input);
        if (!value) return "";
        let prefix = "";
        if (value.indexOf("+") === 0) {
            prefix = "+";
            value = value.slice(1);
        } else if (/^00\d/.test(value)) {
            prefix = "+";
            value = value.slice(2);
        }
        let digits = value.replace(/\D/g, "");
        if (!digits) return "";
        /* Mantém o zero de discagem nacional (ex.: 0XX do Brasil). */
        digits = digits.replace(/^0{2,}/, "0");
        const dial = String(defaultDial || "").replace(/\D/g, "");
        if (!prefix) {
            const lengths = NATIONAL_LENGTHS[dial] || [7, 12];
            const isNational = lengths.indexOf(digits.length) !== -1;
            const alreadyHasDial = dial && digits.length > lengths[1] && digits.indexOf(dial) === 0;
            if (isNational) return "+" + dial + digits.replace(/^0/, "");
            if (alreadyHasDial) return "+" + digits;
            if (digits.length > 12) return "+" + digits;
        }
        return prefix + digits;
    }

    function phoneDigits(phone) {
        return String(phone || "").replace(/\D/g, "");
    }

    function looksLikeBrazilPhone(phone) {
        const digits = phoneDigits(phone);
        return digits.length >= 10 && digits.length <= 13;
    }

    function normalizeBusinessName(input) {
        let value = stripAccents(collapseSpaces(input)).toLowerCase();
        if (!value) return "";
        value = value.replace(/&/g, " e ");
        value = value.replace(LEGAL_NOISE, " ");
        value = value.replace(/[^a-z0-9\s]/g, " ");
        return collapseSpaces(value);
    }

    function nameTokens(input) {
        const normalized = normalizeBusinessName(input);
        return normalized
            .split(" ")
            .filter(function (token) {
                return token.length > 2 && SOCIAL_SUFFIXES.indexOf(token) === -1;
            });
    }

    function normalizeAddress(input) {
        let value = stripAccents(collapseSpaces(input)).toLowerCase();
        value = value.replace(/\b(rua|avenida|av|alameda|travessa|estrada|rodovia|r\.)\.?\s+/g, "$1 ");
        value = value.replace(/[^a-z0-9\s,.-]/g, " ");
        value = collapseSpaces(value).replace(/\s*,\s*/g, ", ");
        return value;
    }

    function addressTokens(input) {
        return normalizeAddress(input)
            .split(/[\s,.-]+/)
            .filter(function (token) {
                return token.length > 2 && ["rua", "avenida", "av", "alameda", "travessa", "estrada", "rodovia"].indexOf(token) === -1;
            });
    }

    function normalizeCategory(input) {
        return stripAccents(collapseSpaces(input))
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .trim();
    }

    function categoryKey(input) {
        return normalizeCategory(input).replace(/\s+/g, "-");
    }

    function getCategoryTerms(category) {
        const key = categoryKey(category);
        if (CATEGORY_TERMS[key]) return CATEGORY_TERMS[key].slice();
        const base = stripAccents(category).toLowerCase();
        const found = [];
        Object.keys(CATEGORY_TERMS).forEach(function (key2) {
            CATEGORY_TERMS[key2].forEach(function (term) {
                if (stripAccents(term).toLowerCase() === base) found.push(term);
            });
        });
        return found.length ? found : [collapseSpaces(category)];
    }

    /* ---------- similaridade (§51) ---------- */

    function jaccard(aTokens, bTokens) {
        if (!aTokens.length || !bTokens.length) return 0;
        const setB = new Set(bTokens);
        let intersection = 0;
        aTokens.forEach(function (token) {
            if (setB.has(token)) intersection += 1;
        });
        const union = new Set(aTokens.concat(bTokens)).size;
        return union ? intersection / union : 0;
    }

    function levenshtein(a, b) {
        const s = String(a || "");
        const t = String(b || "");
        if (s === t) return 0;
        if (!s.length) return t.length;
        if (!t.length) return s.length;
        let previous = new Array(t.length + 1);
        for (let j = 0; j <= t.length; j += 1) previous[j] = j;
        for (let i = 1; i <= s.length; i += 1) {
            const current = [i];
            for (let j = 1; j <= t.length; j += 1) {
                const cost = s[i - 1] === t[j - 1] ? 0 : 1;
                current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
            }
            previous = current;
        }
        return previous[t.length];
    }

    function ratio(a, b) {
        const s = String(a || "");
        const t = String(b || "");
        if (!s || !t) return 0;
        if (s === t) return 1;
        const distance = levenshtein(s, t);
        return 1 - distance / Math.max(s.length, t.length);
    }

    /* Retorna 0..1 indicando quanto o rótulo de um domínio corresponde ao nome
       da empresa. Cobre "oficinasilva.com.br" para "Oficina Silva", tanto por
       token único quanto por concatenação dos tokens. */
    function nameDomainMatch(businessName, url) {
        const label = getDomainLabel(url);
        if (!label) return 0;
        const tokens = nameTokens(businessName);
        if (!tokens.length) return 0;
        const labelNormalized = stripAccents(label).toLowerCase();
        const joined = tokens.join("");

        if (labelNormalized === joined) return 1;
        if (joined.length >= 5 && (labelNormalized.endsWith(joined) || labelNormalized.startsWith(joined))) return 0.9;
        if (labelNormalized.length >= 5 && joined.indexOf(labelNormalized) !== -1) return 0.85;
        if (joined.indexOf(labelNormalized) !== -1 && labelNormalized.length >= 5) return 0.85;

        const labelTokens = labelNormalized.split(/[^a-z0-9]+/).filter(Boolean);
        let best = 0;
        labelTokens.forEach(function (labelToken) {
            tokens.forEach(function (token) {
                if (labelToken === token) {
                    best = Math.max(best, 1);
                } else if (labelToken.length > 3 && token.length > 3 && (labelToken.indexOf(token) === 0 || token.indexOf(labelToken) === 0)) {
                    const shorter = labelToken.length < token.length ? labelToken : token;
                    const longer = labelToken.length < token.length ? token : labelToken;
                    if (shorter.length / longer.length >= 0.6) best = Math.max(best, 0.8);
                } else {
                    const sim = ratio(labelToken, token);
                    if (sim > 0.75) best = Math.max(best, sim * 0.7);
                }
            });
        });
        return best;
    }

    /* ---------- diversos ---------- */

    function debounce(fn, wait) {
        let timer = null;
        return function debounced() {
            const args = Array.prototype.slice.call(arguments);
            const context = this;
            clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                fn.apply(context, args);
            }, wait || 300);
        };
    }

    function throttle(fn, wait) {
        let last = 0;
        let timer = null;
        return function throttled() {
            const args = Array.prototype.slice.call(arguments);
            const context = this;
            const now = Date.now();
            const remaining = wait - (now - last);
            if (remaining <= 0) {
                last = now;
                fn.apply(context, args);
            } else if (!timer) {
                timer = setTimeout(function () {
                    timer = null;
                    last = Date.now();
                    fn.apply(context, args);
                }, remaining);
            }
        };
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function safeUrlForHref(url) {
        const normalized = normalizeUrl(url);
        return normalized || "";
    }

    function uid(prefix) {
        const random = Math.random().toString(36).slice(2, 9);
        return (prefix || "id") + "-" + Date.now().toString(36) + "-" + random;
    }

    function hashString(value) {
        let hash = 5381;
        const text = String(value || "");
        for (let i = 0; i < text.length; i += 1) {
            hash = (hash * 33) ^ text.charCodeAt(i);
        }
        return (hash >>> 0).toString(36);
    }

    function formatNumber(value, decimals) {
        const number = Number(value);
        if (!isFinite(number)) return "—";
        return number.toLocaleString(CONFIG.locale, {
            minimumFractionDigits: decimals || 0,
            maximumFractionDigits: decimals == null ? 0 : decimals
        });
    }

    function formatRating(value) {
        const number = Number(value);
        if (!isFinite(number) || number <= 0) return "—";
        return number.toFixed(1).replace(".", ",");
    }

    function formatDate(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleDateString(CONFIG.locale);
    }

    function formatDateTime(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleString(CONFIG.locale, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function relativeTime(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return "—";
        const diff = Date.now() - date.getTime();
        const minutes = Math.round(diff / 60000);
        if (minutes < 1) return "agora";
        if (minutes < 60) return "há " + minutes + " min";
        const hours = Math.round(minutes / 60);
        if (hours < 24) return "há " + hours + " h";
        const days = Math.round(hours / 24);
        if (days < 30) return "há " + days + " d";
        return formatDate(date);
    }

    function formatPhone(phone) {
        const digits = phoneDigits(phone);
        if (!digits) return "";
        if (digits.length === 11 && digits.charAt(0) === "0") {
            return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
        }
        return collapseSpaces(phone);
    }

    /* Distância em km entre duas coordenadas (Haversine). */
    function distanceKm(lat1, lon1, lat2, lon2) {
        const a1 = Number(lat1), o1 = Number(lon1), a2 = Number(lat2), o2 = Number(lon2);
        if (![a1, o1, a2, o2].every(function (n) { return isFinite(n) && n !== 0 || n === 0; })) return null;
        const toRad = function (deg) { return (deg * Math.PI) / 180; };
        const R = 6371;
        const dLat = toRad(a2 - a1);
        const dLon = toRad(o2 - o1);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function chunk(array, size) {
        const step = size || 10;
        const result = [];
        for (let i = 0; i < array.length; i += step) {
            result.push(array.slice(i, i + step));
        }
        return result;
    }

    async function mapWithConcurrency(items, limit, worker) {
        const list = Array.prototype.slice.call(items);
        const results = new Array(list.length);
        const max = Math.max(1, limit || 1);
        let cursor = 0;
        async function runner() {
            while (cursor < list.length) {
                const index = cursor;
                cursor += 1;
                results[index] = await worker(list[index], index);
            }
        }
        const runners = [];
        for (let i = 0; i < Math.min(max, list.length); i += 1) runners.push(runner());
        await Promise.all(runners);
        return results;
    }

    function safeJsonParse(value, fallback) {
        try {
            const parsed = JSON.parse(value);
            return parsed == null ? (fallback === undefined ? null : fallback) : parsed;
        } catch (error) {
            return fallback === undefined ? null : fallback;
        }
    }

    function getCountryDialCode(countryName) {
        const target = normalizeBusinessName(countryName);
        const list = Array.isArray(COUNTRIES) ? COUNTRIES : [];
        for (let i = 0; i < list.length; i += 1) {
            const country = list[i];
            const candidates = [country.name].concat(country.aliases || []);
            for (let j = 0; j < candidates.length; j += 1) {
                if (normalizeBusinessName(candidates[j]) === target) return country.dial;
            }
        }
        return "";
    }

    function getCountryInfo(countryName) {
        const list = Array.isArray(COUNTRIES) ? COUNTRIES : [];
        const target = normalizeBusinessName(countryName);
        for (let i = 0; i < list.length; i += 1) {
            const country = list[i];
            const candidates = [country.name].concat(country.aliases || []);
            for (let j = 0; j < candidates.length; j += 1) {
                if (normalizeBusinessName(candidates[j]) === target) return country;
            }
        }
        return null;
    }

    function getCountryNames() {
        const list = Array.isArray(COUNTRIES) ? COUNTRIES : [];
        return list.map(function (country) { return country.name; });
    }

    function getStatesForCountry(countryName) {
        const info = getCountryInfo(countryName);
        return info ? info.states || [] : [];
    }

    function getCitiesForCountry(countryName) {
        const info = getCountryInfo(countryName);
        return info ? info.cities || [] : [];
    }

    function getCategoryGroups() {
        return Array.isArray(CATEGORIES) ? CATEGORIES : [];
    }

    function getAllCategoryItems() {
        const items = [];
        getCategoryGroups().forEach(function (group) {
            (group.items || []).forEach(function (item) {
                if (items.indexOf(item) === -1) items.push(item);
            });
        });
        return items;
    }

    /* ---------- WhatsApp (§31) ---------- */

    function gerarUrlWhatsApp(phone, message, dialCode) {
        const digits = phoneDigits(phone);
        if (!digits) return "";
        const dial = String(dialCode || getCountryDialCode(CONFIG.defaultCountry) || "").replace(/\D/g, "");
        let number = digits;
        if (dial && digits.indexOf(dial) !== 0 && digits.length <= 13) {
            number = dial + digits;
        }
        const text = encodeURIComponent(collapseSpaces(message || CONFIG.whatsappMessage));
        return "https://wa.me/" + number + "?text=" + text;
    }

    /* ---------- CSV / download (§29, §56) ---------- */

    function toCSV(rows, columns) {
        const cols = columns && columns.length ? columns : CSV_COLUMNS;
        const header = cols.map(function (col) { return '"' + String(col.header).replace(/"/g, '""') + '"'; }).join(",");
        const lines = rows.map(function (row) {
            return cols
                .map(function (col) {
                    const raw = typeof col.value === "function" ? col.value(row) : row[col.key];
                    const text = raw == null ? "" : String(raw);
                    return '"' + text.replace(/"/g, '""') + '"';
                })
                .join(",");
        });
        return "\uFEFF" + [header].concat(lines).join("\r\n");
    }

    function downloadFile(filename, content, mimeType) {
        try {
            const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.rel = "noopener";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            return true;
        } catch (error) {
            return false;
        }
    }

    function downloadCSV(filename, rows, columns) {
        const csv = toCSV(rows, columns);
        return downloadFile(filename.endsWith(".csv") ? filename : filename + ".csv", csv, "text/csv;charset=utf-8");
    }

    /* ---------- clipboard (§30) ---------- */

    async function copyToClipboard(text) {
        const value = String(text == null ? "" : text);
        if (!value) return false;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch (error) {
            /* fallback abaixo */
        }
        try {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.setAttribute("readonly", "readonly");
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(textarea);
            return ok;
        } catch (error) {
            return false;
        }
    }

    function delay(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    return {
        stripAccents: stripAccents,
        slugify: slugify,
        collapseSpaces: collapseSpaces,
        normalizeUrl: normalizeUrl,
        isValidUrl: isValidUrl,
        getHostname: getHostname,
        normalizeDomain: normalizeDomain,
        getDomainLabel: getDomainLabel,
        isSubDomainOf: isSubDomainOf,
        normalizePhone: normalizePhone,
        phoneDigits: phoneDigits,
        looksLikeBrazilPhone: looksLikeBrazilPhone,
        formatPhone: formatPhone,
        normalizeBusinessName: normalizeBusinessName,
        normalizeAddress: normalizeAddress,
        normalizeCategory: normalizeCategory,
        categoryKey: categoryKey,
        getCategoryTerms: getCategoryTerms,
        nameTokens: nameTokens,
        addressTokens: addressTokens,
        jaccard: jaccard,
        ratio: ratio,
        nameDomainMatch: nameDomainMatch,
        debounce: debounce,
        throttle: throttle,
        escapeHtml: escapeHtml,
        safeUrlForHref: safeUrlForHref,
        uid: uid,
        hashString: hashString,
        formatNumber: formatNumber,
        formatRating: formatRating,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        relativeTime: relativeTime,
        chunk: chunk,
        distanceKm: distanceKm,
        mapWithConcurrency: mapWithConcurrency,
        safeJsonParse: safeJsonParse,
        getCountryDialCode: getCountryDialCode,
        getCountryInfo: getCountryInfo,
        getCountryNames: getCountryNames,
        getStatesForCountry: getStatesForCountry,
        getCitiesForCountry: getCitiesForCountry,
        getCategoryGroups: getCategoryGroups,
        getAllCategoryItems: getAllCategoryItems,
        gerarUrlWhatsApp: gerarUrlWhatsApp,
        toCSV: toCSV,
        downloadFile: downloadFile,
        downloadCSV: downloadCSV,
        copyToClipboard: copyToClipboard,
        delay: delay
    };
})();

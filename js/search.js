/* Prospecção Web — Orquestração da busca: monta os parâmetros, chama o
   provedor, normaliza, remove duplicados, analisa e classifica. */

const Search = (function () {
    "use strict";

    const state = {
        params: null,
        results: [],
        filtered: [],
        summary: null,
        page: 1,
        perPage: CONFIG.resultsPerPage,
        tab: "all",
        filters: {
            query: "",
            category: "",
            city: "",
            radiusKm: null,
            hasWebsite: null,
            hasInstagram: null,
            hasFacebook: null,
            minRating: null,
            minReviews: null,
            status: null
        },
        loading: false,
        lastError: null,
        progress: ""
    };

    const TABS = [
        { id: "all", label: "Todas", match: function () { return true; } },
        { id: "no_site", label: "Sem site", match: function (item) { return item.status === STATUS.NO_WEBSITE || item.status === STATUS.NO_WEBSITE_SOCIAL || item.status === STATUS.REDIRECT_SOCIAL; } },
        { id: "has_site", label: "Com site", match: function (item) { return item.status === STATUS.HAS_WEBSITE; } },
        { id: "social", label: "Redes sociais", match: function (item) { return item.status === STATUS.NO_WEBSITE_SOCIAL || item.status === STATUS.REDIRECT_SOCIAL; } },
        { id: "verify", label: "Verificação", match: function (item) { return item.status === STATUS.VERIFY; } },
        { id: "directory", label: "Diretórios", match: function (item) { return item.status === STATUS.DIRECTORY_ONLY; } },
        { id: "saved", label: "Salvas", match: function (item) { return Store.isProspectSaved(item); } }
    ];

    /* ---------- parâmetros ---------- */

    function readForm(form) {
        const data = new FormData(form);
        function value(name) {
            const raw = data.get(name);
            return Utils.collapseSpaces(raw == null ? "" : raw);
        }

        const country = value("country") || CONFIG.defaultCountry;
        let state = value("state");
        let city = value("city");
        let neighborhood = value("neighborhood");

        /* "Onde?" aceita "Cidade, Estado, País". O país, quando reconhecido,
           tem prioridade sobre o valor do campo País. */
        const center = readCenter(form);
        const quick = value("quickLocation");
        if (quick) {
            const parts = quick.split(",").map(function (part) { return Utils.collapseSpaces(part); }).filter(function (part) { return part; });
            const last = parts.length ? parts[parts.length - 1] : "";
            const lastCountry = Utils.getCountryInfo(last);
            if (parts.length > 1 && lastCountry) {
                data.set("country", lastCountry.name);
                const middle = parts.slice(0, -1);
                if (!city && middle.length) city = middle[0];
                if (!state && middle.length > 1) state = middle[middle.length - 1];
            } else {
                if (!city && parts.length) city = parts[0];
                if (!state && parts.length > 1) state = parts[1];
            }
        }

        /* A busca rápida ("O que você está procurando?") alimenta `query`.
           Quando o texto corresponde a uma categoria conhecida, ele vira a
           categoria da busca; caso contrário, é tratado como termo livre. */
        let category = value("category") || "";
        const query = value("query") || "";
        if (!category && query) {
            const known = Utils.getAllCategoryItems().find(function (item) {
                return Utils.normalizeBusinessName(item) === Utils.normalizeBusinessName(query);
            });
            if (known) category = known;
        }

        return {
            provider: CONFIG.provider,
            country: Utils.collapseSpaces(data.get("country")) || country,
            state: state,
            city: city,
            neighborhood: neighborhood,
            postalCode: value("postalCode"),
            category: category,
            subcategory: value("subcategory"),
            query: category ? "" : query,
            radiusKm: value("radiusKm") ? Number(value("radiusKm")) : null,
            center: center,
            limit: CONFIG.resultsPerPage * 3
        };
    }

    /* Centro de referência para o cálculo de raio. O mock conhece apenas as
       cidades listadas; com um provedor real, use a coordenada do centro
       devolvido por ele. */
    function readCenter(form) {
        const data = new FormData(form);
        const lat = Utils.collapseSpaces(data.get("centerLat"));
        const lon = Utils.collapseSpaces(data.get("centerLng"));
        if (lat && lon) {
            return { latitude: Number(lat), longitude: Number(lon) };
        }
        const city = Utils.collapseSpaces(data.get("city"));
        const known = API.getCityCenter ? API.getCityCenter(city) : null;
        return known ? { latitude: known[0], longitude: known[1] } : null;
    }

    function validate(params) {
        const errors = [];
        if (!params.category && !params.query) {
            errors.push("Informe uma categoria ou um termo de busca.");
        }
        if (!params.city && !params.postalCode && !params.state) {
            errors.push("Informe ao menos cidade, estado ou CEP para delimitar a área.");
        }
        return errors;
    }

    function cacheKey(params) {
        return "search:" + JSON.stringify({
            country: params.country,
            state: params.state,
            city: params.city,
            neighborhood: params.neighborhood,
            postalCode: params.postalCode,
            category: params.category,
            subcategory: params.subcategory,
            query: params.query,
            radiusKm: params.radiusKm,
            center: params.center || null,
            provider: params.provider
        });
    }

    /* ---------- normalização dos registros do provedor ---------- */

    function normalizeBusiness(raw, providerId) {
        const dial = Utils.getCountryDialCode(raw.country || CONFIG.defaultCountry);
        const name = Utils.collapseSpaces(raw.name || raw.title || raw.displayName || "");
        const business = {
            id: Utils.collapseSpaces(raw.id || raw.place_id || raw.placeId || raw.osm_id || raw.reference || Utils.uid("b")),
            providerId: providerId || raw.provider || CONFIG.provider,
            name: name,
            category: Utils.collapseSpaces(raw.category || raw.types && raw.types[0] || ""),
            subcategory: Utils.collapseSpaces(raw.subcategory || ""),
            country: Utils.collapseSpaces(raw.country || CONFIG.defaultCountry),
            state: Utils.collapseSpaces(raw.state || raw.region || ""),
            city: Utils.collapseSpaces(raw.city || raw.locality || ""),
            neighborhood: Utils.collapseSpaces(raw.neighborhood || raw.district || raw.suburb || ""),
            address: Utils.collapseSpaces(raw.address || raw.formatted_address || raw.vicinity || ""),
            postalCode: Utils.collapseSpaces(raw.postalCode || raw.postal_code || raw.zip || ""),
            phone: Utils.normalizePhone(raw.phone || raw.telephone || raw.international_phone_number || "", dial),
            website: Utils.normalizeUrl(raw.website || raw.url || raw.website_uri || raw.site || ""),
            rawLinks: Array.isArray(raw.links) ? raw.links : [],
            rating: raw.rating != null ? Number(raw.rating) : "",
            reviews: raw.reviews != null ? Number(raw.reviews) : (raw.user_ratings_total != null ? Number(raw.user_ratings_total) : ""),
            mapsUrl: Utils.normalizeUrl(raw.mapsUrl || raw.maps_url || "") || buildMapsUrl(raw, name),
            openingHours: Utils.collapseSpaces(raw.openingHours || raw.opening_hours || ""),
            latitude: raw.latitude != null ? Number(raw.latitude) : (raw.lat ? Number(raw.lat) : ""),
            longitude: raw.longitude != null ? Number(raw.longitude) : (raw.lon ? Number(raw.lon) : ""),
            searchedAt: new Date().toISOString()
        };

        ["instagram", "facebook", "tiktok", "youtube", "linkedin", "twitter", "whatsapp"].forEach(function (key) {
            const value = raw[key] || (raw.social && raw.social[key]);
            if (value) business[key] = Utils.collapseSpaces(value);
        });

        if (raw.mockSimulation) business.mockSimulation = raw.mockSimulation;
        if (raw.mockScenario) business.mockScenario = raw.mockScenario;
        if (raw.opening_hours) business.openingHours = raw.opening_hours;
        if (Array.isArray(raw.website_uris)) {
            business.websiteUris = raw.website_uris;
        }

        /* Provedores às vezes devolvem a rede social no campo de site.
           Ela é movida para o campo da plataforma e removida de `website`,
           para nunca ser tratada como site próprio. */
        if (business.website && Classifier.isSocialDomain(business.website)) {
            const platform = Classifier.getSocialPlatform(business.website);
            if (platform && !business[platform]) business[platform] = business.website;
            business.websiteSocial = business.website;
            business.website = "";
        }

        business.displayName = name || "Empresa sem nome";
        business.locationLabel = [business.neighborhood, business.city, business.state]
            .filter(function (part) { return part; })
            .join(" · ") || business.country;

        return business;
    }

    function buildMapsUrl(raw, name) {
        const query = [name, raw.address, raw.city, raw.state, raw.country].filter(function (part) { return part; }).join(" ");
        if (!query) return "";
        return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
    }

    /* ---------- duplicados (§48) ---------- */

    function dedupeKey(business) {
        return [
            Utils.normalizeBusinessName(business.name),
            Utils.phoneDigits(business.phone).slice(-8),
            Utils.normalizeAddress(business.address).replace(/\d+/g, "#").slice(0, 60)
        ].join("|");
    }

    function dedupeBusinesses(list) {
        const seen = {};
        const unique = [];
        let removed = 0;
        list.forEach(function (business) {
            const keys = [business.id ? "id:" + business.providerId + ":" + business.id : "", "data:" + dedupeKey(business)];
            let duplicate = false;
            for (let i = 0; i < keys.length; i += 1) {
                const key = keys[i];
                if (!key) continue;
                if (seen[key]) {
                    duplicate = true;
                    break;
                }
            }
            if (duplicate) {
                removed += 1;
                return;
            }
            keys.forEach(function (key) { if (key) seen[key] = true; });
            unique.push(business);
        });
        return { items: unique, removed: removed };
    }

    /* ---------- execução ---------- */

    async function runSearch(form, hooks) {
        const options = hooks || {};
        const params = options.params || readForm(form);
        const errors = validate(params);
        if (errors.length) {
            const error = new Error(errors[0]);
            error.code = "invalid_params";
            setError(error);
            throw error;
        }

        state.loading = true;
        state.lastError = null;
        state.params = params;
        state.progress = "Pesquisando empresas...";
        state.page = 1;
        if (options.onLoading) options.onLoading(true, state.progress);

        try {
            const key = cacheKey(params);
            let payload = Store.getCached(key);
            let fromCache = false;

            if (!payload) {
                const result = await API.searchBusinesses(params);
                state.progress = "Analisando presença digital...";
                if (options.onLoading) options.onLoading(true, state.progress);
                const normalized = (result.items || []).slice(0, CONFIG.maxResultsPerSearch).map(function (raw) {
                    return normalizeBusiness(raw, result.provider);
                });
                payload = { items: normalized, total: result.total || normalized.length, provider: result.provider };
                Store.setCached(key, payload);
            } else {
                fromCache = true;
            }

            const deduped = dedupeBusinesses(payload.items);
            state.results = deduped.items;

            const analyzed = await Classifier.analyzeAndClassify(state.results, function () {
                if (options.onProgress) {
                    state.progress = "Analisando presença digital...";
                    options.onProgress(state.results.length, state.results.length);
                }
            });

            state.summary = Classifier.summarize(analyzed);
            state.summary.duplicatesRemoved = deduped.removed;
            state.summary.provider = payload.provider;
            state.summary.fromCache = fromCache;

            Store.addHistory({ params: params, total: state.summary.total, summary: state.summary });
            Store.recordSearch(state.summary);

            applyFilters();
            return { results: state.results, summary: state.summary, params: params, fromCache: fromCache };
        } catch (error) {
            setError(error);
            state.results = [];
            state.filtered = [];
            state.summary = null;
            throw error;
        } finally {
            state.loading = false;
            state.progress = "";
            if (options.onLoading) options.onLoading(false, "");
        }
    }

    function setError(error) {
        state.lastError = normalizeError(error);
    }

    function normalizeError(error) {
        if (error instanceof API.QuotaError) {
            return { kind: "quota", message: error.message || CONFIG.messages.quotaError, detail: "O provedor atingiu o limite de requisições. Aguarde o reinício do período ou ajuste o plano." };
        }
        if (error instanceof API.NotConfiguredError) {
            return { kind: "config", message: error.message, detail: "Ajuste CONFIG.provider e CONFIG.proxyUrl em js/config.js." };
        }
        if (error instanceof API.TimeoutError) {
            return { kind: "timeout", message: "O provedor demorou demais para responder.", detail: "Tente novamente ou reduza o raio de busca." };
        }
        if (error instanceof API.NetworkError) {
            return { kind: "network", message: CONFIG.messages.apiError, detail: "Verifique sua conexão com a internet e o status do proxy." };
        }
        if (error && error.code === "invalid_params") {
            return { kind: "validation", message: error.message, detail: "Complete os campos destacados e tente novamente." };
        }
        if (error instanceof API.ProviderError) {
            return { kind: "provider", message: error.message || CONFIG.messages.apiError, detail: "" };
        }
        return { kind: "unknown", message: (error && error.message) || CONFIG.messages.apiError, detail: "" };
    }

    /* ---------- filtros (§12) ---------- */

    function setTab(tabId) {
        state.tab = tabId;
        state.page = 1;
        applyFilters();
    }

    function setFilters(partial) {
        state.filters = Object.assign({}, state.filters, partial || {});
        state.page = 1;
        applyFilters();
    }

    function resetFilters() {
        state.filters = {
            query: "",
            category: "",
            city: "",
            radiusKm: null,
            hasWebsite: null,
            hasInstagram: null,
            hasFacebook: null,
            minRating: null,
            minReviews: null,
            status: null
        };
        state.page = 1;
        applyFilters();
    }

    function matchesTab(item, tabId) {
        const tab = TABS.find(function (candidate) { return candidate.id === tabId; });
        return tab ? tab.match(item) : true;
    }

    /* O raio só pode ser aplicado quando a busca tem um centro com
       coordenadas e o resultado traz coordenadas. Sem esses dados, o filtro é
       ignorado em vez de esconder empresas sem motivo. */
    function radiusAllows(item, radiusKm) {
        if (!radiusKm) return true;
        const center = state.params && state.params.center;
        if (!center) return true;
        const distance = Utils.distanceKm(center.latitude, center.longitude, item.latitude, item.longitude);
        if (distance == null) return true;
        item.distanceKm = Math.round(distance * 10) / 10;
        return distance <= Number(radiusKm);
    }

    function applyFilters() {
        const filters = state.filters;
        const query = Utils.stripAccents(filters.query || "").toLowerCase().trim();
        let list = state.results.filter(function (item) {
            if (!matchesTab(item, state.tab)) return false;
            if (!radiusAllows(item, filters.radiusKm)) return false;
            if (filters.status && item.status !== filters.status) return false;
            if (filters.category && Utils.categoryKey(item.category) !== Utils.categoryKey(filters.category)) return false;
            if (filters.city && Utils.normalizeBusinessName(item.city).indexOf(Utils.normalizeBusinessName(filters.city)) === -1) return false;
            if (filters.hasWebsite === true && item.status !== STATUS.HAS_WEBSITE) return false;
            if (filters.hasWebsite === false && item.status === STATUS.HAS_WEBSITE) return false;
            if (filters.hasInstagram && !(item.socials && item.socials.instagram)) return false;
            if (filters.hasFacebook && !(item.socials && item.socials.facebook)) return false;
            if (filters.minRating != null && filters.minRating !== "" && Number(item.rating || 0) < Number(filters.minRating)) return false;
            if (filters.minReviews != null && filters.minReviews !== "" && Number(item.reviews || 0) < Number(filters.minReviews)) return false;
            if (query) {
                const haystack = Utils.stripAccents([item.name, item.category, item.address, item.city, item.website].join(" ")).toLowerCase();
                if (haystack.indexOf(query) === -1) return false;
            }
            return true;
        });

        const sort = state.sort || "relevance";
        list = sortResults(list, sort);
        state.filtered = list;
        const maxPage = Math.max(1, Math.ceil(list.length / state.perPage));
        if (state.page > maxPage) state.page = maxPage;
        return list;
    }

    function sortResults(list, sort) {
        const copy = list.slice();
        switch (sort) {
            case "name":
                return copy.sort(function (a, b) { return a.name.localeCompare(b.name, CONFIG.locale); });
            case "rating":
                return copy.sort(function (a, b) { return (Number(b.rating) || 0) - (Number(a.rating) || 0); });
            case "reviews":
                return copy.sort(function (a, b) { return (Number(b.reviews) || 0) - (Number(a.reviews) || 0); });
            case "score":
                return copy.sort(function (a, b) {
                    return ((b.opportunity && b.opportunity.score) || 0) - ((a.opportunity && a.opportunity.score) || 0);
                });
            default:
                return copy;
        }
    }

    function setSort(sort) {
        state.sort = sort || "relevance";
        applyFilters();
    }

    function getPage() {
        const start = (state.page - 1) * state.perPage;
        return {
            items: state.filtered.slice(start, start + state.perPage),
            page: state.page,
            totalPages: Math.max(1, Math.ceil(state.filtered.length / state.perPage)),
            total: state.filtered.length,
            start: start
        };
    }

    function goToPage(page) {
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
        state.page = Math.min(Math.max(1, page), totalPages);
        return state.page;
    }

    function getState() {
        return state;
    }

    function hasSearched() {
        return !!(state.params && (state.results.length || state.lastError));
    }

    function clearResults() {
        state.results = [];
        state.filtered = [];
        state.summary = null;
        state.params = null;
        state.page = 1;
        state.lastError = null;
    }

    function findById(id) {
        return state.results.find(function (item) { return item.id === id; }) || null;
    }

    function repeatSearch(historyRecord) {
        if (!historyRecord || !historyRecord.params) return null;
        return historyRecord.params;
    }

    return {
        TABS: TABS,
        readForm: readForm,
        validate: validate,
        runSearch: runSearch,
        normalizeBusiness: normalizeBusiness,
        dedupeBusinesses: dedupeBusinesses,
        applyFilters: applyFilters,
        setFilters: setFilters,
        resetFilters: resetFilters,
        setTab: setTab,
        setSort: setSort,
        getPage: getPage,
        goToPage: goToPage,
        getState: getState,
        hasSearched: hasSearched,
        clearResults: clearResults,
        findById: findById,
        repeatSearch: repeatSearch,
        cacheKey: cacheKey
    };
})();

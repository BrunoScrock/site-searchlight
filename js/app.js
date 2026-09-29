/* Prospecção Web — Bootstrap, navegação e eventos. */

const APP = (function () {
    "use strict";

    const VIEWS = ["search", "results", "prospects", "dashboard", "exports", "settings"];

    function init() {
        UI.cacheElements();
        UI.renderCategoryPicker();
        buildRadiusOptions();
        buildCategoryDatalist();
        restorePrefs();
        UI.updateLocationSuggestions(readCountry());
        UI.renderSettings();
        UI.renderProspects();
        UI.renderDashboard();
        bindEvents();
        updateProviderBadge();
        updateConnectivity();
        handleRoute();
        Store.getPrefs();
    }

    /* ---------- preferências ---------- */

    function restorePrefs() {
        const prefs = Store.getPrefs();
        if (prefs.view) location.hash = "#/" + prefs.view;
        if (prefs.lastSearch) {
            try {
                applySearchToForm(prefs.lastSearch);
            } catch (error) {
                /* formulário pode ainda não existir */
            }
        }
        if (prefs.filters) Search.setFilters(prefs.filters);
        UI.syncFilterInputs(Search.getState().filters);
    }

    function applySearchToForm(params) {
        const form = UI.els.searchForm;
        if (!form) return;
        ["country", "state", "city", "neighborhood", "postalCode", "category", "subcategory", "query", "radiusKm", "centerLat", "centerLng"].forEach(function (name) {
            const field = form.elements[name];
            if (field && params[name] != null) field.value = params[name];
        });
        if (params.category) UI.selectCategory(params.category);
    }

    function readFormToParams() {
        const form = UI.els.searchForm;
        if (!form) return null;
        const params = Search.readForm(form);
        Store.setPref("lastSearch", params);
        return params;
    }

    function readCountry() {
        const field = UI.els.searchForm && UI.els.searchForm.elements.country;
        return field && field.value ? field.value : CONFIG.defaultCountry;
    }

    function buildRadiusOptions() {
        const select = document.getElementById("radiusKm");
        if (!select || select.dataset.filled === "true") return;
        const fragment = document.createDocumentFragment();
        CONFIG.radiusOptions.forEach(function (km) {
            const option = document.createElement("option");
            option.value = km;
            option.textContent = km + " km";
            if (km === CONFIG.defaultRadiusKm) option.selected = true;
            fragment.appendChild(option);
        });
        select.appendChild(fragment);
        select.dataset.filled = "true";
    }

    function buildCategoryDatalist() {
        UI.fillDatalist(UI.els.datalistCategories, Utils.getAllCategoryItems());
    }

    /* ---------- busca ---------- */

    async function handleSearch(event) {
        if (event) event.preventDefault();
        const form = UI.els.searchForm;
        if (!form) return;
        const params = readFormToParams();
        const validationErrors = Search.validate(params);
        showValidation(validationErrors);
        if (validationErrors.length) {
            UI.toast(validationErrors[0], "error");
            const firstInvalid = form.querySelector("[aria-invalid='true']");
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        navigate("results");
        UI.setLoadingProgress("Pesquisando empresas...");
        UI.els.resultsContainer.setAttribute("aria-busy", "true");

        try {
            const result = await Search.runSearch(null, {
                params: params,
                onLoading: function (loading, progress) {
                    if (loading) UI.setLoadingProgress(progress);
                }
            });
            UI.renderResults();
            UI.syncFilterInputs(Search.getState().filters);
            UI.announce(result.results.length + " empresas encontradas. " + result.summary.withoutWebsite + " sem site próprio, " + result.summary.needsVerification + " precisam de verificação.");
            if (result.summary.duplicatesRemoved) {
                UI.toast(result.summary.duplicatesRemoved + " duplicado(s) removido(s) automaticamente.", "info");
            }
        } catch (error) {
            const info = Search.getState().lastError;
            UI.renderError(info || { message: CONFIG.messages.apiError, detail: "" });
        }
    }

    function showValidation(errors) {
        const form = UI.els.searchForm;
        if (!form) return;
        form.querySelectorAll("[aria-invalid]").forEach(function (field) { field.setAttribute("aria-invalid", "false"); });
        if (!errors.length) return;
        const categoryField = form.elements.category;
        const queryField = form.elements.query;
        const cityField = form.elements.city;
        const stateField = form.elements.state;
        const postalField = form.elements.postalCode;
        if (categoryField && queryField) {
            categoryField.setAttribute("aria-invalid", "true");
            queryField.setAttribute("aria-invalid", "true");
        }
        [cityField, stateField, postalField].forEach(function (field) {
            if (field) field.setAttribute("aria-invalid", "true");
        });
    }

    async function loadMore() {
        const state = Search.getState();
        if (!state.params) return;
        UI.renderLoading("Buscando mais empresas...");
        try {
            await Search.runSearch(null, { params: state.params, onLoading: function (loading, progress) { UI.setLoadingProgress(progress); } });
            UI.renderResults();
        } catch (error) {
            UI.renderError(Search.getState().lastError);
        }
    }

    /* ---------- configurações ---------- */

    function saveSettings(event) {
        if (event) event.preventDefault();
        const form = UI.els.settingsForm;
        if (!form) return;
        const data = new FormData(form);
        const domainsForm = document.getElementById("domainsForm");
        if (domainsForm) {
            const domainsData = new FormData(domainsForm);
            ["socialDomains", "directoryDomains"].forEach(function (name) {
                if (domainsData.has(name)) data.set(name, domainsData.get(name));
            });
        }
        const value = function (name) {
            const raw = data.get(name);
            return raw == null ? "" : String(raw);
        };
        const isChecked = function (name) { return data.get(name) === "on"; };

        const provider = API.getProvider(value("provider") || "mock");
        if (provider.requiresProxy && !value("proxyUrl").trim()) {
            UI.toast("O provedor " + provider.id + " exige um proxy serverless. Informe a URL do proxy ou volte ao modo mock.", "error");
            return;
        }

        CONFIG.provider = provider.id;
        CONFIG.proxyUrl = value("proxyUrl").trim();
        CONFIG.proxyToken = value("proxyToken").trim();
        CONFIG.analyzeWebsites = isChecked("analyze");
        CONFIG.cacheEnabled = isChecked("cache");
        CONFIG.enableMockData = isChecked("mock");
        CONFIG.requestTimeoutMs = Math.max(2, Number(value("timeout")) || 8) * 1000;
        CONFIG.cacheTtlMs = Math.max(1, Number(value("cacheTtl")) || 30) * 60000;
        CONFIG.maxResultsPerSearch = Math.max(10, Number(value("maxResults")) || 200);
        CONFIG.defaultRadiusKm = Number(value("radius")) || 10;
        CONFIG.whatsappMessage = value("whatsapp") || CONFIG.whatsappMessage;

        const socials = parseDomainList(value("socialDomains"));
        const directories = parseDomainList(value("directoryDomains"));
        if (socials.length) {
            SOCIAL_DOMAINS.length = 0;
            socials.forEach(function (item) { SOCIAL_DOMAINS.push(item); });
        }
        if (directories.length) {
            DIRECTORY_DOMAINS.length = 0;
            directories.forEach(function (item) { DIRECTORY_DOMAINS.push(item); });
        }

        Store.mergePrefs({ config: serializeConfig() });
        updateProviderBadge();
        UI.renderSettings();
        UI.toast("Configurações salvas para esta sessão.", "success");
    }

    function parseDomainList(raw) {
        return String(raw || "")
            .split(/[\n,]/)
            .map(function (item) { return item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""); })
            .filter(function (item) { return item && item.indexOf(".") !== -1; });
    }

    function serializeConfig() {
        return {
            provider: CONFIG.provider,
            proxyUrl: CONFIG.proxyUrl,
            analyzeWebsites: CONFIG.analyzeWebsites,
            cacheEnabled: CONFIG.cacheEnabled,
            enableMockData: CONFIG.enableMockData,
            requestTimeoutMs: CONFIG.requestTimeoutMs,
            cacheTtlMs: CONFIG.cacheTtlMs,
            maxResultsPerSearch: CONFIG.maxResultsPerSearch,
            defaultRadiusKm: CONFIG.defaultRadiusKm,
            whatsappMessage: CONFIG.whatsappMessage,
            socialDomains: SOCIAL_DOMAINS.join(","),
            directoryDomains: DIRECTORY_DOMAINS.join(",")
        };
    }

    function clearData(kind) {
        if (kind === "prospects") {
            Store.clearProspects();
            UI.toast("Prospecções removidas.", "info");
        } else if (kind === "history") {
            Store.clearHistory();
            UI.toast("Histórico removido.", "info");
        } else if (kind === "cache") {
            Store.clearCache();
            UI.toast("Cache limpo.", "info");
        } else {
            Store.clearEverything();
            UI.toast("Todos os dados locais foram removidos.", "info");
        }
        UI.renderSettings();
        UI.renderProspects();
        UI.renderDashboard();
        UI.renderResults();
    }

    /* ---------- rotas ---------- */

    function navigate(view) {
        if (VIEWS.indexOf(view) === -1) view = "search";
        if (location.hash !== "#/" + view) {
            location.hash = "#/" + view;
        }
        applyView(view);
    }

    function handleRoute() {
        const hash = (location.hash || "").replace("#/", "");
        const view = VIEWS.indexOf(hash) !== -1 ? hash : "search";
        applyView(view);
        Store.setPref("view", view);
    }

    function applyView(view) {
        UI.showView(view);
        if (view === "results" && !Search.hasSearched()) {
            UI.setHtml(UI.els.resultsContainer, '<div class="empty">' + UI.icon("search") +
                "<h3>Nenhuma pesquisa realizada ainda</h3><p>Use o formulário de busca para encontrar empresas por categoria e localização.</p></div>");
        }
        if (view === "results") UI.renderResults();
        if (view === "prospects") UI.renderProspects();
        if (view === "dashboard") UI.renderDashboard();
        if (view === "exports") UI.renderExports();
        if (view === "settings") UI.renderSettings();
        if (view === "search") {
            const quick = document.getElementById("quickQuery");
            if (quick) quick.focus({ preventScroll: true });
        }
    }

    /* ---------- ações de card ---------- */

    function toggleSave(id) {
        const business = Search.findById(id);
        if (!business) return;
        const existing = Store.findProspect(business);
        if (existing) {
            Store.removeProspect(existing.id);
            UI.toast(CONFIG.messages.removed, "info");
        } else {
            Store.addProspect(business);
            UI.toast(CONFIG.messages.saved, "success");
        }
        UI.renderResults();
        UI.renderProspects();
        UI.renderDashboard();
        if (UI.els.modal && !UI.els.modal.hidden) {
            const title = document.getElementById("modal-title");
            const openFor = title ? title.textContent : "";
            if (openFor === business.name) UI.renderDetails(business);
        }
    }

    async function copy(text, label) {
        const ok = await Utils.copyToClipboard(text);
        UI.toast(ok ? "✓ " + (label || "Dados") + " copiado" + (label ? "!" : "") : "Não foi possível copiar.", ok ? "success" : "error");
    }

    function openGenerator(id) {
        const business = Search.findById(id);
        const name = business ? business.name : "a empresa";
        UI.openModal('<div class="modal__header"><div><h2 id="modal-title">Criar modelo de site</h2>' +
            '<p class="muted">' + Utils.escapeHtml(name) + "</p></div>" +
            '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">' + UI.icon("close") + "</button></div>" +
            '<div class="modal__body"><div class="notice">' + UI.icon("magic") +
            "<div><p>" + Utils.escapeHtml(CONFIG.messages.generatorSoon) + "</p>" +
            '<p class="muted">O fluxo planejado é: empresa encontrada → criar projeto → escolher modelo → gerar landing page → personalizar → publicar.</p></div></div></div>' +
            '<div class="modal__footer"><button type="button" class="btn btn--primary" data-action="close-modal">Entendi</button></div>');
    }

    function updateProspectFromModal(target) {
        const attr = ["data-edit-status", "data-prospect-status", "data-edit-notes", "data-prospect-notes"];
        for (let i = 0; i < attr.length; i += 1) {
            if (target.hasAttribute(attr[i])) {
                const changes = target.tagName === "SELECT" ? { leadStatus: target.value } : { notes: target.value };
                applyProspectChange(target.getAttribute(attr[i]), changes, target);
                return;
            }
        }
    }

    /* Aceita o id do prospecto ou, quando a empresa ainda não foi salva,
       o id do resultado — nesse caso salva antes de aplicar a alteração. */
    function applyProspectChange(ref, changes, target) {
        if (!ref) return;
        if (Store.getProspectById(ref)) {
            Store.updateProspect(ref, changes);
        } else {
            const business = Search.findById(ref);
            if (!business) return;
            const result = Store.addProspect(business);
            if (result.added) {
                Store.updateProspect(result.prospect.id, changes);
                UI.toast(CONFIG.messages.saved, "success");
            }
        }
        UI.renderProspects();
        UI.renderResults();
        UI.renderDashboard();
        if (UI.els.modal && !UI.els.modal.hidden && target) {
            const saved = Store.findProspect(Search.findById(ref) || {});
            if (saved) {
                if (target.tagName === "TEXTAREA") target.value = saved.notes || "";
                else target.value = saved.leadStatus;
            }
        }
    }

    /* ---------- eventos ---------- */

    function bindEvents() {
        window.addEventListener("hashchange", handleRoute);

        const form = UI.els.searchForm;
        if (form) {
            form.addEventListener("submit", handleSearch);
            const countryField = form.elements.country;
            if (countryField) {
                countryField.addEventListener("change", function () {
                    UI.updateLocationSuggestions(countryField.value || CONFIG.defaultCountry);
                });
            }
        }

        if (UI.els.categoryList) {
            UI.els.categoryList.addEventListener("click", function (event) {
                const chip = event.target.closest(".chip");
                if (!chip) return;
                const value = chip.getAttribute("data-category");
                const current = document.getElementById("category");
                UI.selectCategory(current && current.value === value ? "" : value);
            });
        }

        if (UI.els.filterForm) {
            const apply = Utils.debounce(function () {
                const data = new FormData(UI.els.filterForm);
                const value = function (name) {
                    const raw = data.get(name);
                    return raw == null ? "" : String(raw).trim();
                };
                const website = value("hasWebsite");
                Search.setFilters({
                    query: value("query"),
                    category: value("category"),
                    city: value("city"),
                    radiusKm: value("radiusKm") || null,
                    hasWebsite: website === "any" ? null : website === "yes",
                    hasInstagram: data.get("instagram") === "on",
                    hasFacebook: data.get("facebook") === "on",
                    minRating: value("minRating") || null,
                    minReviews: value("minReviews") || null,
                    status: value("status") || null
                });
                Store.setPref("filters", Search.getState().filters);
                const sort = value("sort") || "relevance";
                if (Search.getState().sort !== sort) Search.setSort(sort);
                UI.renderResults();
            }, 350);

            UI.els.filterForm.addEventListener("input", apply);
            UI.els.filterForm.addEventListener("change", apply);
            UI.els.filterForm.addEventListener("submit", function (event) { event.preventDefault(); });
        }

        if (UI.els.resultsTabs) {
            UI.els.resultsTabs.addEventListener("click", function (event) {
                const tab = event.target.closest("[data-tab]");
                if (!tab) return;
                Search.setTab(tab.getAttribute("data-tab"));
                UI.renderResults();
            });
        }

        if (UI.els.pagination) {
            UI.els.pagination.addEventListener("click", function (event) {
                const button = event.target.closest("[data-page]");
                if (!button || button.disabled) return;
                Search.goToPage(Number(button.getAttribute("data-page")));
                UI.renderResults();
                const container = UI.els.resultsContainer;
                if (container) container.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }

        /* Ações com data-action são delegadas no documento (handleGlobalClick),
           para que funcionem em cards, na modal e no gerador sem duplicar
           listeners a cada re-render. */

        if (UI.els.modal) {
            UI.els.modal.addEventListener("click", handleModalClick);
            UI.els.modal.addEventListener("change", function (event) {
                const target = event.target;
                if (target.matches("[data-edit-status], [data-prospect-status]")) updateProspectFromModal(target);
            });
            UI.els.modal.addEventListener("input", Utils.debounce(function (event) {
                const target = event.target;
                if (target.matches("[data-edit-notes], [data-prospect-notes]")) updateProspectFromModal(target);
            }, 500));
        }

        document.addEventListener("click", handleGlobalClick);

        if (UI.els.settingsForm) {
            UI.els.settingsForm.addEventListener("submit", saveSettings);
            UI.els.settingsForm.addEventListener("change", function (event) {
                if (event.target.name === "provider") updateProxyHint(event.target.value);
            });
        }
        const domainsForm = document.getElementById("domainsForm");
        if (domainsForm) domainsForm.addEventListener("submit", saveSettings);

        const clearFiltersButton = document.getElementById("clearFilters");
        if (clearFiltersButton) {
            clearFiltersButton.addEventListener("click", function () {
                Search.resetFilters();
                Store.setPref("filters", Search.getState().filters);
                UI.syncFilterInputs(Search.getState().filters);
                const sortSelect = document.getElementById("filterSort");
                if (sortSelect) sortSelect.value = "relevance";
                UI.renderResults();
                UI.toast("Filtros limpos.", "info");
            });
        }

        const prospectQuery = document.getElementById("prospectQuery");
        const prospectStatus = document.getElementById("prospectStatus");
        if (prospectQuery) {
            /* applyProspectChange re-renderiza a lista; evitar o duplo render. */
            prospectQuery.addEventListener("input", Utils.debounce(function () {
                if (UI.els.modal && !UI.els.modal.hidden) return;
                UI.renderProspects();
            }, 250));
        }
        if (prospectStatus) {
            prospectStatus.addEventListener("change", function () { UI.renderProspects(); });
        }
        const importInput = document.getElementById("importInput");
        if (importInput) {
            importInput.addEventListener("change", function () {
                const file = importInput.files && importInput.files[0];
                if (!file) return;
                UI.importJSON(file, function () {
                    UI.renderSettings();
                    UI.renderProspects();
                    UI.renderDashboard();
                });
                importInput.value = "";
            });
        }

        if (UI.els.menuToggle) {
            UI.els.menuToggle.addEventListener("click", function () {
                if (document.body.classList.contains("is-menu-open")) UI.closeSidebar();
                else UI.openSidebar();
            });
        }
        if (UI.els.sidebarBackdrop) {
            UI.els.sidebarBackdrop.addEventListener("click", UI.closeSidebar);
        }

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                if (!UI.els.modal.hidden) UI.closeModal();
                else if (document.body.classList.contains("is-menu-open")) UI.closeSidebar();
            }
            if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
                const quick = document.getElementById("quickQuery");
                if (quick && UI.els.modal.hidden) {
                    event.preventDefault();
                    quick.focus();
                }
            }
            if (event.key === "Tab" && !UI.els.modal.hidden) trapFocus(event);
        });

        window.addEventListener("online", updateConnectivity);
        window.addEventListener("offline", updateConnectivity);
        window.addEventListener("resize", Utils.debounce(function () {
            if (window.innerWidth > 1024) UI.closeSidebar();
        }, 200));
    }

    function updateProxyHint(providerId) {
        const hint = document.getElementById("proxyHint");
        if (!hint) return;
        const provider = API.SearchProvider[providerId];
        if (!provider) return;
        hint.textContent = provider.requiresProxy
            ? "Este provedor precisa de um proxy serverless para proteger a chave da API. Veja README → Segurança."
            : "Provedor local de demonstração. Nenhuma chave é necessária.";
        const urlField = UI.els.settingsForm && UI.els.settingsForm.elements.proxyUrl;
        if (urlField) urlField.required = provider.requiresProxy;
    }

    function handleActionClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const action = button.getAttribute("data-action");
        const id = button.getAttribute("data-id");
        if (action === "details") {
            const business = Search.findById(id);
            if (business) UI.renderDetails(business, { returnFocus: button });
        } else if (action === "save") {
            toggleSave(id);
        } else if (action === "generator") {
            openGenerator(id);
        } else if (action === "retry") {
            handleSearch();
        } else if (action === "close-modal") {
            UI.closeModal();
        }
    }

    function handleModalClick(event) {
        if (event.target.classList.contains("modal__backdrop")) {
            UI.closeModal();
            return;
        }
        const copyButton = event.target.closest("[data-copy]");
        if (copyButton) {
            copy(copyButton.getAttribute("data-copy"), "Dado");
            return;
        }
        const copyAll = event.target.closest("[data-copy-all]");
        if (copyAll) {
            const business = Search.findById(copyAll.getAttribute("data-copy-all"));
            if (business) copy(UI.buildBusinessText(business), "Todos os dados");
            return;
        }
        const removeButton = event.target.closest("[data-prospect-remove]");
        if (removeButton) {
            const prospectId = removeButton.getAttribute("data-prospect-remove");
            Store.removeProspect(prospectId);
            UI.toast(CONFIG.messages.removed, "info");
            UI.closeModal();
            UI.renderProspects();
            UI.renderResults();
            UI.renderDashboard();
        }
    }

    function handleGlobalClick(event) {
        const nav = event.target.closest("a[data-view]");
        if (nav) {
            event.preventDefault();
            navigate(nav.getAttribute("data-view"));
            return;
        }

        const tab = event.target.closest("[data-tab]");
        if (tab && tab.closest("#resultsTabs")) {
            Search.setTab(tab.getAttribute("data-tab"));
            UI.renderResults();
            return;
        }

        const historyRepeat = event.target.closest("[data-history-repeat]");
        if (historyRepeat) {
            const record = Store.listHistory().find(function (item) { return item.id === historyRepeat.getAttribute("data-history-repeat"); });
            const params = Search.repeatSearch(record);
            if (params) {
                applySearchToForm(params);
                navigate("search");
                handleSearch();
            }
            return;
        }

        const historyRemove = event.target.closest("[data-history-remove]");
        if (historyRemove) {
            Store.removeHistory(historyRemove.getAttribute("data-history-remove"));
            UI.renderHistory();
            return;
        }

        const editButton = event.target.closest("[data-prospect-edit]");
        if (editButton) {
            UI.openProspectEditor(editButton.getAttribute("data-prospect-edit"));
            return;
        }

        const copyButton = event.target.closest("[data-prospect-copy]");
        if (copyButton) {
            const item = Store.getProspectById(copyButton.getAttribute("data-prospect-copy"));
            if (item) copy(UI.buildBusinessText(item), "Todos os dados");
            return;
        }

        const removeRow = event.target.closest("[data-prospect-remove]");
        if (removeRow) {
            Store.removeProspect(removeRow.getAttribute("data-prospect-remove"));
            UI.toast(CONFIG.messages.removed, "info");
            UI.renderProspects();
            UI.renderResults();
            UI.renderDashboard();
            return;
        }

        const exportButton = event.target.closest("[data-export]");
        if (exportButton && !exportButton.disabled) {
            UI.exportCSV(exportButton.getAttribute("data-export"));
            return;
        }

        if (event.target.closest("#exportJson")) {
            UI.exportJSON();
            return;
        }

        const clearButton = event.target.closest("[data-clear]");
        if (clearButton) {
            const kind = clearButton.getAttribute("data-clear");
            if (kind === "all" && !window.confirm("Remover prospecções, histórico, cache e preferências deste navegador?")) return;
            clearData(kind);
            return;
        }

        const actionButton = event.target.closest("[data-action]");
        if (actionButton) {
            handleActionClick(event);
        }
    }

    function trapFocus(event) {
        const modal = UI.els.modal;
        const focusables = modal.querySelectorAll("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function updateProviderBadge() {
        const badge = UI.els.providerBadge;
        if (!badge) return;
        const provider = API.SearchProvider[CONFIG.provider];
        const isMock = CONFIG.provider === "mock";
        badge.textContent = isMock ? "Dados fictícios" : provider ? provider.label : CONFIG.provider;
        badge.classList.toggle("badge--mock", isMock);
        badge.classList.toggle("badge--live", !isMock);
        badge.title = API.getSourceNotice(CONFIG.provider) || (provider ? provider.label : "");
    }

    function updateConnectivity() {
        const badge = UI.els.offlineBadge;
        const online = navigator.onLine;
        if (badge) {
            badge.hidden = online;
            badge.textContent = CONFIG.messages.offline;
        }
        document.body.classList.toggle("is-offline", !online);
    }

    document.addEventListener("DOMContentLoaded", init);

    return {
        init: init,
        navigate: navigate,
        handleSearch: handleSearch,
        loadMore: loadMore,
        toggleSave: toggleSave
    };
})();

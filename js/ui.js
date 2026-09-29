/* Prospecção Web — Renderização da interface. */

const UI = (function () {
    "use strict";

    const els = {};

    function icon(name, className) {
        return '<svg class="icon ' + (className || "") + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
    }

    function cacheElements() {
        const ids = [
            "sidebar", "sidebarBackdrop", "menuToggle", "main", "toasts", "liveRegion", "modal", "modalContent", "modalClose",
            "view-search", "view-results", "view-prospects", "view-dashboard", "view-exports", "view-settings",
            "searchForm", "resultsContainer", "resultsTabs", "statsRow", "pagination", "resultsSummary", "filtersPanel",
            "resultsToolbar", "prospectsContainer", "prospectsFilters", "dashboardGrid", "historyList", "historyCount",
            "exportsPanel", "settingsForm", "navProspectCount", "providerBadge", "offlineBadge", "categoryList",
            "countryList", "stateList", "cityList", "datalistCategories", "datalistCountries", "datalistStates", "datalistCities",
            "filterForm", "resultCount", "duplicatesNote", "analysisNote", "historySection", "emptyResults", "sourceNotice"
        ];
        ids.forEach(function (id) { els[id] = document.getElementById(id); });
    }

    /* ---------- utilidades de DOM ---------- */

    function setHtml(element, html) {
        if (!element) return;
        element.innerHTML = html;
    }

    function announce(message) {
        if (!els.liveRegion) return;
        els.liveRegion.textContent = message;
    }

    function toast(message, tone) {
        if (!els.toasts) return;
        const item = document.createElement("div");
        item.className = "toast toast--" + (tone || "info");
        item.setAttribute("role", "status");
        item.innerHTML = icon(tone === "success" ? "check" : tone === "error" ? "alert" : "info") + "<span>" + Utils.escapeHtml(message) + "</span>";
        els.toasts.appendChild(item);
        requestAnimationFrame(function () { item.classList.add("is-visible"); });
        setTimeout(function () {
            item.classList.add("is-leaving");
            setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 260);
        }, 3200);
        announce(message);
    }

    /* ---------- navegação ---------- */

    function showView(viewName) {
        const views = document.querySelectorAll("[data-view]");
        views.forEach(function (view) {
            const isTarget = view.getAttribute("data-view") === viewName;
            if (view.classList.contains("view")) {
                view.hidden = !isTarget;
            } else if (view.tagName === "A") {
                view.classList.toggle("is-active", isTarget);
                if (isTarget) view.setAttribute("aria-current", "page");
                else view.removeAttribute("aria-current");
            }
        });
        if (els.main) {
            els.main.scrollTop = 0;
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        closeSidebar();
    }

    function openSidebar() {
        document.body.classList.add("is-menu-open");
        if (els.sidebar) {
            els.sidebar.classList.add("is-open");
            els.sidebar.removeAttribute("inert");
        }
        if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = false;
        if (els.menuToggle) {
            els.menuToggle.setAttribute("aria-expanded", "true");
            els.menuToggle.setAttribute("aria-label", "Fechar menu");
        }
    }

    function closeSidebar() {
        document.body.classList.remove("is-menu-open");
        if (els.sidebar) els.sidebar.classList.remove("is-open");
        if (els.sidebarBackdrop) els.sidebarBackdrop.hidden = true;
        if (els.menuToggle) {
            els.menuToggle.setAttribute("aria-expanded", "false");
            els.menuToggle.setAttribute("aria-label", "Abrir menu");
        }
    }

    /* ---------- listas e datalists ---------- */

    function fillDatalist(element, values) {
        if (!element) return;
        setHtml(element, values.map(function (value) {
            return '<option value="' + Utils.escapeHtml(value) + '"></option>';
        }).join(""));
    }

    function renderCategoryPicker() {
        if (!els.categoryList) return;
        const groups = Utils.getCategoryGroups();
        setHtml(els.categoryList, groups.map(function (group) {
            return '<div class="category-group">' +
                '<p class="category-group__title">' + icon(group.icon) + Utils.escapeHtml(group.group) + "</p>" +
                '<div class="chips" role="group" aria-label="' + Utils.escapeHtml(group.group) + '">' +
                group.items.map(function (item) {
                    return '<button type="button" class="chip" data-category="' + Utils.escapeHtml(item) + '" aria-pressed="false">' + Utils.escapeHtml(item) + "</button>";
                }).join("") +
                "</div></div>";
        }).join(""));
    }

    function selectCategory(value) {
        const input = document.getElementById("category");
        if (input) input.value = value;
        if (!els.categoryList) return;
        els.categoryList.querySelectorAll(".chip").forEach(function (chip) {
            const active = chip.getAttribute("data-category") === value;
            chip.classList.toggle("is-active", active);
            chip.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function updateLocationSuggestions(countryName) {
        fillDatalist(els.datalistCountries, Utils.getCountryNames());
        fillDatalist(els.datalistStates, Utils.getStatesForCountry(countryName));
        fillDatalist(els.datalistCities, Utils.getCitiesForCountry(countryName));
    }

    /* ---------- estatísticas (§34) ---------- */

    function renderStats(summary) {
        if (!els.statsRow) return;
        if (!summary) {
            setHtml(els.statsRow, "");
            return;
        }
        const cards = [
            { label: "Empresas encontradas", value: summary.total, tone: "neutral", icon: "building" },
            { label: "Com site", value: summary.withWebsite, tone: "success", icon: "check" },
            { label: "Sem site", value: summary.withoutWebsite, tone: "danger", icon: "ban" },
            { label: "Verificação necessária", value: summary.needsVerification, tone: "info", icon: "help" },
            { label: "Duplicados removidos", value: summary.duplicatesRemoved || 0, tone: "muted", icon: "filter" }
        ];
        setHtml(els.statsRow, cards.map(function (card) {
            return '<div class="stat stat--' + card.tone + '">' +
                '<span class="stat__icon" aria-hidden="true">' + icon(card.icon) + "</span>" +
                '<span class="stat__value">' + Utils.formatNumber(card.value) + "</span>" +
                '<span class="stat__label">' + Utils.escapeHtml(card.label) + "</span></div>";
        }).join(""));
    }

    /* ---------- filtros e abas ---------- */

    function renderTabs() {
        if (!els.resultsTabs) return;
        const state = Search.getState();
        setHtml(els.resultsTabs, Search.TABS.map(function (tab) {
            const count = state.results.filter(tab.match).length;
            const active = state.tab === tab.id;
            return '<button type="button" role="tab" class="tab' + (active ? " is-active" : "") + '" data-tab="' + tab.id + '" id="tab-' + tab.id + '" aria-selected="' + (active ? "true" : "false") + '">' +
                Utils.escapeHtml(tab.label) + ' <span class="tab__count">' + count + "</span></button>";
        }).join(""));
    }

    function syncFilterInputs(filters) {
        const set = function (id, value) {
            const element = document.getElementById(id);
            if (element) element.value = value == null ? "" : value;
        };
        const check = function (id, value) {
            const element = document.getElementById(id);
            if (element) element.checked = !!value;
        };
        set("filterQuery", filters.query);
        set("filterCategory", filters.category);
        set("filterCity", filters.city);
        set("filterRadius", filters.radiusKm);
        set("filterMinRating", filters.minRating);
        set("filterMinReviews", filters.minReviews);
        const websiteSelect = document.getElementById("filterHasWebsite");
        if (websiteSelect) {
            websiteSelect.value = filters.hasWebsite === null ? "any" : filters.hasWebsite ? "yes" : "no";
        }
        const statusSelect = document.getElementById("filterStatus");
        if (statusSelect) statusSelect.value = filters.status || "";
        check("filterInstagram", filters.hasInstagram);
        check("filterFacebook", filters.hasFacebook);
    }

    /* ---------- cards (§13) ---------- */

    function statusBadge(business) {
        const meta = STATUS_META[business.status] || STATUS_META[VERIFY];
        return '<span class="status status--' + meta.tone + '">' + icon(meta.icon) + "<span>" + Utils.escapeHtml(meta.short) + "</span></span>";
    }

    function scoreBadge(business) {
        const opportunity = business.opportunity;
        if (!opportunity || opportunity.level === "desativado") return "";
        const tone = opportunity.level === "Alto" ? "success" : opportunity.level === "Médio" ? "info" : "muted";
        return '<span class="score score--' + tone + '" title="' + Utils.escapeHtml(opportunity.note) + '">' +
            icon("gauge") + "<span>Perfil " + Utils.escapeHtml(opportunity.level) + " · " + opportunity.score + "</span></span>";
    }

    function linkOrDash(value, label) {
        if (!value) return '<span class="dash">Não identificado</span>';
        return '<a href="' + Utils.escapeHtml(Utils.safeUrlForHref(value)) + '" target="_blank" rel="noopener noreferrer nofollow">' +
            Utils.escapeHtml(label || Utils.normalizeDomain(value)) + "</a>";
    }

    function actionButtons(business) {
        const buttons = [];
        buttons.push('<button type="button" class="btn btn--ghost btn--sm" data-action="details" data-id="' + Utils.escapeHtml(business.id) + '">Ver detalhes</button>');

        if (business.mapsUrl) {
            buttons.push('<a class="btn btn--ghost btn--sm" href="' + Utils.escapeHtml(Utils.safeUrlForHref(business.mapsUrl)) + '" target="_blank" rel="noopener noreferrer nofollow">' + icon("map") + "Google Maps" + icon("external") + "</a>");
        }

        const website = business.website;
        if (website && !Classifier.isSocialDomain(website) && !Classifier.isDirectoryDomain(website)) {
            buttons.push('<a class="btn btn--ghost btn--sm" href="' + Utils.escapeHtml(Utils.safeUrlForHref(website)) + '" target="_blank" rel="noopener noreferrer nofollow">' + icon("globe") + "Visitar site</a>");
        }

        const socials = business.socials || {};
        if (socials.instagram) {
            buttons.push('<a class="btn btn--ghost btn--sm btn--icon" href="' + Utils.escapeHtml(Utils.safeUrlForHref(socials.instagram)) + '" target="_blank" rel="noopener noreferrer nofollow" aria-label="Instagram de ' + Utils.escapeHtml(business.name) + '">' + icon("instagram") + "</a>");
        }
        if (socials.facebook) {
            buttons.push('<a class="btn btn--ghost btn--sm btn--icon" href="' + Utils.escapeHtml(Utils.safeUrlForHref(socials.facebook)) + '" target="_blank" rel="noopener noreferrer nofollow" aria-label="Facebook de ' + Utils.escapeHtml(business.name) + '">' + icon("facebook") + "</a>");
        }
        if (business.phone) {
            const whatsapp = Utils.gerarUrlWhatsApp(business.phone, CONFIG.whatsappMessage, Utils.getCountryDialCode(business.country));
            buttons.push('<a class="btn btn--ghost btn--sm btn--icon" href="' + Utils.escapeHtml(whatsapp) + '" target="_blank" rel="noopener noreferrer nofollow" title="Abre o WhatsApp com este número. O sistema não confirma se o número possui WhatsApp." aria-label="Abrir WhatsApp com ' + Utils.escapeHtml(business.phone) + ' (sujeito a confirmação do número)">' + icon("whatsapp") + "</a>");
        }

        const saved = Store.isProspectSaved(business);
        buttons.push('<button type="button" class="btn btn--' + (saved ? "primary" : "soft") + ' btn--sm" data-action="save" data-id="' + Utils.escapeHtml(business.id) + '" aria-pressed="' + (saved ? "true" : "false") + '">' +
            '<svg class="icon ' + (saved ? "icon--fill" : "") + '" aria-hidden="true" focusable="false"><use href="#i-star"></use></svg>' + (saved ? "Salvo" : "Adicionar à prospecção") + "</button>");

        if (business.status !== STATUS.HAS_WEBSITE) {
            buttons.push('<button type="button" class="btn btn--accent btn--sm" data-action="generator" data-id="' + Utils.escapeHtml(business.id) + '">' + icon("magic") + "Criar modelo</button>");
        }

        return buttons.join("");
    }

    function renderCard(business) {
        const socials = business.socials || {};
        const websiteLabel = business.website
            ? (Classifier.isSocialDomain(business.website) || Classifier.isDirectoryDomain(business.website)
                ? "Link de " + Utils.escapeHtml(Utils.normalizeDomain(business.website)) + " (não é site próprio)"
                : linkOrDash(business.website))
            : '<span class="dash">Não identificado</span>';

        return '<article class="card business-card" data-id="' + Utils.escapeHtml(business.id) + '">' +
            '<header class="business-card__head">' +
            "<div>" +
            '<h3 class="business-card__name">' + Utils.escapeHtml(business.name) + "</h3>" +
            '<p class="business-card__category">' + icon("tag") + Utils.escapeHtml(business.category || "Categoria não informada") + "</p>" +
            "</div>" + statusBadge(business) +
            "</header>" +
            '<ul class="business-card__meta">' +
            '<li>' + icon("star") + "<strong>" + Utils.formatRating(business.rating) + "</strong><span>" + Utils.formatNumber(business.reviews || 0) + " avaliações</span></li>" +
            '<li>' + icon("map") + "<span>" + Utils.escapeHtml(business.locationLabel || business.address || "Localização não informada") + "</span></li>" +
            (business.phone ? '<li>' + icon("phone") + "<span>" + Utils.escapeHtml(Utils.formatPhone(business.phone)) + "</span></li>" : "") +
            "</ul>" +
            '<dl class="business-card__links">' +
            "<div><dt>" + icon("globe") + "Site</dt><dd>" + websiteLabel + "</dd></div>" +
            "<div><dt>" + icon("instagram") + "Instagram</dt><dd>" + (socials.instagram ? linkOrDash(socials.instagram, "Encontrado") : '<span class="dash">Não encontrado</span>') + "</dd></div>" +
            "<div><dt>" + icon("facebook") + "Facebook</dt><dd>" + (socials.facebook ? linkOrDash(socials.facebook, "Encontrado") : '<span class="dash">Não encontrado</span>') + "</dd></div>" +
            "</dl>" +
            '<div class="business-card__foot">' + scoreBadge(business) +
            '<div class="business-card__actions">' + actionButtons(business) + "</div></div></article>";
    }

    function renderSkeleton(count) {
        const items = [];
        for (let i = 0; i < (count || 6); i += 1) {
            items.push('<div class="card skeleton" aria-hidden="true">' +
                '<div class="skeleton__line skeleton__line--title"></div>' +
                '<div class="skeleton__line"></div>' +
                '<div class="skeleton__line skeleton__line--short"></div>' +
                '<div class="skeleton__line"></div>' +
                '<div class="skeleton__line skeleton__line--actions"></div></div>');
        }
        return items.join("");
    }

    function renderLoading(progress) {
        setHtml(els.resultsContainer, '<div class="loading" role="status">' +
            '<div class="spinner" aria-hidden="true"></div>' +
            '<p class="loading__step">' + Utils.escapeHtml(progress || "Pesquisando empresas...") + "</p>" +
            '<p class="muted">Analisando presença digital de cada resultado.</p></div>' + renderSkeleton(4));
        if (els.resultsContainer) els.resultsContainer.setAttribute("aria-busy", "true");
    }

    function setLoadingProgress(progress) {
        if (!els.resultsContainer) return;
        const step = els.resultsContainer.querySelector(".loading__step");
        if (step) step.textContent = progress || "";
        els.resultsContainer.setAttribute("aria-busy", "true");
    }

    function renderError(errorInfo) {
        const retry = '<button type="button" class="btn btn--primary" data-action="retry">' + icon("refresh") + "Tentar novamente</button>";
        setHtml(els.resultsContainer, '<div class="notice notice--error" role="alert">' +
            icon("alert") +
            "<div><h3>Não foi possível concluir a pesquisa</h3><p>" + Utils.escapeHtml(errorInfo.message) + "</p>" +
            (errorInfo.detail ? '<p class="muted">' + Utils.escapeHtml(errorInfo.detail) + "</p>" : "") +
            '<div class="notice__actions">' + retry + "</div></div></div>");
        if (els.resultsContainer) els.resultsContainer.setAttribute("aria-busy", "false");
        announce(errorInfo.message);
    }

    function renderResults() {
        const state = Search.getState();
        const page = Search.getPage();

        if (els.resultsSummary) {
            const params = state.params || {};
            const parts = [params.query, params.category, params.city, params.state, params.country].filter(function (part) { return part; });
            els.resultsSummary.textContent = parts.length ? parts.join(" · ") : "Resultados";
        }
        if (els.resultCount) {
            els.resultCount.textContent = page.total + (page.total === 1 ? " empresa" : " empresas");
        }
        if (els.duplicatesNote && state.summary) {
            const notes = [];
            if (state.summary.duplicatesRemoved) notes.push(state.summary.duplicatesRemoved + " duplicado(s) removido(s)");
            if (state.summary.fromCache) notes.push("exibido do cache local");
            els.duplicatesNote.textContent = notes.join(" · ");
        }
        if (els.sourceNotice) {
            const notice = API.getSourceNotice(state.summary && state.summary.provider);
            els.sourceNotice.textContent = notice;
            els.sourceNotice.hidden = !notice;
            els.sourceNotice.classList.toggle("notice--warning", (state.summary && state.summary.provider) === "mock");
        }
        if (els.analysisNote && state.summary) {
            els.analysisNote.textContent = "Fonte: " + (state.summary.provider || CONFIG.provider) + " · " + Utils.formatDateTime(new Date());
        }

        renderStats(state.summary);
        renderTabs();

        if (!state.results.length) {
            if (els.emptyResults) els.emptyResults.hidden = false;
            setHtml(els.resultsContainer, '<div class="empty">' + icon("search") +
                "<h3>Nenhuma empresa encontrada</h3><p>" + Utils.escapeHtml(CONFIG.messages.noResults) + "</p></div>");
            if (els.resultsContainer) els.resultsContainer.setAttribute("aria-busy", "false");
            renderPagination(page);
            return;
        }

        if (els.emptyResults) els.emptyResults.hidden = true;

        if (!page.items.length) {
            setHtml(els.resultsContainer, '<div class="empty">' + icon("filter") +
                "<h3>Nenhuma empresa corresponde a este filtro</h3><p>Ajuste os filtros ou selecione a aba “Todas”.</p></div>");
        } else {
            setHtml(els.resultsContainer, '<div class="grid grid--cards">' + page.items.map(renderCard).join("") + "</div>");
        }
        if (els.resultsContainer) els.resultsContainer.setAttribute("aria-busy", "false");
        renderPagination(page);
    }

    function renderPagination(page) {
        if (!els.pagination) return;
        if (page.totalPages <= 1) {
            setHtml(els.pagination, "");
            return;
        }
        const buttons = [];
        buttons.push('<button type="button" class="btn btn--ghost btn--sm" data-page="' + (page.page - 1) + '"' + (page.page === 1 ? " disabled" : "") + ">" + icon("chevron-left") + "Anterior</button>");
        const start = Math.max(1, Math.min(page.page - 2, page.totalPages - 4));
        const end = Math.min(page.totalPages, start + 4);
        for (let i = start; i <= end; i += 1) {
            buttons.push('<button type="button" class="page' + (i === page.page ? " is-active" : "") + '" data-page="' + i + '"' + (i === page.page ? ' aria-current="page"' : "") + ">" + i + "</button>");
        }
        buttons.push('<button type="button" class="btn btn--ghost btn--sm" data-page="' + (page.page + 1) + '"' + (page.page === page.totalPages ? " disabled" : "") + ">" + "Próxima" + icon("chevron-right") + "</button>");
        setHtml(els.pagination, buttons.join(""));
    }

    /* ---------- modal / detalhes (§23) ---------- */

    let lastFocused = null;

    function openModal(content, returnFocus) {
        if (!els.modal) return;
        lastFocused = returnFocus && returnFocus.focus ? returnFocus : document.activeElement;
        setHtml(els.modalContent, content);
        els.modal.hidden = false;
        document.body.classList.add("is-modal-open");
        const dialog = els.modal.querySelector(".modal__dialog");
        if (dialog) dialog.focus();
    }

    function closeModal() {
        if (!els.modal || els.modal.hidden) return;
        els.modal.hidden = true;
        setHtml(els.modalContent, "");
        document.body.classList.remove("is-modal-open");
        if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function detailRow(label, value) {
        return "<div><dt>" + Utils.escapeHtml(label) + "</dt><dd>" + value + "</dd></div>";
    }

    function renderDetails(business, opts) {
        const meta = STATUS_META[business.status] || STATUS_META[VERIFY];
        const socials = business.socials || {};
        const analysis = business.analysis;
        const opportunity = business.opportunity;

        const socialList = Object.keys(socials).filter(function (key) {
            return key !== "other" && socials[key];
        }).map(function (key) {
            return linkOrDash(socials[key], key.charAt(0).toUpperCase() + key.slice(1));
        });
        if ((socials.other || []).length) {
            (socials.other).forEach(function (url) { socialList.push(linkOrDash(url, "Outro")); });
        }
        if (!socialList.length) socialList.push('<span class="dash">Nenhuma</span>');

        const analysisRows = [];
        if (analysis) {
            analysisRows.push(detailRow("Domínio", Utils.escapeHtml(analysis.domain || "—")));
            analysisRows.push(detailRow("Tipo de domínio", Utils.escapeHtml(analysis.type === "own" ? "Domínio próprio (candidato)" : analysis.type === "social" ? "Rede social" : analysis.type === "directory" ? "Diretório / plataforma" : "Inválido")));
            analysisRows.push(detailRow("HTTPS", analysis.https ? "Sim" : "Não"));
            analysisRows.push(detailRow("Página carregada", analysis.reachable ? "Sim" : "Não" + (analysis.statusCode ? " (HTTP " + analysis.statusCode + ")" : "")));
            if (analysis.redirect) {
                analysisRows.push(detailRow("Redirecionamento", Utils.escapeHtml(analysis.redirect.type) + " → " + linkOrDash(analysis.redirect.target)));
            }
            if (analysis.page && analysis.page.title) {
                analysisRows.push(detailRow("Título da página", Utils.escapeHtml(analysis.page.title.slice(0, 120))));
            }
            analysisRows.push(detailRow("Verificação", Utils.escapeHtml(analysis.reason || "—")));
        } else {
            analysisRows.push(detailRow("Verificação", "Nenhuma URL informada pelo provedor."));
        }

        const scoreFactors = opportunity && opportunity.factors && opportunity.factors.length
            ? '<ul class="factor-list">' + opportunity.factors.map(function (factor) {
                return '<li><span class="factor__points factor__points--' + (factor.points >= 0 ? "pos" : "neg") + '">' + (factor.points >= 0 ? "+" : "") + factor.points + "</span>" + Utils.escapeHtml(factor.label) + "</li>";
            }).join("") + "</ul>"
            : '<p class="muted">Indicador desativado.</p>';

        const saved = Store.isProspectSaved(business);
        const prospect = Store.findProspect(business);
        const prospectRef = prospect ? prospect.id : "";

        const content = '<div class="modal__header">' +
            "<div><h2 id=\"modal-title\">" + Utils.escapeHtml(business.name) + "</h2>" +
            '<p class="muted">' + Utils.escapeHtml(business.category || "Categoria não informada") + " · " + Utils.escapeHtml(business.locationLabel || "") + "</p></div>" +
            '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar detalhes">' + icon("close") + "</button></div>" +
            '<div class="modal__body">' +
            '<div class="modal__status"><span class="status status--' + meta.tone + '">' + icon(meta.icon) + Utils.escapeHtml(meta.label) + "</span>" +
            (opportunity && opportunity.level !== "desativado" ? '<span class="score score--info">Perfil ' + Utils.escapeHtml(opportunity.level) + " · " + opportunity.score + "</span>" : "") + "</div>" +
            '<p class="reason"><strong>Motivo da classificação:</strong> ' + Utils.escapeHtml(business.reason) + "</p>" +
            '<dl class="detail-grid">' +
            detailRow("Endereço", Utils.escapeHtml(business.address || "Não informado")) +
            detailRow("Telefone", business.phone ? Utils.escapeHtml(Utils.formatPhone(business.phone)) : '<span class="dash">Não informado</span>') +
            detailRow("Website", business.website ? linkOrDash(business.website) : '<span class="dash">Não identificado</span>') +
            detailRow("Redes sociais", socialList.join(" · ")) +
            detailRow("Google Maps", business.mapsUrl ? linkOrDash(business.mapsUrl, "Abrir no mapa") : '<span class="dash">Não disponível</span>') +
            detailRow("Avaliação", Utils.formatRating(business.rating) + " (" + Utils.formatNumber(business.reviews || 0) + " avaliações)") +
            detailRow("Data da busca", Utils.escapeHtml(Utils.formatDateTime(business.searchedAt))) +
            analysisRows.join("") +
            "</dl>" +
            '<h3 class="modal__subtitle">Perfil para prospecção</h3>' + scoreFactors +
            (opportunity ? '<p class="muted small">' + Utils.escapeHtml(opportunity.note) + "</p>" : "") +
            '<h3 class="modal__subtitle">Copiar dados</h3>' +
            '<div class="row-actions">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + Utils.escapeHtml(business.name) + '">' + icon("copy") + "Nome</button>" +
            (business.phone ? '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + Utils.escapeHtml(business.phone) + '">' + icon("copy") + "Telefone</button>" : "") +
            (business.address ? '<button type="button" class="btn btn--ghost btn--sm" data-copy="' + Utils.escapeHtml(business.address) + '">' + icon("copy") + "Endereço</button>" : "") +
            '<button type="button" class="btn btn--ghost btn--sm" data-copy-all="' + Utils.escapeHtml(business.id) + '">' + icon("copy") + "Todos os dados</button>" +
            "</div>" +
            '<h3 class="modal__subtitle">Prospecção</h3>' +
            '<div class="modal__prospect" data-prospect-ref="' + Utils.escapeHtml(business.id) + '">' +
            '<label class="field"><span>Status do contato</span><select data-prospect-status="' + Utils.escapeHtml(prospectRef) + '">' +
            LEAD_STATUSES.map(function (status) {
                const selected = prospect && prospect.leadStatus === status ? " selected" : "";
                return '<option value="' + Utils.escapeHtml(status) + '"' + selected + ">" + Utils.escapeHtml(status) + "</option>";
            }).join("") + "</select></label>" +
            '<label class="field"><span>Observações</span><textarea rows="3" data-prospect-notes="' + Utils.escapeHtml(prospectRef) + '" placeholder="Ex.: empresa tem Instagram ativo, mas não encontrei site próprio.">' + Utils.escapeHtml(prospect ? prospect.notes || "" : "") + "</textarea></label>" +
            '<p class="muted small">' + (saved
                ? "Esta empresa já está na sua prospecção. As alterações são salvas automaticamente."
                : "Salve a empresa na prospecção para acompanhar status e observações.") + "</p>" +
            "</div>" +
            "</div>" +
            '<div class="modal__footer">' + actionButtons(business) + "</div>";

        openModal(content, opts && opts.returnFocus);
    }

    /* ---------- prospecções ---------- */

    function fillLeadStatusFilter() {
        const select = document.getElementById("prospectStatus");
        if (!select || select.dataset.filled === "true") return;
        LEAD_STATUSES.forEach(function (status) {
            const option = document.createElement("option");
            option.value = status;
            option.textContent = status;
            select.appendChild(option);
        });
        select.dataset.filled = "true";
    }

    function renderProspects() {
        if (!els.prospectsContainer) return;
        const all = Store.listProspects();
        if (els.navProspectCount) els.navProspectCount.textContent = all.length;
        fillLeadStatusFilter();

        const queryField = document.getElementById("prospectQuery");
        const statusField = document.getElementById("prospectStatus");
        const query = queryField ? Utils.stripAccents(queryField.value || "").toLowerCase().trim() : "";
        const status = statusField ? statusField.value : "";
        const list = all.filter(function (item) {
            if (status && item.leadStatus !== status) return false;
            if (!query) return true;
            const haystack = Utils.stripAccents([item.name, item.category, item.city, item.location, item.notes, item.leadStatus, item.statusShort].join(" ")).toLowerCase();
            return haystack.indexOf(query) !== -1;
        });

        if (!list.length) {
            const isFiltered = query || status;
            setHtml(els.prospectsContainer, '<div class="empty">' + icon("star") +
                "<h3>" + (isFiltered ? "Nenhuma empresa corresponde ao filtro" : "Nenhuma empresa salva ainda") + "</h3><p>" +
                (isFiltered
                    ? "Ajuste a busca ou o status do contato para ver outros registros."
                    : "Use “Adicionar à prospecção” nos resultados da busca para montar sua lista de contatos.") + "</p></div>");
            return;
        }

        const rows = list.map(function (item) {
            const tone = LEAD_STATUS_TONE[item.leadStatus] || "neutral";
            const statusMeta = STATUS_META[item.status] || STATUS_META[VERIFY];
            return "<tr>" +
                '<td data-label="Empresa"><strong>' + Utils.escapeHtml(item.name) + "</strong><br><span class=\"muted small\">" + Utils.escapeHtml(item.location || "") + "</span></td>" +
                '<td data-label="Categoria">' + Utils.escapeHtml(item.category || "—") + "</td>" +
                '<td data-label="Telefone">' + (item.phone ? Utils.escapeHtml(Utils.formatPhone(item.phone)) : "—") + "</td>" +
                '<td data-label="Site">' + (item.website ? linkOrDash(item.website) : '<span class="dash">Não identificado</span>') + "</td>" +
                '<td data-label="Status"><span class="status status--' + statusMeta.tone + '">' + Utils.escapeHtml(statusMeta.short) + "</span></td>" +
                '<td data-label="Contato"><span class="badge badge--' + tone + '">' + Utils.escapeHtml(item.leadStatus) + "</span></td>" +
                '<td data-label="Data">' + Utils.escapeHtml(Utils.formatDate(item.searchedAt)) + "</td>" +
                '<td data-label="Ações"><div class="row-actions">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-prospect-edit="' + Utils.escapeHtml(item.id) + '">' + icon("edit") + "Editar</button>" +
                '<button type="button" class="btn btn--ghost btn--sm" data-prospect-copy="' + Utils.escapeHtml(item.id) + '">' + icon("copy") + "Copiar</button>" +
                '<button type="button" class="btn btn--danger btn--sm" data-prospect-remove="' + Utils.escapeHtml(item.id) + '" aria-label="Remover ' + Utils.escapeHtml(item.name) + ' da prospecção">' + icon("trash") + "</button>" +
                "</div></td></tr>";
        }).join("");

        setHtml(els.prospectsContainer, '<div class="table-wrap"><table class="data-table"><caption class="sr-only">Empresas salvas na prospecção</caption>' +
            "<thead><tr><th scope=\"col\">Empresa</th><th scope=\"col\">Categoria</th><th scope=\"col\">Telefone</th><th scope=\"col\">Site</th><th scope=\"col\">Status</th><th scope=\"col\">Contato</th><th scope=\"col\">Data</th><th scope=\"col\">Ações</th></tr></thead>" +
            "<tbody>" + rows + "</tbody></table></div>");
    }

    function openProspectEditor(id) {
        const item = Store.getProspectById(id);
        if (!item) return;
        const content = '<div class="modal__header"><div><h2 id="modal-title">' + Utils.escapeHtml(item.name) + "</h2>" +
            '<p class="muted">' + Utils.escapeHtml(item.category || "") + " · " + Utils.escapeHtml(item.location || "") + '</p></div>' +
            '<button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">' + icon("close") + "</button></div>" +
            '<div class="modal__body"><div class="modal__prospect">' +
            '<label class="field"><span>Status do contato</span><select data-edit-status="' + Utils.escapeHtml(id) + '">' +
            LEAD_STATUSES.map(function (status) {
                return '<option value="' + Utils.escapeHtml(status) + '"' + (item.leadStatus === status ? " selected" : "") + ">" + Utils.escapeHtml(status) + "</option>";
            }).join("") + "</select></label>" +
            '<label class="field"><span>Observações</span><textarea rows="5" data-edit-notes="' + Utils.escapeHtml(id) + '">' + Utils.escapeHtml(item.notes || "") + "</textarea></label>" +
            '<div class="row-actions">' +
            (item.phone ? '<a class="btn btn--soft btn--sm" href="tel:' + Utils.escapeHtml(Utils.phoneDigits(item.phone)) + '">' + icon("phone") + "Ligar</a>" : "") +
            (item.phone ? '<button type="button" class="btn btn--soft btn--sm" data-copy="' + Utils.escapeHtml(item.phone) + '">' + icon("copy") + "Copiar telefone</button>" : "") +
            (item.mapsUrl ? '<a class="btn btn--soft btn--sm" href="' + Utils.escapeHtml(item.mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + icon("map") + "Mapa</a>" : "") +
            "</div></div></div>" +
            '<div class="modal__footer"><button type="button" class="btn btn--primary" data-action="close-modal">Concluir</button>' +
            '<button type="button" class="btn btn--danger" data-prospect-remove="' + Utils.escapeHtml(id) + '">' + icon("trash") + "Remover da prospecção</button></div>";
        openModal(content);
    }

    /* ---------- dashboard (§45, §46) ---------- */

    function renderDashboard() {
        const metrics = Store.getMetrics();
        const prospects = Store.listProspects();
        const withoutSite = prospects.filter(function (item) { return item.status !== STATUS.HAS_WEBSITE; }).length;
        const contacted = prospects.filter(function (item) { return ["Contato realizado", "Respondeu", "Interessado", "Orçamento enviado"].indexOf(item.leadStatus) !== -1; }).length;
        const clients = prospects.filter(function (item) { return item.leadStatus === "Cliente"; }).length;
        const interested = prospects.filter(function (item) { return item.leadStatus === "Interessado"; }).length;

        const cards = [
            { label: "Pesquisas realizadas", value: metrics.searches, icon: "search", tone: "neutral" },
            { label: "Empresas encontradas", value: metrics.businessesFound, icon: "building", tone: "info" },
            { label: "Empresas sem site", value: metrics.withoutWebsite, icon: "ban", tone: "danger" },
            { label: "Empresas com site", value: metrics.withWebsite, icon: "check", tone: "success" },
            { label: "Empresas salvas", value: prospects.length, icon: "star", tone: "accent" },
            { label: "Contatos realizados", value: contacted, icon: "phone", tone: "info" },
            { label: "Interessados", value: interested, icon: "heart", tone: "success" },
            { label: "Clientes", value: clients, icon: "trophy", tone: "success" }
        ];

        if (els.dashboardGrid) {
            setHtml(els.dashboardGrid, cards.map(function (card) {
                return '<div class="stat stat--' + card.tone + '">' +
                    '<span class="stat__icon" aria-hidden="true">' + icon(card.icon) + "</span>" +
                    '<span class="stat__value">' + Utils.formatNumber(card.value) + "</span>" +
                    '<span class="stat__label">' + Utils.escapeHtml(card.label) + "</span></div>";
            }).join(""));
        }

        renderPipeline(prospects);
        renderHistory();
    }

    function renderPipeline(prospects) {
        const target = document.getElementById("pipeline");
        if (!target) return;
        const counts = LEAD_STATUSES.map(function (status) {
            return { status: status, count: prospects.filter(function (item) { return item.leadStatus === status; }).length };
        });
        const max = Math.max.apply(null, counts.map(function (entry) { return entry.count; }).concat([1]));
        setHtml(target, counts.map(function (entry) {
            const percent = Math.round((entry.count / max) * 100);
            return '<div class="pipeline__row"><span class="pipeline__label">' + Utils.escapeHtml(entry.status) + "</span>" +
                '<span class="pipeline__bar"><span class="pipeline__fill pipeline__fill--' + (LEAD_STATUS_TONE[entry.status] || "neutral") + '" style="width:' + percent + '%"></span></span>' +
                '<span class="pipeline__value">' + entry.count + "</span></div>";
        }).join(""));
    }

    function renderHistory() {
        const history = Store.listHistory();
        if (els.historyCount) els.historyCount.textContent = history.length;
        const targets = [els.historyList, document.getElementById("historyListDashboard")].filter(Boolean);
        if (!targets.length) return;

        let markup;
        if (!history.length) {
            markup = '<div class="empty empty--compact">' + icon("history") + "<p>Nenhuma pesquisa registrada ainda.</p></div>";
        } else {
            markup = '<ul class="history-list">' + history.map(function (item) {
            const summary = item.summary || {};
            return '<li class="history-item">' +
                '<div class="history-item__info"><strong>' + Utils.escapeHtml(item.label) + "</strong>" +
                '<span class="muted small">' + Utils.escapeHtml(Utils.formatDate(item.searchedAt)) + " · " + (summary.total || 0) + " empresas · " + (summary.withoutWebsite || 0) + " sem site</span></div>" +
                '<button type="button" class="btn btn--ghost btn--sm" data-history-repeat="' + Utils.escapeHtml(item.id) + '">' + icon("refresh") + "Repetir</button>" +
                '<button type="button" class="icon-btn" data-history-remove="' + Utils.escapeHtml(item.id) + '" aria-label="Remover pesquisa da lista">' + icon("trash") + "</button>" +
                "</li>";
        }).join("") + "</ul>";
        }

        targets.forEach(function (target) { setHtml(target, markup); });
    }

    /* ---------- exportações (§29, §56) ---------- */

    function buildExportRows(scope) {
        if (scope === "prospects") {
            return Store.listProspects().map(function (item) {
                return Object.assign({}, item, {
                    status: item.statusLabel || item.status,
                    score: item.score,
                    searchedAt: Utils.formatDateTime(item.searchedAt)
                });
            });
        }
        const state = Search.getState();
        return state.filtered.map(function (item) {
            const prospect = Store.findProspect(item);
            return Object.assign({}, item, {
                instagram: (item.socials && item.socials.instagram) || "",
                facebook: (item.socials && item.socials.facebook) || "",
                status: item.statusLabel || item.status,
                leadStatus: prospect ? prospect.leadStatus : "",
                notes: prospect ? prospect.notes : "",
                searchedAt: Utils.formatDateTime(item.searchedAt)
            });
        });
    }

    function renderExports() {
        const target = els.exportsPanel;
        if (!target) return;
        const state = Search.getState();
        const current = state.filtered.length;
        const saved = Store.listProspects().length;
        const rows = buildExportRows("prospects").slice(0, 8);
        const preview = rows.length
            ? '<div class="table-wrap"><table class="data-table data-table--compact"><caption class="sr-only">Pré-visualização das colunas do arquivo CSV</caption><thead><tr>' +
            CSV_COLUMNS.slice(0, 7).map(function (col) { return '<th scope="col">' + Utils.escapeHtml(col.header) + "</th>"; }).join("") +
            "</tr></thead><tbody>" + rows.map(function (row) {
                return "<tr>" + CSV_COLUMNS.slice(0, 7).map(function (col) {
                    return "<td>" + Utils.escapeHtml(row[col.key] == null ? "—" : String(row[col.key])) + "</td>";
                }).join("") + "</tr>";
            }).join("") + "</tbody></table></div>"
            : '<p class="muted">Nada para pré-visualizar ainda.</p>';

        setHtml(target,
            '<div class="card card--pad">' +
            '<h2 class="card__title">' + icon("download") + "Exportar resultados</h2>" +
            '<p class="muted">Arquivo CSV compatível com Excel e Google Sheets, com separador ponto e vírgula e acentuação preservada.</p>' +
            '<div class="export-grid">' +
            '<div class="export-option"><h3>Resultados da busca</h3><p class="muted">' + current + " empresas no filtro atual" + "</p>" +
            '<button type="button" class="btn btn--primary" data-export="results"' + (current ? "" : " disabled") + ">" + icon("download") + "Exportar CSV</button></div>" +
            '<div class="export-option"><h3>Prospecções salvas</h3><p class="muted">' + saved + " empresas salvas, com status e observações</p>" +
            '<button type="button" class="btn btn--primary" data-export="prospects"' + (saved ? "" : " disabled") + ">" + icon("download") + "Exportar CSV</button></div>" +
            "</div></div>" +
            '<div class="card card--pad"><h3 class="card__title">Pré-visualização</h3>' + preview + "</div>" +
            '<div class="card card--pad"><h3 class="card__title">Colunas incluídas</h3>' +
            '<p class="muted">' + CSV_COLUMNS.map(function (col) { return Utils.escapeHtml(col.header); }).join(", ") + "</p></div>");
    }

    function exportCSV(scope) {
        const rows = buildExportRows(scope);
        if (!rows.length) {
            toast("Não há dados para exportar.", "info");
            return;
        }
        const label = scope === "prospects" ? "prospeccoes" : "resultados";
        const stamp = new Date().toISOString().slice(0, 10);
        const ok = Utils.downloadCSV("prospeccao-web-" + label + "-" + stamp + ".csv", rows);
        toast(ok ? "Arquivo CSV gerado (" + rows.length + " empresas)." : "Não foi possível gerar o arquivo.", ok ? "success" : "error");
    }

    /* ---------- configurações (§41) ---------- */

    function renderSettings() {
        const form = els.settingsForm;
        if (!form) return;
        const domainsForm = document.getElementById("domainsForm");
        const find = function (name) {
            return form.elements[name] || (domainsForm && domainsForm.elements[name]) || document.getElementById(name);
        };
        const set = function (name, value) {
            const field = find(name);
            if (field) field.value = value == null ? "" : value;
        };
        const check = function (name, value) {
            const field = find(name);
            if (field) field.checked = !!value;
        };
        set("cfgProvider", CONFIG.provider);
        set("cfgProxyUrl", CONFIG.proxyUrl);
        set("cfgProxyToken", CONFIG.proxyToken);
        set("cfgTimeout", CONFIG.requestTimeoutMs / 1000);
        set("cfgCacheTtl", Math.round(CONFIG.cacheTtlMs / 60000));
        set("cfgWhatsapp", CONFIG.whatsappMessage);
        set("cfgSocialDomains", SOCIAL_DOMAINS.join("\n"));
        set("cfgDirectoryDomains", DIRECTORY_DOMAINS.join("\n"));
        set("cfgMaxResults", CONFIG.maxResultsPerSearch);
        set("cfgRadius", CONFIG.defaultRadiusKm);
        check("cfgAnalyze", CONFIG.analyzeWebsites);
        check("cfgCache", CONFIG.cacheEnabled);
        check("cfgMock", CONFIG.enableMockData);

        const providerSelect = form.elements.cfgProvider;
        if (providerSelect) {
            API.listProviders().forEach(function (id) {
                const option = document.createElement("option");
                option.value = id;
                option.textContent = API.SearchProvider[id].label + (API.SearchProvider[id].requiresProxy ? " (requer proxy)" : "");
                providerSelect.appendChild(option);
            });
            providerSelect.value = CONFIG.provider;
        }
        const snapshot = Store.getSnapshot();
        const usage = document.getElementById("storageUsage");
        if (usage) {
            usage.textContent = (snapshot.estimatedBytes / 1024).toFixed(1) + " KB · " + snapshot.prospects.length + " prospecções · " + snapshot.history.length + " pesquisas · " +
                (snapshot.storageAvailable ? "localStorage disponível" : "armazenamento apenas em memória");
        }
    }

    function buildBusinessText(business) {
        return [
            business.name,
            business.category,
            business.address,
            business.phone ? "Tel: " + Utils.formatPhone(business.phone) : "",
            business.website ? "Site: " + business.website : "Site: não identificado",
            business.socials && business.socials.instagram ? "Instagram: " + business.socials.instagram : "",
            business.socials && business.socials.facebook ? "Facebook: " + business.socials.facebook : "",
            business.mapsUrl ? "Maps: " + business.mapsUrl : "",
            "Avaliação: " + Utils.formatRating(business.rating) + " (" + Utils.formatNumber(business.reviews || 0) + " avaliações)",
            "Status: " + (business.statusLabel || business.status),
            "Motivo: " + business.reason
        ].filter(function (line) { return line; }).join("\n");
    }

    function exportJSON() {        const snapshot = Store.getSnapshot();
        const payload = {
            app: CONFIG.appName,
            version: CONFIG.version,
            exportedAt: new Date().toISOString(),
            prospects: snapshot.prospects,
            history: snapshot.history,
            metrics: snapshot.metrics
        };
        const ok = Utils.downloadFile("prospeccao-web-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
        toast(ok ? "Backup JSON gerado." : "Não foi possível gerar o backup.", ok ? "success" : "error");
    }

    function importJSON(file, onDone) {
        const reader = new FileReader();
        reader.onload = function () {
            const parsed = Utils.safeJsonParse(reader.result, null);
            if (!parsed || !Array.isArray(parsed.prospects)) {
                toast("Arquivo inválido. Use um backup gerado por este sistema.", "error");
                return;
            }
            const current = Store.listProspects();
            const merged = parsed.prospects.concat(current.filter(function (item) {
                return !parsed.prospects.some(function (other) { return other.id === item.id; });
            }));
            merged.forEach(function (item) { item.id = item.id || Utils.uid("pr"); });
            if (!StorageAdapter.set(StorageAdapter.KEYS.prospects, merged)) {
                toast("Não foi possível gravar as prospecções importadas.", "error");
                return;
            }
            toast(merged.length + " prospecções importadas.", "success");
            if (onDone) onDone();
        };
        reader.onerror = function () { toast("Não foi possível ler o arquivo.", "error"); };
        reader.readAsText(file);
    }

    return {
        els: els,
        icon: icon,
        cacheElements: cacheElements,
        setHtml: setHtml,
        toast: toast,
        announce: announce,
        showView: showView,
        openSidebar: openSidebar,
        closeSidebar: closeSidebar,
        fillDatalist: fillDatalist,
        renderCategoryPicker: renderCategoryPicker,
        selectCategory: selectCategory,
        updateLocationSuggestions: updateLocationSuggestions,
        renderStats: renderStats,
        renderTabs: renderTabs,
        renderCard: renderCard,
        renderResults: renderResults,
        renderPagination: renderPagination,
        renderLoading: renderLoading,
        setLoadingProgress: setLoadingProgress,
        renderError: renderError,
        renderDetails: renderDetails,
        openModal: openModal,
        closeModal: closeModal,
        renderProspects: renderProspects,
        openProspectEditor: openProspectEditor,
        renderDashboard: renderDashboard,
        renderHistory: renderHistory,
        renderExports: renderExports,
        exportCSV: exportCSV,
        buildExportRows: buildExportRows,
        buildBusinessText: buildBusinessText,
        renderSettings: renderSettings,
        exportJSON: exportJSON,
        importJSON: importJSON,
        syncFilterInputs: syncFilterInputs,
        statusBadge: statusBadge
    };
})();

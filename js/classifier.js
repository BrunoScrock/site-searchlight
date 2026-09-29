/* Prospecção Web — Análise de URL e classificação da presença digital.
   Princípio: nunca afirmar "sem site" sem evidência. Quando a verificação
   não é possível (CORS, timeout, bloqueio), o resultado é VERIFY. */

const Classifier = (function () {
    "use strict";

    const SOCIAL_LIST = () => (Array.isArray(SOCIAL_DOMAINS) ? SOCIAL_DOMAINS : []);
    const DIRECTORY_LIST = () => (Array.isArray(DIRECTORY_DOMAINS) ? DIRECTORY_DOMAINS : []);

    const PARKED_PATTERNS = [
        /domain (name )?for sale/i,
        /buy this domain/i,
        /\bparked (free )?(domain|page)/i,
        /under construction/i,
        /em constru(ç|c)(ã|a)o/i,
        /em breve/i,
        /coming soon/i,
        /page not found/i,
        /p(á|a)gina n(ã|a)o encontrada/i,
        /error 404/i,
        /this website is for sale/i,
        /site indispon(í|i)vel/i,
        /account suspended/i
    ];

    const PLATFORM_BY_DOMAIN = {
        "instagram.com": "instagram",
        "facebook.com": "facebook",
        "fb.com": "facebook",
        "fb.me": "facebook",
        "tiktok.com": "tiktok",
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "linkedin.com": "linkedin",
        "x.com": "twitter",
        "twitter.com": "twitter",
        "pinterest.com": "pinterest",
        "threads.net": "threads",
        "threads.com": "threads",
        "t.me": "telegram",
        "wa.me": "whatsapp",
        "whatsapp.com": "whatsapp",
        "vimeo.com": "vimeo",
        "flickr.com": "flickr",
        "tumblr.com": "tumblr"
    };

    /* ---------- detecção de domínio (§16, §17, §50) ---------- */

    function isSocialDomain(url) {
        const domain = Utils.normalizeDomain(url);
        if (!domain) return false;
        return SOCIAL_LIST().some(function (item) {
            return Utils.isSubDomainOf(domain, String(item).toLowerCase());
        });
    }

    function isDirectoryDomain(url) {
        const domain = Utils.normalizeDomain(url);
        if (!domain) return false;
        return DIRECTORY_LIST().some(function (item) {
            return Utils.isSubDomainOf(domain, String(item).toLowerCase());
        });
    }

    function getSocialPlatform(url) {
        const domain = Utils.normalizeDomain(url);
        if (!domain) return "";
        const list = SOCIAL_LIST();
        for (let i = 0; i < list.length; i += 1) {
            const item = String(list[i]).toLowerCase();
            if (Utils.isSubDomainOf(domain, item)) {
                return PLATFORM_BY_DOMAIN[item] || item.split(".")[0];
            }
        }
        return "";
    }

    function classifyDomainType(url) {
        const normalized = Utils.normalizeUrl(url);
        if (!normalized) return "invalid";
        if (isSocialDomain(normalized)) return "social";
        if (isDirectoryDomain(normalized)) return "directory";
        return "own";
    }

    /* ---------- coleta de redes sociais ---------- */

    function toSocialUrl(platform, value) {
        const raw = Utils.collapseSpaces(value);
        if (!raw) return "";
        if (/^https?:\/\//i.test(raw)) return Utils.normalizeUrl(raw);
        const handle = raw.replace(/^@/, "").split(/[/?#]/)[0];
        if (!handle) return "";
        const bases = {
            instagram: "https://www.instagram.com/",
            facebook: "https://www.facebook.com/",
            tiktok: "https://www.tiktok.com/@",
            youtube: "https://www.youtube.com/",
            linkedin: "https://www.linkedin.com/company/",
            twitter: "https://x.com/",
            threads: "https://www.threads.net/@",
            pinterest: "https://www.pinterest.com/",
            whatsapp: "https://wa.me/",
            telegram: "https://t.me/"
        };
        const base = bases[platform];
        if (!base) return "";
        return Utils.normalizeUrl(base + handle);
    }

    function extractSocialLinks(business) {
        const found = { instagram: "", facebook: "", tiktok: "", youtube: "", linkedin: "", twitter: "", other: [] };
        const candidates = [];

        function push(value) {
            if (!value) return;
            if (Array.isArray(value)) {
                value.forEach(push);
                return;
            }
            if (typeof value === "object") return;
            candidates.push(value);
        }

        push(business.instagram);
        push(business.facebook);
        push(business.tiktok);
        push(business.youtube);
        push(business.linkedin);
        push(business.twitter);
        push(business.whatsapp);
        push(business.socials);
        push(business.links);
        push(business.website);

        candidates.forEach(function (candidate) {
            const raw = Utils.collapseSpaces(candidate);
            if (!raw) return;
            const url = Utils.normalizeUrl(raw);
            if (url && isSocialDomain(url)) {
                const platform = getSocialPlatform(url);
                if (platform && found[platform] === undefined) {
                    found.other.push(url);
                } else if (platform && !found[platform]) {
                    found[platform] = url;
                } else {
                    found.other.push(url);
                }
                return;
            }
            if (/^@?[\w.]{2,}$/.test(raw) && !url) {
                const guess = toSocialUrl("instagram", raw);
                if (guess && !found.instagram) found.instagram = guess;
            }
        });

        return found;
    }

    function countSocials(socials) {
        let total = 0;
        Object.keys(socials).forEach(function (key) {
            if (key === "other") {
                total += (socials.other || []).length;
            } else if (socials[key]) {
                total += 1;
            }
        });
        return total;
    }

    /* ---------- análise de site (§14, §18, §52, §53) ---------- */

    function resolveAgainstProxy(url) {
        if (!CONFIG.proxyUrl) return "";
        return CONFIG.proxyUrl.replace(/\/$/, "") + "/analyze?url=" + encodeURIComponent(url);
    }

    async function fetchPage(url) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(function () { controller.abort(); }, CONFIG.requestTimeoutMs) : null;
        try {
            const response = await fetch(url, {
                method: "GET",
                mode: "cors",
                credentials: "omit",
                redirect: "follow",
                referrerPolicy: "no-referrer",
                headers: { Accept: "text/html,application/xhtml+xml" },
                signal: controller ? controller.signal : undefined
            });
            const contentType = response.headers && response.headers.get ? response.headers.get("content-type") || "" : "";
            if (!response.ok) {
                return { ok: false, status: response.status, error: "http_" + response.status, contentType: contentType };
            }
            const text = contentType.indexOf("json") === -1 ? await response.text() : "";
            return { ok: true, status: response.status, finalUrl: response.url || url, redirected: !!response.redirected, text: text.slice(0, 400000), contentType: contentType };
        } catch (error) {
            const name = error && error.name ? error.name : "Error";
            if (name === "AbortError") return { ok: false, error: "timeout", status: 0 };
            if (name === "TypeError") return { ok: false, error: "cors_or_network", status: 0 };
            return { ok: false, error: "fetch_failed", status: 0 };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    function extractMetaRefresh(doc, baseUrl) {
        const metas = doc.querySelectorAll("meta");
        for (let i = 0; i < metas.length; i += 1) {
            const equiv = (metas[i].getAttribute("http-equiv") || "").toLowerCase();
            if (equiv === "refresh") {
                const content = metas[i].getAttribute("content") || "";
                const match = /url\s*=\s*['"]?([^'";]+)/i.exec(content);
                if (match) {
                    try {
                        return new URL(match[1].trim(), baseUrl).toString();
                    } catch (error) {
                        return match[1].trim();
                    }
                }
            }
        }
        return "";
    }

    function extractScriptRedirect(doc) {
        const scripts = doc.querySelectorAll("script");
        const patterns = [
            /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i,
            /location\.replace\(\s*['"]([^'"]+)['"]/i,
            /window\.location\.assign\(\s*['"]([^'"]+)['"]/i
        ];
        for (let i = 0; i < scripts.length; i += 1) {
            const text = scripts[i].textContent || "";
            for (let p = 0; p < patterns.length; p += 1) {
                const match = patterns[p].exec(text);
                if (match && /^https?:\/\//i.test(match[1])) return match[1];
            }
        }
        return "";
    }

    function parsePage(html, baseUrl) {
        const result = { title: "", description: "", canonical: "", metaRefresh: "", scriptRedirect: "", socials: [], text: "" };
        if (!html) return result;
        let doc;
        try {
            doc = new DOMParser().parseFromString(html, "text/html");
        } catch (error) {
            return result;
        }
        const titleEl = doc.querySelector("title");
        result.title = titleEl ? Utils.collapseSpaces(titleEl.textContent) : "";
        const descEl = doc.querySelector('meta[name="description" i], meta[property="og:description" i]');
        result.description = descEl ? Utils.collapseSpaces(descEl.getAttribute("content") || "") : "";
        const canonicalEl = doc.querySelector('link[rel="canonical" i]');
        if (canonicalEl) result.canonical = canonicalEl.getAttribute("href") || "";
        result.metaRefresh = extractMetaRefresh(doc, baseUrl);
        result.scriptRedirect = extractScriptRedirect(doc);

        const links = doc.querySelectorAll("a[href]");
        for (let i = 0; i < links.length && result.socials.length < 12; i += 1) {
            const href = links[i].getAttribute("href") || "";
            if (!/^https?:|^\/\//i.test(href)) continue;
            const absolute = href.indexOf("//") === 0 ? "https:" + href : href;
            if (isSocialDomain(absolute)) {
                const clean = Utils.normalizeUrl(absolute);
                if (clean && result.socials.indexOf(clean) === -1) result.socials.push(clean);
            }
        }
        const body = doc.body;
        result.text = body ? Utils.collapseSpaces(body.textContent).slice(0, 6000) : "";
        return result;
    }

    function detectParked(page) {
        const haystack = ((page && page.title) || "") + " " + ((page && page.description) || "") + " " + ((page && page.text) || "").slice(0, 800);
        for (let i = 0; i < PARKED_PATTERNS.length; i += 1) {
            if (PARKED_PATTERNS[i].test(haystack)) return true;
        }
        return false;
    }

    function resolveRedirectTarget(analysis) {
        if (!analysis) return "";
        if (analysis.redirected && analysis.finalUrl) {
            const from = Utils.normalizeDomain(analysis.url);
            const to = Utils.normalizeDomain(analysis.finalUrl);
            if (from && to && from !== to) return { target: analysis.finalUrl, type: "http" };
        }
        const page = analysis.page || {};
        const base = analysis.finalUrl || analysis.url;
        if (page.metaRefresh) {
            const from = Utils.normalizeDomain(base);
            const to = Utils.normalizeDomain(page.metaRefresh);
            if (to && to !== from) return { target: page.metaRefresh, type: "meta_refresh" };
        }
        if (page.scriptRedirect) {
            const from = Utils.normalizeDomain(base);
            const to = Utils.normalizeDomain(page.scriptRedirect);
            if (to && to !== from) return { target: page.scriptRedirect, type: "javascript" };
        }
        return null;
    }

    async function analyzeWebsite(url, business) {
        const input = Utils.collapseSpaces(url);
        const domain = Utils.normalizeDomain(input);
        const analysis = {
            url: input,
            domain: domain,
            type: classifyDomainType(input),
            https: /^https:\/\//i.test(input),
            reachable: false,
            statusCode: 0,
            redirected: false,
            finalUrl: "",
            redirect: null,
            page: null,
            parked: false,
            error: "",
            reason: ""
        };

        if (!input || analysis.type === "invalid") {
            analysis.error = "invalid_url";
            analysis.reason = "URL ausente ou inválida nos dados do provedor.";
            return analysis;
        }
        if (analysis.type === "social") {
            analysis.reason = "O link informado pertence a uma rede social (" + domain + ").";
            return analysis;
        }
        if (analysis.type === "directory") {
            analysis.reason = "O link informado pertence a um diretório ou marketplace (" + domain + ").";
            return analysis;
        }
        if (!CONFIG.analyzeWebsites) {
            analysis.error = "analysis_disabled";
            analysis.reason = "Análise automática desativada nas configurações.";
            return analysis;
        }

        const simulation = business && business.mockSimulation;
        if (simulation) {
            analysis.source = "mock";
            if (!simulation.reachable) {
                analysis.error = simulation.error || "cors_or_network";
                analysis.statusCode = simulation.statusCode || 0;
                analysis.reason = simulation.reason || "Não foi possível carregar a página a partir do navegador.";
                return analysis;
            }
            analysis.reachable = true;
            analysis.statusCode = simulation.statusCode || 200;
            analysis.finalUrl = simulation.finalUrl || analysis.url;
            analysis.redirected = !!simulation.redirected;
            analysis.page = simulation.page || null;
            analysis.parked = !!simulation.parked || detectParked(analysis.page);
            analysis.redirect = resolveRedirectTarget(analysis);
            analysis.reason = analysis.parked
                ? "A página aparenta estar vazia ou em manutenção."
                : "Página carregada com sucesso.";
            return analysis;
        }

        let pageResult = await fetchPage(input);
        let source = "browser";

        if (!pageResult.ok && CONFIG.proxyUrl) {
            const proxied = await fetchPage(resolveAgainstProxy(input));
            if (proxied.ok) {
                pageResult = proxied;
                source = "proxy";
            }
        }

        if (!pageResult.ok) {
            analysis.error = pageResult.error || "unavailable";
            analysis.statusCode = pageResult.status || 0;
            if (analysis.error === "timeout") {
                analysis.reason = "A página não respondeu dentro de " + Math.round(CONFIG.requestTimeoutMs / 1000) + "s.";
            } else if (analysis.error === "cors_or_network") {
                analysis.reason = "O navegador bloqueou a leitura direta (CORS) ou o site está indisponível. A verificação precisa ser feita manualmente.";
            } else if (analysis.error === "http_404") {
                analysis.reason = "A URL informada retornou erro 404 e não pôde ser confirmada.";
            } else {
                analysis.reason = "Não foi possível carregar a página a partir do navegador.";
            }
            return analysis;
        }

        analysis.reachable = true;
        analysis.statusCode = pageResult.status || 200;
        analysis.finalUrl = pageResult.finalUrl || input;
        analysis.redirected = !!pageResult.redirected;
        analysis.page = parsePage(pageResult.text, analysis.finalUrl);
        analysis.parked = detectParked(analysis.page);
        analysis.source = source;
        analysis.redirect = resolveRedirectTarget(analysis);
        analysis.reason = "Página carregada com sucesso.";
        return analysis;
    }

    /* ---------- veredito sobre o domínio (§50, §51) ---------- */

    function isLikelyOwnWebsite(url, business, analysis) {
        const domain = Utils.normalizeDomain(url);
        if (!domain) return { likely: null, score: 0, reasons: ["URL inválida."] };
        if (isSocialDomain(url)) return { likely: false, score: 0, reasons: ["O domínio pertence a uma rede social."] };
        if (isDirectoryDomain(url)) return { likely: false, score: 0, reasons: ["O domínio pertence a um diretório, marketplace ou Hospedagem de sites."] };
        if (/^(www\.)?(bit\.ly|tinyurl\.com|is\.gd|t\.me|goo\.gl|wa\.me|lnkd\.in)\b/.test(domain)) {
            return { likely: false, score: 0, reasons: ["É um link encurtado/redirecionador, não um domínio próprio."] };
        }

        const reasons = [];
        let score = 0;

        const domainMatch = Utils.nameDomainMatch((business && business.name) || "", url);
        if (domainMatch >= 0.99) {
            score += 45;
            reasons.push("O domínio contém o nome da empresa.");
        } else if (domainMatch >= 0.8) {
            score += 40;
            reasons.push("O domínio é uma variação do nome da empresa (ex.: nome de marca, prefixo ou sufixo).");
        } else if (domainMatch > 0) {
            score += 25;
            reasons.push("O domínio tem relação parcial com o nome da empresa.");
        } else {
            reasons.push("O domínio não contém o nome da empresa (pode ser um nome de marca diferente).");
        }

        const page = analysis && analysis.page;
        if (page) {
            const haystack = Utils.stripAccents((page.title || "") + " " + (page.text || "").slice(0, 3000)).toLowerCase();
            const nameTokens = Utils.nameTokens((business && business.name) || "");
            const matchedTokens = nameTokens.filter(function (token) { return haystack.indexOf(token) !== -1; });
            if (nameTokens.length && matchedTokens.length === nameTokens.length) {
                score += 25;
                reasons.push("O nome da empresa aparece completo na página.");
            } else if (matchedTokens.length) {
                score += 12;
                reasons.push("Parte do nome da empresa aparece na página.");
            }

            const phone = Utils.phoneDigits((business && business.phone) || "");
            if (phone && phone.length >= 8) {
                const pageDigits = Utils.phoneDigits(page.text || "").replace(/\D/g, "");
                const variants = [phone, phone.slice(-8), phone.slice(-10), phone.slice(-11)];
                const found = variants.some(function (variant) {
                    return variant.length >= 8 && pageDigits.indexOf(variant) !== -1;
                });
                if (found) {
                    score += 20;
                    reasons.push("O telefone da empresa aparece na página.");
                }
            }

            const addressTokens = Utils.addressTokens((business && business.address) || "");
            if (addressTokens.length >= 2) {
                const addressHits = addressTokens.filter(function (token) { return haystack.indexOf(token) !== -1; });
                if (addressHits.length / addressTokens.length >= 0.5) {
                    score += 15;
                    reasons.push("O endereço da empresa aparece na página.");
                }
            }
        } else {
            reasons.push("Sem acesso ao conteúdo da página, a correspondência não pôde ser confirmada.");
        }

        let likely;
        if (score >= 60) likely = true;
        else if (score >= 35) likely = null;
        else likely = false;

        return { likely: likely, score: Math.min(100, score), reasons: reasons, hasPageData: !!page };
    }

    /* ---------- classificação (§19, §20, §21) ---------- */

    function describeSocials(socials) {
        const labels = [];
        const map = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", twitter: "X/Twitter", threads: "Threads", pinterest: "Pinterest", whatsapp: "WhatsApp", telegram: "Telegram" };
        Object.keys(map).forEach(function (key) {
            if (socials[key]) labels.push(map[key]);
        });
        return labels;
    }

    function classifyBusiness(business) {
        const result = business;
        const analysis = result.analysis || null;
        const website = Utils.normalizeUrl(result.website || result.url || "");
        const socials = extractSocialLinks(result);
        const socialNames = describeSocials(socials);
        const hasMaps = !!Utils.normalizeUrl(result.mapsUrl || "");
        const socialCount = countSocials(socials);

        result.socials = socials;
        result.hasSocial = socialCount > 0;

        let status = STATUS.NO_WEBSITE;
        let reason = "";

        if (!website) {
            if (socialCount > 0) {
                status = STATUS.NO_WEBSITE_SOCIAL;
                reason = "Nenhum site próprio nos dados retornados. Presença encontrada em: " + (socialNames.join(", ") || "rede social") + ".";
            } else {
                status = STATUS.NO_WEBSITE;
                reason = "Nenhum site próprio, rede social ou diretório foi informado pelo provedor. " +
                    (hasMaps ? "A empresa aparece listada no Google Maps, mas nenhum site ou rede social foi retornado." : "");
            }
        } else if (isSocialDomain(website)) {
            status = STATUS.NO_WEBSITE_SOCIAL;
            reason = socialCount > 0
                ? "O único link informado é de rede social (" + Utils.normalizeDomain(website) + "), portanto não é site próprio. Há presença em: " + socialNames.join(", ") + "."
                : "O único link informado é de rede social (" + Utils.normalizeDomain(website) + "), portanto não é site próprio.";
        } else if (isDirectoryDomain(website)) {
            if (socialCount > 0) {
                status = STATUS.NO_WEBSITE_SOCIAL;
                reason = "O link informado pertence a um diretório/plataforma (" + Utils.normalizeDomain(website) + "), não a um site próprio. Há presença em: " + (socialNames.join(", ") || "rede social") + ".";
            } else {
                status = STATUS.DIRECTORY_ONLY;
                reason = "A única presença digital informada é um diretório ou plataforma (" + Utils.normalizeDomain(website) + "), que não equivale a site próprio.";
            }
        } else if (!analysis || analysis.type === "invalid") {
            status = STATUS.VERIFY;
            reason = "Há uma URL informada, mas ela não pôde ser lida para confirmação.";
        } else if (analysis.redirect) {
            const targetDomain = Utils.normalizeDomain(analysis.redirect.target);
            if (isSocialDomain(analysis.redirect.target)) {
                status = STATUS.REDIRECT_SOCIAL;
                reason = "O domínio " + analysis.domain + " redireciona (" + redirectTypeLabel(analysis.redirect.type) + ") para a rede social " + targetDomain + ".";
            } else if (isDirectoryDomain(analysis.redirect.target)) {
                status = STATUS.DIRECTORY_ONLY;
                reason = "O domínio " + analysis.domain + " redireciona (" + redirectTypeLabel(analysis.redirect.type) + ") para o diretório " + targetDomain + ".";
            } else {
                const verdict = isLikelyOwnWebsite(analysis.redirect.target, result, analysis);
                if (verdict.likely === true) {
                    status = STATUS.HAS_WEBSITE;
                    reason = "O domínio " + analysis.domain + " redireciona para " + targetDomain + ", que parece ser o site oficial.";
                } else if (verdict.likely === null) {
                    status = STATUS.VERIFY;
                    reason = "O domínio " + analysis.domain + " redireciona para " + targetDomain + ". Não foi possível confirmar se o destino é o site oficial.";
                } else {
                    status = STATUS.VERIFY;
                    reason = "O domínio " + analysis.domain + " redireciona para " + targetDomain + ", cuja titularidade não pôde ser confirmada.";
                }
            }
        } else if (!analysis.reachable) {
            status = STATUS.VERIFY;
            reason = "Existe a URL " + analysis.domain + ", mas a verificação automática não foi concluída: " + (analysis.reason || "motivo desconhecido") + " Verifique manualmente antes de concluir que a empresa não tem site.";
        } else if (analysis.parked) {
            status = STATUS.VERIFY;
            reason = "A página em " + analysis.domain + " aparenta estar vazia, em manutenção ou à venda. Não é possível afirmar que exista um site próprio em funcionamento.";
        } else {
            const verdict = isLikelyOwnWebsite(website, result, analysis);
            result.websiteVerdict = verdict;
            if (verdict.likely === true) {
                status = STATUS.HAS_WEBSITE;
                reason = "A página em " + analysis.domain + " corresponde à empresa (" + verdict.reasons.slice(0, 2).join(" ") + ").";
            } else if (verdict.likely === null) {
                status = STATUS.VERIFY;
                reason = "A URL " + analysis.domain + " existe, mas a correspondência com a empresa não foi confirmada com segurança. Verifique manualmente.";
            } else {
                status = STATUS.VERIFY;
                reason = "A URL " + analysis.domain + " não pôde ser associada com segurança à empresa. Pode ser uma página de terceiros.";
            }
        }

        result.status = status;
        result.statusLabel = STATUS_META[status].label;
        result.statusShort = STATUS_META[status].short;
        result.statusTone = STATUS_META[status].tone;
        result.reason = reason;
        result.opportunity = computeOpportunity(result);
        return result;
    }

    function redirectTypeLabel(type) {
        const map = { http: "redirecionamento HTTP", meta_refresh: "meta refresh", javascript: "redirecionamento JavaScript" };
        return map[type] || "redirecionamento";
    }

    /* Analisa e classifica uma lista, respeitando o limite de concorrência. */
    async function analyzeAndClassify(businesses, onProgress) {
        const list = businesses.slice(0, CONFIG.maxResultsPerSearch);
        const websites = list.filter(function (item) {
            const url = Utils.normalizeUrl(item.website || item.url || "");
            return url && classifyDomainType(url) === "own";
        });

        const uniqueDomains = {};
        websites.forEach(function (item) {
            const domain = Utils.normalizeDomain(item.website || item.url || "");
            if (domain && !uniqueDomains[domain]) uniqueDomains[domain] = domain;
        });

        const domains = Object.keys(uniqueDomains);
        const analyses = {};

        await Utils.mapWithConcurrency(domains, CONFIG.maxConcurrentAnalysis, async function (domain) {
            const sample = websites.find(function (item) {
                return Utils.normalizeDomain(item.website || item.url || "") === domain;
            });
            const analysis = await analyzeWebsite(Utils.normalizeUrl(sample.website || sample.url || ""), sample);
            analyses[domain] = analysis;
            if (onProgress) onProgress(domain, analysis);
        });

        list.forEach(function (item) {
            const url = Utils.normalizeUrl(item.website || item.url || "");
            if (url && classifyDomainType(url) === "own") {
                item.analysis = analyses[Utils.normalizeDomain(url)] || null;
            } else {
                item.analysis = url ? { url: url, type: classifyDomainType(url), domain: Utils.normalizeDomain(url), reachable: false, error: "skipped", reason: "Domínio de rede social ou diretório, sem necessidade de carregamento." } : null;
            }
            const socialsOnPage = item.analysis && item.analysis.page ? item.analysis.page.socials : [];
            if (socialsOnPage && socialsOnPage.length) {
                const merged = extractSocialLinks(item);
                socialsOnPage.forEach(function (link) {
                    const platform = getSocialPlatform(link);
                    if (platform && !merged[platform] && !merged.other.indexOf(link)) merged[platform] = link;
                    else if (!merged.other.indexOf(link)) merged.other.push(link);
                });
                item.socialsFromPage = socialsOnPage;
            }
            classifyBusiness(item);
        });

        return list;
    }

    /* ---------- perfil para prospecção (§22) ---------- */

    function computeOpportunity(business) {
        const weights = CONFIG.scoring || {};
        const factors = [];
        let score = 0;

        function add(points, label) {
            if (!points) return;
            score += points;
            factors.push({ points: points, label: label });
        }

        if (!CONFIG.scoring || CONFIG.scoring.enabled === false) {
            return { score: 0, level: "desativado", factors: factors, note: "Indicador desativado nas configurações." };
        }

        const status = business.status;
        if (status === STATUS.HAS_WEBSITE) add(weights.hasWebsite, "Site próprio identificado");
        if (status === STATUS.NO_WEBSITE) add(weights.noWebsite, "Nenhum site informado pelo provedor");
        if (status === STATUS.NO_WEBSITE_SOCIAL) add(weights.socialOnly, "Apenas redes sociais, sem site próprio");
        if (status === STATUS.REDIRECT_SOCIAL) add(weights.redirectSocial, "Domínio redireciona para rede social");
        if (status === STATUS.DIRECTORY_ONLY) add(weights.directoryOnly, "Presença apenas em diretório/plataforma");
        if (status === STATUS.VERIFY) add(weights.verify, "Verificação manual necessária");

        const socials = business.socials || extractSocialLinks(business);
        if (socials.instagram) add(weights.hasInstagram, "Instagram encontrado");
        if (socials.facebook) add(weights.hasFacebook, "Facebook encontrado");
        if (Utils.phoneDigits(business.phone)) add(weights.hasPhone, "Telefone disponível para contato");
        if (business.mapsUrl) add(weights.hasMaps, "Presença no Google Maps");

        const reviews = Number(business.reviews);
        const rating = Number(business.rating);
        if (isFinite(reviews) && reviews > 0) {
            const density = Math.min(weights.maxReviewsBonus, (reviews / 20) * (weights.reviewsPerStar || 0));
            add(Math.round(density), reviews + " avaliações agregadas pelo provedor");
        }
        if (isFinite(rating) && rating >= (weights.minRating || 4)) {
            add(weights.ratingBonus, "Avaliação " + Utils.formatRating(rating) + " no provedor");
        }

        const finalScore = Math.max(0, Math.min(100, Math.round(score)));
        let level = "Baixo";
        if (finalScore >= 70) level = "Alto";
        else if (finalScore >= 40) level = "Médio";

        return {
            score: finalScore,
            level: level,
            factors: factors.sort(function (a, b) { return Math.abs(b.points) - Math.abs(a.points); }),
            note: "Indicador técnico configurável, calculado apenas a partir dos sinais observados. Não é uma avaliação da qualidade da empresa."
        };
    }

    function summarize(results) {
        const summary = {
            total: results.length,
            HAS_WEBSITE: 0,
            NO_WEBSITE_SOCIAL: 0,
            NO_WEBSITE: 0,
            REDIRECT_SOCIAL: 0,
            DIRECTORY_ONLY: 0,
            VERIFY: 0,
            withoutWebsite: 0,
            withWebsite: 0,
            needsVerification: 0,
            withSocial: 0
        };
        results.forEach(function (item) {
            const status = item.status;
            if (summary[status] !== undefined) summary[status] += 1;
            if (status === STATUS.HAS_WEBSITE) summary.withWebsite += 1;
            else summary.withoutWebsite += 1;
            if (status === STATUS.VERIFY) summary.needsVerification += 1;
            if (status === STATUS.NO_WEBSITE_SOCIAL || status === STATUS.REDIRECT_SOCIAL) summary.withSocial += 1;
        });
        return summary;
    }

    return {
        isSocialDomain: isSocialDomain,
        isDirectoryDomain: isDirectoryDomain,
        classifyDomainType: classifyDomainType,
        getSocialPlatform: getSocialPlatform,
        extractSocialLinks: extractSocialLinks,
        countSocials: countSocials,
        analyzeWebsite: analyzeWebsite,
        isLikelyOwnWebsite: isLikelyOwnWebsite,
        classifyBusiness: classifyBusiness,
        analyzeAndClassify: analyzeAndClassify,
        computeOpportunity: computeOpportunity,
        summarize: summarize,
        describeSocials: describeSocials
    };
})();

/* Prospecção Web — Camada de acesso a provedores de dados.
   A aplicação nunca chama o Google (ou outro provedor) diretamente: ela usa
   SearchProvider. Trocar de provedor significa registrar outro adaptador. */

const API = (function () {
    "use strict";

    class ProviderError extends Error {
        constructor(message, code) {
            super(message);
            this.name = "ProviderError";
            this.code = code || "provider_error";
        }
    }

    class QuotaError extends ProviderError {
        constructor(message) {
            super(message || CONFIG.messages.quotaError, "quota_exceeded");
            this.name = "QuotaError";
        }
    }

    /* Resposta fetch com timeout e leitura de JSON, distinguindo os erros que
       valem a pena tentar outro endpoint (429/504) dos que não. */
    async function fetchJson(url, timeoutMs) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || CONFIG.requestTimeoutMs) : null;
        let response;
        try {
            response = await fetch(url, {
                method: "GET",
                mode: "cors",
                credentials: "omit",
                headers: { Accept: "application/json" },
                signal: controller ? controller.signal : undefined
            });
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new TimeoutError("O serviço do provedor demorou demais para responder.");
            }
            if (error instanceof ProviderError) throw error;
            const detail = error && error.message ? " (" + error.message + ")" : "";
            throw new NetworkError("Não foi possível contatar o serviço do provedor" + detail + ". Verifique sua conexão.");
        } finally {
            if (timer) clearTimeout(timer);
        }

        if (response.status === 429) {
            throw new ProviderError("O serviço do provedor está sobrecarregado no momento.", "rate_limited");
        }
        if (response.status === 504 || response.status === 503) {
            throw new ProviderError("O serviço do provedor excedeu o tempo de espera.", "rate_limited");
        }
        /* 403/406 quase sempre são o proxy da rede bloqueando o host, não a
           API recusando a consulta. */
        if (response.status === 403 || response.status === 406 || response.status === 451) {
            let host = "";
            try { host = new URL(url).hostname; } catch (error) { host = "o serviço"; }
            throw new BlockedError(
                "A rede ou o proxy da sua empresa bloqueou o acesso a " + host + " (HTTP " + response.status + ")",
                [host]
            );
        }
        if (!response.ok) {
            throw new ProviderError("O provedor respondeu com erro HTTP " + response.status + ".", "http_" + response.status);
        }

        try {
            return await response.json();
        } catch (error) {
            throw new ProviderError("Resposta inválida do provedor.", "invalid_response");
        }
    }

    class NetworkError extends ProviderError {
        constructor(message) {
            super(message || CONFIG.messages.apiError, "network_error");
            this.name = "NetworkError";
        }
    }

    class TimeoutError extends ProviderError {
        constructor(message) {
            super(message || "Tempo de resposta excedido.", "timeout");
            this.name = "TimeoutError";
        }
    }

    class NotConfiguredError extends ProviderError {
        constructor(message) {
            super(message, "not_configured");
            this.name = "NotConfiguredError";
        }
    }

    /* O proxy da rede corporativa ou o provedor de internet recusou a
       requisição. Não é culpa do usuário, e a mensagem precisa dizer isso. */
    class BlockedError extends ProviderError {
        constructor(message, blockedHosts) {
            super(message, "blocked_by_network");
            this.name = "BlockedError";
            this.blockedHosts = blockedHosts || [];
        }
    }

    /* ------------------------------------------------------------------ */
    /* Provedor MOCK — dados fictícios de demonstração (§7)                 */
    /* ------------------------------------------------------------------ */

    const MOCK_NAMES = {
        "mecanicas": ["Oficina", "Mecânica", "Auto Center", "Box", "Moto Mecânica", "Center Car", "Motors"],
        "eletricistas": ["Elétrica", "Instalações Elétricas", "Energia", "Volt", "Circuito", "Power"],
        "encanadores": ["Encanadora", "Hidráulica", "Água", "Sifão", "Duto", "Pipa"],
        "marceneiros": ["Marcenaria", "Madeira", "Carpintaria", "Planejados", "Móveis", "Nicho"],
        "serralheiros": ["Chaveiro", "Serralheria", "Fechaduras", "Ponto", "Segurança", "Chaves"],
        "vidracarias": ["Vidraçaria", "Vidro", "Cristal", "Espelho", "Box", "Vidrobox"],
        "estofarias": ["Estofaria", "Estofados", "Sofás", "Reupholstering", "Conforto", "Poltrona"],
        "instaladores": ["Instalações", "Installer", "Tec", "Montagem", "Setup", "Pro"],
        "pintores": ["Pintura", "Pintor", "Pinturas", "Cor", "Pintex", "De cor"],
        "empresas-de-limpeza": ["Limpeza", "Higiene", "Serviços Gerais", "Clean", "Zeladoria", "Bright"],
        "barbearias": ["Barbearia", "Barbeiro", "Studio Barber", "Navalha", "Classic", "Corte"],
        "saloes": ["Salão", "Studio Hair", "Cabelo", "Beleza", "Hair", "Espelho"],
        "manicure": ["Manicure", "Unhas", "Nail", "Duo de Unhas", "Beleza das Unhas", "Cutelab"],
        "estetica": ["Estética", "Clínica", "Beauty", "Spa", "Harmonia", "Aurora"],
        "sobrancelhas": ["Sobrancelhas", "Design", "Brow", "Studio Brow", "Perfeitas", "Mirada"],
        "cabeleireiros": ["Cabeleireiro", "Hair", "Cabelo", "Studio", "Salão", "Corte"],
        "fotógrafos": ["Fotografia", "Foto", "Studio", "Lens", "Enquadre", "Clara"],
        "personal-trainers": ["Personal", "Training", "Fit", "Studio", "Move", "Força"],
        "arquitetos": ["Arquitetura", "Arq", "Studio", "Projeto", "Ateliê", "Traço"],
        "designers": ["Design", "Studio", "Criativo", "Pixel", "Ideia", "Forma"],
        "contadores": ["Contabilidade", "Contábil", "Contador", "Conta", "Números", "Balanço"],
        "consultores": ["Consultoria", "Consultores", "Consultor", "Estratégia", "Mentoria", "Alcance"]
    };

    const MOCK_NEIGHBORHOODS = ["Centro", "Jardim América", "Batel", "Boqueirão", "Alto da Gloria", "Santa Felicidade", "Batel", "Hauer", "Boqueirao", "Cidade Industrial", "Vila Izidoria", "Pilar"];

    const MOCK_STREETS = ["Rua das Acácias", "Av. Sete de Setembro", "Rua XV de Novembro", "Rua São João", "Av. Paranaguá", "Rua Marechal Deodoro", "Rua Riachuelo", "Rua das Indústrias", "Rua Comendador Araújo", "Rua Visconde de Taunay"];

    const MOCK_PARKED_TITLES = ["Domain for sale", "Em breve", "Site em construção", "Coming soon"];

    function mockSeed(params) {
        return Utils.hashString([params.country, params.state, params.city, params.neighborhood, params.category].join("|"));
    }

    function seededRandom(seed) {
        let value = parseInt(Utils.hashString(seed), 36) || 1;
        return function next() {
            value = (value * 1103515245 + 12345) % 2147483648;
            return value / 2147483648;
        };
    }

    function pick(random, list) {
        return list[Math.floor(random() * list.length) % list.length];
    }

    function slugToken(value) {
        return Utils.slugify(value).replace(/-/g, "");
    }

    /* Centro aproximado de cada cidade, apenas para o mock calcular distâncias. */
    const MOCK_CENTERS = {
        "curitiba": [-25.4284, -49.2733], "sao paulo": [-23.5505, -46.6333], "rio de janeiro": [-22.9068, -43.1729],
        "belo horizonte": [-19.9167, -43.9345], "recife": [-8.0476, -34.8770], "porto alegre": [-30.0346, -51.2177],
        "salvador": [-12.9777, -38.5016], "fortaleza": [-3.7319, -38.5267], "brasilia": [-15.7975, -47.8919],
        "lisboa": [38.7223, -9.1393], "porto": [41.1579, -8.6291], "miami": [25.7617, -80.1918],
        "new york": [40.7128, -74.0060], "los angeles": [34.0522, -118.2437], "chicago": [41.8781, -87.6298],
        "madrid": [40.4168, -3.7038], "barcelona": [41.3874, 2.1686], "london": [51.5074, -0.1278],
        "berlin": [52.5200, 13.4050], "paris": [48.8566, 2.3522], "milan": [45.4642, 9.1900],
        "toronto": [43.6532, -79.3832], "sydney": [-33.8688, 151.2093], "tokyo": [35.6762, 139.6503]
    };

    function mockCenter(city) {
        return MOCK_CENTERS[Utils.normalizeBusinessName(city || "")] || null;
    }

    function buildMockBusinesses(params) {
        const count = Math.min(Number(params.limit) || CONFIG.resultsPerPage * 3, 120);
        const random = seededRandom(mockSeed(params) + count);
        const category = params.category || "Mecânicas";
        const key = Utils.categoryKey(category);
        const names = MOCK_NAMES[key] || MOCK_NAMES["mecanicas"];
        const city = params.city || "Curitiba";
        const state = params.state || "Paraná";
        const country = params.country || CONFIG.defaultCountry;
        const center = mockCenter(city, country) || [-25.4284, -49.2733];
        const base = slugToken(Utils.normalizeBusinessName(category) || "empresa");
        let businesses = [];

        /* Distribuição de cenários para exercitar todos os estados do
           classificador: site próprio, só redes sociais, sem nada, diretório,
           redirecionamento para rede social, página vazia e casos duvidosos. */
        const scenarios = [
            "has_website",
            "no_website",
            "social_only",
            "no_website",
            "directory_only",
            "redirect_social",
            "has_website",
            "no_website",
            "social_only",
            "no_website",
            "verify",
            "no_website",
            "has_website",
            "directory_only",
            "social_only",
            "parked_website",
            "no_website",
            "has_website"
        ];

        for (let i = 0; i < count; i += 1) {
            const scenario = scenarios[i % scenarios.length];
            const prefix = pick(random, names);
            const suffix = i % 3 === 0 ? "" : " " + (i + 1);
            const name = prefix + suffix;
            const token = slugToken(Utils.normalizeBusinessName(name)) || (base + i);
            const id = "mock-" + mockSeed(params) + "-" + i;
            const street = pick(random, MOCK_STREETS);
            const number = 100 + Math.floor(random() * 900);
            const neighborhood = params.neighborhood || pick(random, MOCK_NEIGHBORHOODS);
            const hasPhone = random() > 0.25;
            const dial = Utils.getCountryDialCode(country) || "55";
            const phone = hasPhone ? "+" + dial + "4" + String(40000000 + Math.floor(random() * 50000000)).slice(0, 8) : "";
            const rating = Math.round((3.4 + random() * 1.6) * 10) / 10;
            const reviews = Math.floor(random() * 240);
            const ownerHandle = (token + (i % 2 === 0 ? "" : "oficial")).slice(0, 22);
            const instagramUrl = "https://www.instagram.com/" + ownerHandle;

            const business = {
                id: id,
                provider: "mock",
                placeId: id,
                mockScenario: scenario,
                name: name,
                category: category,
                subcategory: "",
                country: country,
                state: state,
                city: city,
                neighborhood: neighborhood,
                address: street + ", " + number + " - " + neighborhood,
                postalCode: "",
                phone: phone,
                website: "",
                instagram: "",
                facebook: "",
                tiktok: "",
                rating: rating,
                reviews: reviews,
                mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(name + " " + city),
                latitude: Math.round((center[0] + (random() - 0.5) * 0.35) * 1e6) / 1e6,
                longitude: Math.round((center[1] + (random() - 0.5) * 0.35) * 1e6) / 1e6,
                openingHours: "",
                searchedAt: new Date().toISOString()
            };

            if (scenario === "has_website") {
                business.website = "https://www." + token + ".com.br";
                if (random() > 0.5) business.instagram = instagramUrl;
                business.mockSimulation = simulatePage({
                    title: name + " — " + category + " em " + city,
                    text: name + " | " + category + " | " + street + ", " + number + " - " + neighborhood + ", " + city + " - " + state + " | " + phone + " | Atendimento de segunda a sexta.",
                    socials: business.instagram ? [business.instagram] : []
                });
            } else if (scenario === "parked_website") {
                business.website = "https://" + token + ".com.br";
                business.mockSimulation = simulatePage({ title: MOCK_PARKED_TITLES[i % MOCK_PARKED_TITLES.length], text: "Esta página está em manutenção. Em breve novidades." });
            } else if (scenario === "social_only") {
                business.instagram = instagramUrl;
                if (random() > 0.4) business.facebook = "https://www.facebook.com/" + ownerHandle;
                if (random() > 0.8) business.tiktok = "https://www.tiktok.com/@" + ownerHandle;
            } else if (scenario === "directory_only") {
                business.website = random() > 0.5 ? "https://www.cylex.com.br/" + ownerHandle : instagramUrl;
            } else if (scenario === "redirect_social") {
                business.website = "https://" + token + ".com.br";
                business.mockSimulation = {
                    reachable: true,
                    statusCode: 200,
                    finalUrl: instagramUrl,
                    redirected: true,
                    redirect: { target: instagramUrl, type: "http" },
                    parked: false,
                    page: simulatePage({ title: name, text: name + " | " + category, socials: [instagramUrl] }).page
                };
            } else if (scenario === "verify") {
                business.website = "https://www." + token + "-" + i + ".exemplo-indisponivel.com";
                business.mockSimulation = {
                    reachable: false,
                    error: "cors_or_network",
                    reason: "O navegador bloqueou a leitura direta (CORS) ou o site está indisponível. A verificação precisa ser feita manualmente."
                };
            }

            if (scenario === "no_website" && random() > 0.75) {
                business.instagram = instagramUrl;
            }

            businesses.push(business);
        }

        /* Raio: descarta o que estiver além da distância pedida. */
        if (params.radiusKm && params.center) {
            const max = Number(params.radiusKm);
            const near = businesses.filter(function (item) {
                const d = Utils.distanceKm(params.center.latitude, params.center.longitude, item.latitude, item.longitude);
                return d == null ? true : d <= max;
            });
            if (near.length) businesses = near;
        }

        if (params.query) {
            const query = Utils.stripAccents(params.query).toLowerCase();
            const filtered = businesses.filter(function (item) {
                return Utils.stripAccents(item.name).toLowerCase().indexOf(query) !== -1 ||
                    Utils.stripAccents(item.address).toLowerCase().indexOf(query) !== -1;
            });
            if (filtered.length) return filtered;
        }

        /* Duplicatas intencionais: o mesmo negócio devolvido duas vezes pelo
           provedor, para exercitar a remoção de duplicados (§48). */
        if (businesses.length > 6) {
            const original = businesses[1];
            const duplicate = Object.assign({}, original, { id: original.id + "-dup" });
            businesses.splice(4, 0, duplicate);
        }

        return businesses;
    }

    /* No modo demonstração as empresas são fictícias, portanto a análise de
       site também é simulada — caso contrário todo resultado cairia em
       VERIFY por falta de domínios reais. */
    function simulatePage(partial) {
        return {
            reachable: true,
            statusCode: 200,
            finalUrl: "",
            redirected: false,
            redirect: null,
            parked: false,
            page: {
                title: partial.title || "",
                description: partial.description || "",
                canonical: "",
                metaRefresh: "",
                scriptRedirect: "",
                socials: partial.socials || [],
                text: partial.text || ""
            }
        };
    }

    async function mockSearch(params) {
        await Utils.delay(420);
        if (!CONFIG.enableMockData) {
            throw new NotConfiguredError("O modo de demonstração está desativado nas configurações.");
        }
        const items = buildMockBusinesses(params);
        return { provider: "mock", items: items, total: items.length, nextPageToken: "" };
    }

    async function mockGetDetails(id) {
        await Utils.delay(120);
        return { id: id, provider: "mock" };
    }

    /* ------------------------------------------------------------------ */
    /* Provedor OpenStreetMap (Overpass + Nominatim) — dados reais         */
    /* ------------------------------------------------------------------ */
    /* Ambos os endpoints respondem com Access-Control-Allow-Origin: *, então
       a consulta sai direto do navegador: sem chave, sem backend e sem custo.
       Limitação real: o OSM é mantido por voluntários, então a cobertura de
       site, telefone e redes sociais varia muito por cidade. */

    async function osmGeocode(query) {
        const url = CONFIG.osm.nominatim + "?format=jsonv2&limit=1&addressdetails=1&q=" + encodeURIComponent(query);
        const data = await fetchJson(url, CONFIG.osmTimeoutMs);
        if (!Array.isArray(data) || !data.length) return null;
        const hit = data[0];
        return {
            latitude: Number(hit.lat),
            longitude: Number(hit.lon),
            displayName: hit.display_name,
            type: hit.type,
            boundingBox: hit.boundingbox ? hit.boundingbox.map(Number) : null
        };
    }

    /* Sem coordenada não dá para consultar o Overpass por raio. */
    async function osmResolveCenter(params) {
        if (params.center && isFinite(params.center.latitude) && isFinite(params.center.longitude)) {
            return { center: params.center, geocoded: false };
        }
        const place = [params.city, params.state, params.country].filter(function (p) { return p; }).join(", ");
        if (!place) return { center: null, geocoded: false };
        return { center: await osmGeocode(place), geocoded: true };
    }

    /* Meio-arredondado do bbox em graus, calculado uma vez por busca. */
    let BBOX_LAT = 0.027;
    let BBOX_LON = 0.030;

    function setBboxForRadius(radiusKm, latitude) {
        const r = Math.max(1, Number(radiusKm) || CONFIG.defaultRadiusKm);
        BBOX_LAT = r / 111.32;
        const cos = Math.max(0.2, Math.cos((Number(latitude) * Math.PI) / 180));
        BBOX_LON = r / (111.32 * cos);
    }

    /* Monta a consulta Overpass.
       Cada etiqueta vira uma cláusula independente (OU entre elas). O erro
       "print cannot be subelement of union" vem de declarar `relation` junto
       de `node`/`way` na mesma união, então relations vao em bloco próprio. */
    function buildOsmQuery(params) {
        const mapping = OSM_TAGS[Utils.categoryKey(params.category || "")] || OSM_GENERIC_TAGS;
        let keys = Object.keys(mapping).filter(function (key) { return key !== "name"; });
        if (!keys.length) keys = ["shop"];

        const center = params.center || {};
        const lat = Number(center.latitude);
        const lon = Number(center.longitude);
        const bbox = isFinite(lat) && isFinite(lon)
            ? "(" + (lat - BBOX_LAT).toFixed(6) + "," + (lon - BBOX_LON).toFixed(6) + "," +
              (lat + BBOX_LAT).toFixed(6) + "," + (lon + BBOX_LON).toFixed(6) + ")"
            : "";
        if (!bbox) return "";

        const limit = Math.min(Number(params.limit) || CONFIG.osmMaxResults, CONFIG.osmMaxResults);
        const timeout = Math.round(CONFIG.osmTimeoutMs / 1000);
        const usedKeys = keys.filter(function (k) { return mapping[k] && mapping[k] !== "*"; });
        if (!usedKeys.length) {
            throw new ProviderError(
                "A categoria \"" + (params.category || "") + "\" ainda não tem etiquetas do OpenStreetMap definidas. Adicione o mapeamento em OSM_TAGS, no arquivo js/config.js.",
                "category_not_mapped"
            );
        }

        /* Só node e way. Incluir `relation` no mesmo bloco deixa o Overpass
           instável (429/504) sem ganho prático: virtually nenhum comércio é
           mapeado como relação multipolígono. */
        const clauses = [];
        usedKeys.forEach(function (key) {
            const filter = '["' + key + '"="' + mapping[key] + '"]';
            clauses.push("node" + filter + bbox);
            clauses.push("way" + filter + bbox);
        });

        /* Atenção ao ";" final dentro dos parenteses: o Overpass exige o
           separador antes de fechar a união. Sem ele a resposta é
           "parse error: ';' expected - ')' found". */
        return "[out:json][timeout:" + timeout + "];" +
            "(" + clauses.join(";") + ";);" +
            "out center tags " + limit + ";";
    }

    function osmToBusiness(element, params) {
        const t = element.tags || {};
        const name = Utils.collapseSpaces(t.name || t["name:pt"] || t.brand || "");
        const address = [t["addr:street"], t["addr:housenumber"], t["addr:suburb"], t["addr:neighbourhood"]]
            .filter(function (part) { return part; }).join(", ");

        const cityFromTags = Utils.collapseSpaces(t["addr:city"] || t["addr:town"] || t["addr:county"] || params.city || "");
        const stateFromTags = Utils.collapseSpaces(t["addr:state"] || params.state || "");

        return {
            id: "osm-" + element.type + "-" + element.id,
            provider: "osm",
            osm_id: element.id,
            osm_type: element.type,
            name: name,
            category: Utils.collapseSpaces(t.shop || t.craft || t.office || t.amenity || t.leisure || params.category || ""),
            subcategory: Utils.collapseSpaces(t["shop:category"] || ""),
            country: params.country || "",
            state: stateFromTags,
            city: cityFromTags,
            neighborhood: Utils.collapseSpaces(t["addr:suburb"] || t["addr:neighbourhood"] || params.neighborhood || ""),
            address: address,
            postalCode: Utils.collapseSpaces(t["addr:postcode"] || ""),
            phone: Utils.collapseSpaces(t.phone || t["contact:phone"] || t["contact:mobile"] || ""),
            /* Atenção: o OSM guarda o site em `website` e também em
               `contact:website`; ambos passam pela mesma checagem social. */
            website: Utils.collapseSpaces(t.website || t["contact:website"] || ""),
            instagram: Utils.collapseSpaces(t["contact:instagram"] || t.instagram || ""),
            facebook: Utils.collapseSpaces(t["contact:facebook"] || t.facebook || ""),
            whatsapp: Utils.collapseSpaces(t["contact:whatsapp"] || ""),
            openingHours: Utils.collapseSpaces(t.opening_hours || ""),
            latitude: element.lat != null ? element.lat : (element.center ? element.center.lat : ""),
            longitude: element.lon != null ? element.lon : (element.center ? element.center.lon : ""),
            rating: "",
            reviews: "",
            mapsUrl: "https://www.openstreetmap.org/" + element.type + "/" + element.id
        };
    }

    async function osmSearch(params) {
        const resolved = await osmResolveCenter(params);
        const center = resolved.center;

        if (!center) {
            throw new ProviderError(
                "Não foi possível localizar \"" + (params.city || params.country || "alocalização") + "\". Tente escrever a cidade de outro formato, por exemplo \"Curitiba, Paraná, Brasil\".",
                "geocode_failed"
            );
        }

        setBboxForRadius(params.radiusKm, center.latitude);
        const query = buildOsmQuery(Object.assign({}, params, { center: center }));
        if (!query) {
            throw new ProviderError("A consulta ao OpenStreetMap não pôde ser montada. Informe cidade ou coordenadas.", "invalid_params");
        }
        const data = await overpassQuery(query);
        const elements = (data && data.elements) || [];

        const items = elements
            .map(function (element) { return osmToBusiness(element, params); })
            .filter(function (item) { return item.name; });

        return {
            provider: "osm",
            items: items,
            total: items.length,
            nextPageToken: "",
            center: center
        };
    }

    async function osmGetDetails(id) {
        const match = /^(node|way|relation)-(\d+)$/.exec(String(id || ""));
        if (!match) return null;
        const query = "[out:json][timeout:15];(" + match[1] + "(" + match[2] + "););out center tags;";
        const data = await overpassQuery(query);
        const element = data && data.elements && data.elements[0];
        return element ? osmToBusiness(element, {}) : null;
    }

    /* Percorre os mirrors do Overpass até um responder.
       Dois motivos para avançar: sobrecarga (429/504, comum) ou bloqueio de
       rede (403/406, comum em proxy corporativo). No fim, a mensagem muda
       conforme o motivo, porque a solução é diferente em cada caso. */
    async function overpassQuery(query) {
        const mirrors = (CONFIG.osm.overpassMirrors || []).filter(Boolean);
        if (!mirrors.length) {
            throw new ProviderError("Nenhum mirror do OpenStreetMap está configurado.", "not_configured");
        }

        const perMirror = Math.max(1, CONFIG.osmAttemptsPerMirror || 1);
        const blocked = [];
        let sawRateLimit = false;
        let lastError = null;

        for (let m = 0; m < mirrors.length; m += 1) {
            const mirror = mirrors[m];
            for (let attempt = 0; attempt < perMirror; attempt += 1) {
                try {
                    return await fetchJson(mirror + "?data=" + encodeURIComponent(query), CONFIG.osmTimeoutMs);
                } catch (error) {
                    lastError = error;
                    if (error instanceof BlockedError) {
                        blocked.push.apply(blocked, error.blockedHosts);
                        break;
                    }
                    if (error && (error.code === "rate_limited" || error.code === "timeout")) {
                        sawRateLimit = true;
                        break;
                    }
                    /* erro de sintaxe da query ou similar: não adianta trocar
                       de mirror, a consulta é a mesma. */
                    if (error && (error.code === "invalid_response" || /^http_4/.test(String(error.code)))) {
                        throw error;
                    }
                    break;
                }
            }
        }

        if (blocked.length) {
            const hosts = blocked.filter(function (h, i, a) { return a.indexOf(h) === i; });
            const mirrorHosts = mirrors.map(function (m) {
                try { return new URL(m).hostname; } catch (e) { return m; }
            });
            const todosBloqueados = mirrorHosts.every(function (host) {
                return hosts.indexOf(host) !== -1;
            });
            throw new BlockedError(
                todosBloqueados
                    ? "A rede ou o proxy desta máquina bloqueou todos os servidores do OpenStreetMap (" + mirrorHosts.join(", ") + "). Nada foi retornado — não é problema com a cidade ou a categoria informadas."
                    : "Parte dos servidores do OpenStreetMap está bloqueada nesta rede (" + hosts.join(", ") + "), e os restantes não responderam agora.",
                hosts
            );
        }

        if (sawRateLimit || (lastError && lastError.code === "rate_limited")) {
            throw new ProviderError(
                "O OpenStreetMap está sobrecarregado no momento (muitos usuários consultando). Tente novamente em alguns minutos.",
                "rate_limited"
            );
        }
        throw lastError || new ProviderError("O serviço OpenStreetMap não respondeu.", "osm_unavailable");
    }

    /* ------------------------------------------------------------------ */
    /* Provedores reais via proxy serverless                                */
    /* ------------------------------------------------------------------ */

    function requireProxy(providerName) {
        if (!CONFIG.proxyUrl) {
            throw new NotConfiguredError(
                "O provedor \"" + providerName + "\" precisa de um proxy serverless. Defina CONFIG.proxyUrl em js/config.js (veja README → Segurança) ou volte ao modo mock."
            );
        }
        return true;
    }

    async function callProxy(action, payload) {
        requireProxy(CONFIG.provider);
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(function () { controller.abort(); }, CONFIG.requestTimeoutMs + 4000) : null;
        let response;
        try {
            response = await fetch(CONFIG.proxyUrl, {
                method: "POST",
                mode: "cors",
                credentials: "omit",
                headers: {
                    "Content-Type": "application/json",
                    "X-Proxy-Token": CONFIG.proxyToken || ""
                },
                body: JSON.stringify({ action: action, params: payload }),
                signal: controller ? controller.signal : undefined
            });
        } catch (error) {
            if (error && error.name === "AbortError") throw new TimeoutError();
            throw new NetworkError();
        } finally {
            if (timer) clearTimeout(timer);
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            throw new ProviderError("Resposta inválida do proxy (" + response.status + ").", "invalid_response");
        }

        if (!response.ok) {
            const message = (data && (data.error || data.message)) || "";
            if (response.status === 429 || /quota|limite|limit|rate/i.test(message)) throw new QuotaError(message || CONFIG.messages.quotaError);
            if (response.status === 401 || response.status === 403) throw new NotConfiguredError("Proxy recusou a requisição: " + (message || "chave inválida ou não autorizada."));
            throw new ProviderError(message || CONFIG.messages.apiError, "http_" + response.status);
        }
        return data;
    }

    function buildQueryTerms(params) {
        const terms = params.category ? Utils.getCategoryTerms(params.category) : [];
        if (params.subcategory) terms.push(params.subcategory);
        if (params.query) terms.push(params.query);
        return terms;
    }

    async function proxySearch(params) {
        const payload = {
            query: params.query || "",
            terms: buildQueryTerms(params),
            category: params.category || "",
            subcategory: params.subcategory || "",
            country: params.country || "",
            state: params.state || "",
            city: params.city || "",
            neighborhood: params.neighborhood || "",
            postalCode: params.postalCode || "",
            radiusKm: Number(params.radiusKm) || null,
            center: params.center || null,
            limit: Number(params.limit) || CONFIG.resultsPerPage,
            pageToken: params.pageToken || "",
            language: params.language || "pt"
        };
        const data = await callProxy("search", payload);
        if (!data || !Array.isArray(data.items)) {
            throw new ProviderError("O proxy respondeu sem a lista de empresas esperada.", "invalid_response");
        }
        return { provider: CONFIG.provider, items: data.items, total: data.total || data.items.length, nextPageToken: data.nextPageToken || "" };
    }

    async function proxyGetDetails(id) {
        const data = await callProxy("details", { id: id });
        return data || null;
    }

    /* ------------------------------------------------------------------ */
    /* Adaptadores (§40)                                                   */
    /* ------------------------------------------------------------------ */

    const SearchProvider = {
        mock: {
            id: "mock",
            label: "Mock (demonstração)",
            requiresProxy: false,
            search: mockSearch,
            getDetails: mockGetDetails
        },
        google: {
            id: "google",
            label: "Google Places / Business",
            requiresProxy: true,
            search: proxySearch,
            getDetails: proxyGetDetails
        },
        osm: {
            id: "osm",
            label: "OpenStreetMap (Overpass)",
            requiresProxy: false,
            search: osmSearch,
            getDetails: osmGetDetails
        },
        serpapi: {
            id: "serpapi",
            label: "SerpApi (Google Maps)",
            requiresProxy: true,
            search: proxySearch,
            getDetails: proxyGetDetails
        }
    };

    function getProvider(id) {
        const providerId = id || CONFIG.provider || "mock";
        const provider = SearchProvider[providerId];
        if (!provider) {
            throw new NotConfiguredError("Provedor desconhecido: \"" + providerId + "\". Providers disponíveis: " + listProviders().join(", ") + ".");
        }
        return provider;
    }

    function listProviders() {
        return Object.keys(SearchProvider);
    }

    async function searchBusinesses(params) {
        const provider = getProvider(params && params.provider);
        if (provider.requiresProxy && !CONFIG.proxyUrl) {
            requireProxy(provider.id);
        }
        try {
            const result = await provider.search(params || {});
            return result;
        } catch (error) {
            if (error instanceof ProviderError) throw error;
            if (error && error.name === "AbortError") throw new TimeoutError();
            if (error instanceof TypeError) throw new NetworkError();
            throw new ProviderError((error && error.message) || CONFIG.messages.apiError, "unknown_error");
        }
    }

    /* Mensagem de aviso sobre a origem e a confiabilidade dos dados. */
    function getSourceNotice(providerId) {
        const id = providerId || CONFIG.provider;
        if (id === "mock") return "Dados fictícios de demonstração. Use para avaliar a interface, não para contato comercial.";
        return (CONFIG.sourceNotice && CONFIG.sourceNotice[id]) || "";
    }

    async function getBusinessDetails(id) {
        const provider = getProvider();
        if (!provider.getDetails) return null;
        try {
            return await provider.getDetails(id);
        } catch (error) {
            if (error instanceof ProviderError) throw error;
            return null;
        }
    }

    return {
        SearchProvider: SearchProvider,
        getProvider: getProvider,
        listProviders: listProviders,
        getCityCenter: mockCenter,
        searchBusinesses: searchBusinesses,
        getBusinessDetails: getBusinessDetails,
        getSourceNotice: getSourceNotice,
        ProviderError: ProviderError,
        QuotaError: QuotaError,
        NetworkError: NetworkError,
        TimeoutError: TimeoutError,
        NotConfiguredError: NotConfiguredError,
        BlockedError: BlockedError
    };
})();

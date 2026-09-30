/* Prospecção Web — Configuração global.
   ATENÇÃO: nunca insira chaves secretas (API_KEY, SECRET, TOKEN privado) neste arquivo.
   Ele é publicado junto com o site. Use proxy serverless (Cloudflare Workers, Vercel,
   Netlify, Supabase Edge) ou chaves públicas restritas por domínio. */

const CONFIG = {
    appName: "Prospecção Web",
    appShortName: "PW",
    tagline: "Encontre empresas que ainda não possuem um site próprio.",
    version: "1.0.0",

    defaultCountry: "Brasil",
    defaultRadiusKm: 10,
    radiusOptions: [1, 2, 5, 10, 15, 25, 50, 100],

    resultsPerPage: 20,
    maxResultsPerSearch: 200,

    /* "osm" = OpenStreetMap via Overpass: dados reais, sem chave, sem custo.
       "mock" = demonstração fictícia (apenas para avaliar a interface).
       "google" / "serpapi" = exigem proxy serverless (ver README). */
    enableMockData: true,
    provider: "osm",

    /* Endpoint serverless opcional que fala com o provedor real.
       Ex.: "https://api.seudominio.com/places" — implementa POST { action, params }. */
    proxyUrl: "",

    /* Endpoints públicos do OpenStreetMap. Todos respondem com
       Access-Control-Allow-Origin: *, então funcionam direto do navegador.

       A ordem importa: cada mirror é testado até o primeiro responder. Redes
       corporativas e provedores de internet às vezes bloqueiam mirror por
       mirror (o proxy do órgão público, por exemplo, recusa overpass-api.de com
       HTTP 406 e libera os demais). Ter mais de um mirror é o que evita a tela
       de "nenhuma empresa encontrada" nesses casos. */
    osm: {
        /* Geocodificação: converte "Curitiba, Paraná, Brasil" em coordenadas. */
        nominatim: "https://nominatim.openstreetmap.org/search",

        /* Busca por categoria e raio. O primeiro é o oficial da fundação. */
        overpassMirrors: [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.openstreetmap.fr/api/interpreter",
            "https://overpass.osm.ch/api/interpreter",
            "https://overpass.private.coffee/api/interpreter",
            "https://osm-overpass.gs.mil/api/interpreter"
        ]
    },

    /* Overpass é um serviço compartilhado e costuma recusar carga excessiva.
       Os limites abaixo evitam que uma busca trave a interface. */
    osmTimeoutMs: 45000,
    osmMaxResults: 120,
    osmResultSeconds: 180,
    osmAttemptsPerMirror: 2,

    /* Cabeçalho opcional enviado ao proxy. Prefira um token de uso único por
       sessão gerado localmente; nunca versione um segredo real aqui. */
    proxyToken: "",

    requestTimeoutMs: 8000,
    analyzeWebsites: true,
    maxConcurrentAnalysis: 4,

    cacheEnabled: true,
    cacheTtlMs: 1000 * 60 * 30,

    locale: "pt-BR",
    currencyNote: "Valores de avaliação vêm do provedor de dados e podem variar.",

    whatsappMessage:
        "Olá! Encontrei sua empresa durante uma pesquisa e gostaria de apresentar uma proposta de site.",

    /* Como avisar sobre a origem dos dados. O OpenStreetMap é mantido por
       Volunteers, então a cobertura varia muito entre cidades e categorias. */
    sourceNotice: {
        osm: "Dados do OpenStreetMap, mantidos por voluntários. A cobertura de site, telefone e redes sociais varia bastante por cidade e categoria: muitas empresas ainda não foram mapeadas com esses dados.",
        google: "Dados do Google Places, via proxy serverless. Verifique os termos de uso do provedor antes de usar comercialmente."
    },

    /* Critérios técnicos do "perfil para prospecção".
       Representa apenas sinais técnicos observáveis nos dados, nunca um juízo
       sobre a qualidade do negócio. Pesos ajustáveis. */
    scoring: {
        enabled: true,
        noWebsite: 30,
        socialOnly: 18,
        redirectSocial: 22,
        directoryOnly: 16,
        verify: 6,
        hasWebsite: -25,
        hasInstagram: 12,
        hasFacebook: 10,
        hasPhone: 8,
        hasMaps: 6,
        reviewsPerStar: 4,
        maxReviewsBonus: 14,
        minRating: 4.0,
        ratingBonus: 8
    },

    /* Mensagens padrão (podem ser sobrescritas por status) */
    messages: {
        apiError: "Não foi possível realizar a pesquisa. Verifique sua conexão ou configuração do provedor.",
        quotaError: "O limite de pesquisas do provedor foi atingido.",
        offline: "Sem conexão com a internet.",
        noResults: "Nenhuma empresa encontrada para estes filtros.",
        saved: "Empresa adicionada à prospecção.",
        removed: "Empresa removida da prospecção.",
        copied: "Copiado!",
        generatorSoon: "Funcionalidade preparada para futura integração com o gerador de sites."
    }
};

const CATEGORIES = [
    {
        group: "Serviços locais",
        icon: "briefcase",
        items: [
            "Mecânicas",
            "Eletricistas",
            "Encanadores",
            "Marceneiros",
            "Serralheiros",
            "Vidraçarias",
            "Estofarias",
            "Instaladores",
            "Pintores",
            "Empresas de limpeza"
        ]
    },
    {
        group: "Beleza",
        icon: "sparkles",
        items: [
            "Barbearias",
            "Salões",
            "Manicure",
            "Estética",
            "Sobrancelhas",
            "Cabeleireiros"
        ]
    },
    {
        group: "Profissionais",
        icon: "users",
        items: [
            "Fotógrafos",
            "Personal trainers",
            "Arquitetos",
            "Designers",
            "Contadores",
            "Consultores"
        ]
    }
];

/* Termos equivalentes por idioma, usados para adaptar a categoria ao provedor
   (ex.: "Mecânicas" -> "Mechanic", "Barbearias" -> "Barber shop"). */
const CATEGORY_TERMS = {
    "mecanicas": ["mecanicas", "mecânica", "auto repair", "auto repair shop", "mechanic", "mechanics", "car repair", "oficina", "oficina mecanica", "taller mecanico"],
    "eletricistas": ["eletricista", "electrician", "electrical contractor"],
    "encanadores": ["encanador", "plumber", "plumbing", "encanamento"],
    "marceneiros": ["marceneiro", "carpenter", "carpentry", "joiner", "madeira"],
    "serralheiros": ["serralheiro", "locksmith", "chaves", "fechaduras"],
    "vidracarias": ["vidracaria", "vidraceiro", "glazier", "glass shop", "glass"],
    "estofarias": ["estofaria", "estofado", "upholstery", "sofa", "estofamento"],
    "instaladores": ["instalador", "installer", "installation service", "antenna installation"],
    "pintores": ["pintor", "pintura", "painter", "painting", "decorator"],
    "empresas-de-limpeza": ["limpeza", "empresa de limpeza", "cleaning service", "cleaning company", "cleaners", "housekeeping"],
    "barbearias": ["barbearia", "barbeiro", "barber", "barber shop", "barbershop"],
    "saloes": ["salao", "salao de beleza", "salon", "hair salon", "beauty salon", "hairdresser"],
    "manicure": ["manicure", "manicureiro", "nail salon", "nail care"],
    "estetica": ["estetica", "esteticista", "aesthetics", "beauty clinic", "spa"],
    "sobrancelhas": ["sobrancelha", "sobrancelhas", "eyebrow", "brow studio", "design de sobrancelha"],
    "cabeleireiros": ["cabeleireiro", "cabelo", "hairdresser", "hair salon", "barber"],
    "fotógrafos": ["fotografo", "fotografia", "photographer", "photography", "photo studio", "estudio fotografico"],
    "personal-trainers": ["personal trainer", "personal", "trainer", "fitness", "gym", "academia"],
    "arquitetos": ["arquiteto", "arquitetura", "architect", "architecture", "architectural"],
    "designers": ["designer", "design", "estudio de design", "graphic design", "branding"],
    "contadores": ["contador", "contabilidade", "accountant", "accounting", "tax", "contabilidade"],
    "consultores": ["consultor", "consultoria", "consultant", "consulting", "coach"]
};

/* Mapeamento categoria -> etiquetas do OpenStreetMap.
   Usado pelo provedor "osm" para montar a consulta Overpass.
   Acrescente novas categorias livremente; sem mapeamento, a busca assume
   "shop" genérico, que costuma devolver pouco resultado. */
const OSM_TAGS = {
    "mecanicas": { shop: "car_repair", craft: "car_repair", name: /mec[aâ]nica|oficina|auto|turbo|funilaria|pintura|boracha/i },
    "eletricistas": { craft: "electrician", office: "electrician", name: /el[eé]tric/i },
    "encanadores": { craft: "plumber", name: /encanador|hidr[aá]ulic|canaliz/i },
    "marceneiros": { craft: "carpenter", shop: "carpentry", name: /marcen|madeira|planejados|m[oó]veis/i },
    "serralheiros": { craft: "locksmith", name: /serralher|chaveiro|fechadura/i },
    "vidracarias": { craft: "glaziery", shop: "glass", name: /vidra[cç]|vidro|espelho/i },
    "estofarias": { craft: "upholsterer", shop: "upholstery", name: /estofad|sof[aá]|colch[oõ]es|poltrona/i },
    "instaladores": { craft: "installer", name: /instala|antena/i },
    "pintores": { craft: "painter", name: /pintor|pintura|decora[cç]/i },
    "empresas-de-limpeza": { shop: "cleaning", name: /limpeza|higiene|zeladoria|conserv/i },
    "barbearias": { shop: "hairdresser", name: /barbear|barbeiro|navalha/i },
    "saloes": { shop: "hairdresser", name: /sal[aã]o|cabelo|hair|beleza/i },
    "manicure": { shop: "beauty", name: /manicure|unhas|nail/i },
    "estetica": { shop: "beauty", amenity: "spa", name: /est[eé]tica|cl[ií]nica|spa|beauty/i },
    "sobrancelhas": { shop: "beauty", name: /sobrancelh|design de sobrancelha/i },
    "cabeleireiros": { shop: "hairdresser", name: /cabeleireiro|hair|sal[aã]o/i },
    "fotógrafos": { shop: "photography", name: /foto|est[uú]dio|lens|clique/i },
    "personal-trainers": { leisure: "fitness_centre", amenity: "gym", name: /personal|training|academia|fit/i },
    "arquitetos": { office: "architect", name: /arquiteto|arquitetura|studio/i },
    "designers": { office: "graphic_design", name: /design|studio|criativ/i },
    "contadores": { office: "accountant", name: /contador|contabilidade|contab/i },
    "consultores": { office: "consulting", name: /consultor|consultoria|mentoria/i }
};

/* Fallback quando a categoria não tem mapeamento próprio. */
const OSM_GENERIC_TAGS = { shop: "*" };

/* Redes sociais: nunca contam como site próprio (§15/§16). Editável. */
const SOCIAL_DOMAINS = [
    "instagram.com",
    "facebook.com",
    "fb.com",
    "fb.me",
    "tiktok.com",
    "youtube.com",
    "youtu.be",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "pinterest.com",
    "threads.net",
    "threads.com",
    "snapchat.com",
    "t.me",
    "telegram.me",
    "wa.me",
    "whatsapp.com",
    "vk.com",
    "weibo.com",
    "line.me",
    "spotify.com",
    "soundcloud.com",
    "vimeo.com",
    "flickr.com",
    "tumblr.com",
    "kuaishou.com",
    "douyin.com",
    "wechat.com",
    "mastodon.social"
];

/* Diretórios, marketplaces e agregadores: também não contam como site próprio (§17). */
const DIRECTORY_DOMAINS = [
    "google.com",
    "google.com.br",
    "google.pt",
    "google.es",
    "google.co.uk",
    "maps.google.com",
    "goo.gl",
    "maps.app.goo.gl",
    "yelp.com",
    "tripadvisor.com",
    "foursquare.com",
    "yellowpages.com",
    "pagesjaunes.fr",
    "cylex.net",
    "cylex.com.br",
    "11880.com",
    "apontador.com",
    "guiamais.com.br",
    "telelistas.net",
    "mapa.com",
    "wapps.com.br",
    "ifood.com",
    "ifood.com.br",
    "rappi.com",
    "rappi.com.br",
    "ubereats.com",
    "just-eat.co.uk",
    "ubereats.com.br",
    "amazon.com",
    "mercadolivre.com.br",
    "olx.com.br",
    "elo7.com.br",
    "etsy.com",
    "shopee.com.br",
    "aliexpress.com",
    "apple.com",
    "linktr.ee",
    "beacons.ai",
    "linktree.com",
    "bio.link",
    "carrd.co",
    "wixsite.com",
    "wordpress.com",
    "blogspot.com",
    "sites.google.com",
    "googlemybusiness.com",
    "business.site",
    "godaddysites.com",
    "weebly.com",
    "jimdosite.com",
    "square.site",
    "webnode.page",
    "hotpage.com.br",
    "telesped.com",
    "doctoralia.com",
    "justdial.com",
    "sulekha.com",
    "cywarna.net",
    "cylex.ie",
    "cylex.pt",
    "panoramio.com",
    "snupit.com",
    "infoisland.net",
    "bizapedia.com",
    "dnb.com",
    "apollo.io",
    "crunchbase.com",
    "indeed.com",
    "glassdoor.com",
    "jameda.com",
    "doctoralia.com.br"
];

/* Estados (para o Brasil) e países com Cities: a busca aceita texto livre,
   estas listas apenas melhoram a experiência com sugestões. */
const COUNTRIES = [
    { code: "BR", name: "Brasil", aliases: ["brazil", "brasil"], dial: "55", states: ["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"], cities: ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza", "Belo Horizonte", "Manaus", "Curitiba", "Recife", "Porto Alegre", "Belém", "Goiânia", "Campinas", "Natal", "Teresina", "João Pessoa", "Campo Grande", "Florianópolis", "Maceió", "Rio Branco", "Porto Velho", "Boa Vista", "Palmas", "Aracaju", "Vitória", "Cuiabá", "Uberlândia", "Londrina", "Joinville", "Niterói", "Juiz de Fora", "Balneário Camboriú", "Caxias do Sul", "Petrópolis", "Sorocaba", "Chapecó", "Maringá", "Ribeirão Preto", "Santos"] },
    { code: "US", name: "United States", aliases: ["estados unidos", "usa", "us", "america"], dial: "1", states: ["Alabama", "Arizona", "California", "Florida", "Georgia", "Illinois", "Massachusetts", "Nevada", "New York", "Texas", "Washington"], cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "San Francisco", "Seattle", "Denver", "Boston", "Miami", "Atlanta", "Orlando", "Las Vegas", "Detroit", "Portland", "Nashville"] },
    { code: "PT", name: "Portugal", aliases: ["portugal"], dial: "351", states: ["Aveiro", "Beja", "Braga", "Bragança", "Castelo Branco", "Coimbra", "Évora", "Faro", "Guarda", "Leiria", "Lisboa", "Porto", "Santarém", "Setúbal", "Viana do Castelo", "Vila Real", "Viseu"], cities: ["Lisboa", "Porto", "Braga", "Coimbra", "Funchal", "Setúbal", "Aveiro", "Faro", "Évora", "Leiria", "Viseu", "Guimarães"] },
    { code: "ES", name: "España", aliases: ["spain", "espanha", "es"], dial: "34", states: ["Andalucía", "Cataluña", "Comunidad de Madrid", "Comunidad Valenciana", "Galicia", "País Vasco", "Islas Canarias", "Islas Baleares"], cities: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga", "Murcia", "Palma", "Bilbao", "Alicante", "Granada", "Vigo"] },
    { code: "AR", name: "Argentina", aliases: ["argentina"], dial: "54", states: ["Buenos Aires", "Córdoba", "Santa Fe", "Mendoza", "La Pampa", "Tucumán", "Entre Ríos"], cities: ["Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata", "San Miguel de Tucumán", "Mar del Plata"] },
    { code: "CL", name: "Chile", aliases: ["chile"], dial: "56", states: ["Región Metropolitana", "Valparaíso", "Biobío", "Atacama", "Los Lagos"], cities: ["Santiago", "Valparaíso", "Viña del Mar", "Concepción", "Antofagasta", "Temuco", "Rancagua"] },
    { code: "MX", name: "México", aliases: ["mexico", "méxico"], dial: "52", states: ["Ciudad de México", "Jalisco", "Nuevo León", "Yucatán", "Puebla", "Querétaro"], cities: ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "León", "Mérida", "Cancún"] },
    { code: "GB", name: "United Kingdom", aliases: ["reino unido", "england", "uk"], dial: "44", states: ["England", "Scotland", "Wales", "Northern Ireland"], cities: ["London", "Birmingham", "Manchester", "Glasgow", "Liverpool", "Leeds", "Edinburgh", "Bristol"] },
    { code: "DE", name: "Deutschland", aliases: ["germany", "alemanha", "de"], dial: "49", states: ["Bayern", "Berlin", "Hessen", "Nordrhein-Westfalen", "Baden-Württemberg", "Niedersachsen"], cities: ["Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart", "Düsseldorf", "Leipzig"] },
    { code: "FR", name: "France", aliases: ["france", "franca", "fr"], dial: "33", states: ["Île-de-France", "Occitanie", "Nouvelle-Aquitaine", "Auvergne-Rhône-Alpes", "Provence-Alpes-Côte d'Azur"], cities: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Bordeaux", "Lille"] },
    { code: "IT", name: "Italia", aliases: ["italy", "italia", "it"], dial: "39", states: ["Lazio", "Lombardia", "Campania", "Sicilia", "Toscana", "Piemonte", "Veneto"], cities: ["Roma", "Milano", "Napoli", "Torino", "Palermo", "Genova", "Bologna", "Firenze"] },
    { code: "CA", name: "Canada", aliases: ["canadá", "canada"], dial: "1", states: ["Ontario", "Quebec", "British Columbia", "Alberta", "Nova Scotia"], cities: ["Toronto", "Montréal", "Vancouver", "Calgary", "Ottawa", "Québec", "Halifax"] },
    { code: "AU", name: "Australia", aliases: ["austrália", "australia"], dial: "61", states: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia"], cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra", "Gold Coast"] },
    { code: "NL", name: "Nederland", aliases: ["netherlands", "holanda"], dial: "31", states: ["Noord-Holland", "Zuid-Holland", "Utrecht", "Noord-Brabant", "Groningen"], cities: ["Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", "Groningen"] },
    { code: "BE", name: "België", aliases: ["belgium", "bélgica", "be"], dial: "32", states: ["Vlaanderen", "Wallonië", "Brussel-Capital"], cities: ["Brussel", "Antwerpen", "Gent", "Charleroi", "Liège", "Brugge"] },
    { code: "UY", name: "Uruguay", aliases: ["uruguai", "uruguay"], dial: "598", states: ["Montevideo", "Canelones", "Maldonado"], cities: ["Montevideo", "Salto", "Paysandú", "Las Piedras"] },
    { code: "PY", name: "Paraguay", aliases: ["paraguai", "paraguay"], dial: "595", states: ["Asunción", "Central", "Cordillera"], cities: ["Asunción", "Ciudad del Este", "San Lorenzo", "Luque"] },
    { code: "BO", name: "Bolivia", aliases: ["bolívia", "bolivia"], dial: "591", states: ["La Paz", "Santa Cruz", "Cochabamba"], cities: ["La Paz", "Santa Cruz de la Sierra", "Cochabamba", "Sucre"] },
    { code: "PE", name: "Perú", aliases: ["peru", "perú"], dial: "51", states: ["Lima", "Arequipa", "Cusco", "Trujillo", "Piura"], cities: ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Cusco"] },
    { code: "CO", name: "Colombia", aliases: ["colombia", "colômbia"], dial: "57", states: ["Bogotá D.C.", "Antioquia", "Valle del Cauca", "Cundinamarca", "Atlántico"], cities: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga"] },
    { code: "JP", name: "Japan", aliases: ["japão", "japao", "japan"], dial: "81", states: ["Tokyo", "Osaka", "Kyoto", "Aichi", "Fukuoka", "Hokkaido"], cities: ["Tokyo", "Osaka", "Kyoto", "Nagoya", "Sapporo", "Fukuoka", "Yokohama"] },
    { code: "AE", name: "United Arab Emirates", aliases: ["emirados", "uae"], dial: "971", states: ["Dubai", "Abu Dhabi", "Sharjah"], cities: ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain"] }
];

/* Classificações possíveis (§19/§20) com rótulo, cor e descrição. */
const STATUS = {
    HAS_WEBSITE: "HAS_WEBSITE",
    NO_WEBSITE_SOCIAL: "NO_WEBSITE_SOCIAL",
    NO_WEBSITE: "NO_WEBSITE",
    REDIRECT_SOCIAL: "REDIRECT_SOCIAL",
    DIRECTORY_ONLY: "DIRECTORY_ONLY",
    VERIFY: "VERIFY"
};

const STATUS_META = {
    HAS_WEBSITE: {
        label: "SITE ENCONTRADO",
        short: "Com site",
        tone: "success",
        icon: "check",
        description: "A empresa possui um site próprio válido."
    },
    NO_WEBSITE_SOCIAL: {
        label: "SEM SITE PRÓPRIO — POSSUI REDES SOCIAIS",
        short: "Redes sociais",
        tone: "warning",
        icon: "alert",
        description: "Não foi encontrado site próprio, mas existe presença em redes sociais."
    },
    NO_WEBSITE: {
        label: "SEM SITE IDENTIFICADO",
        short: "Sem site",
        tone: "danger",
        icon: "ban",
        description: "Não foi encontrado site próprio nem presença social relevante nos dados retornados."
    },
    REDIRECT_SOCIAL: {
        label: "NÃO POSSUI SITE PRÓPRIO — REDIRECIONA PARA REDE SOCIAL",
        short: "Redireciona p/ social",
        tone: "danger",
        icon: "redirect",
        description: "O domínio informado redireciona para uma rede social."
    },
    DIRECTORY_ONLY: {
        label: "SEM SITE — PRESENÇA APENAS EM DIRETÓRIOS",
        short: "Só diretórios",
        tone: "warning",
        icon: "info",
        description: "A única presença digital encontrada é em diretório ou marketplace."
    },
    VERIFY: {
        label: "VERIFICAÇÃO NECESSÁRIA",
        short: "Verificação",
        tone: "info",
        icon: "help",
        description: "Existe alguma URL, mas não foi possível determinar com segurança se ela é o site oficial."
    }
};

/* Etapas do funil de prospecção (§26). */
const LEAD_STATUSES = [
    "Novo",
    "Pesquisado",
    "Modelo criado",
    "Contato realizado",
    "Respondeu",
    "Interessado",
    "Orçamento enviado",
    "Cliente",
    "Sem interesse",
    "Não respondeu"
];

const LEAD_STATUS_TONE = {
    "Novo": "neutral",
    "Pesquisado": "info",
    "Modelo criado": "info",
    "Contato realizado": "info",
    "Respondeu": "success",
    "Interessado": "success",
    "Orçamento enviado": "warning",
    "Cliente": "success",
    "Sem interesse": "danger",
    "Não respondeu": "muted"
};

/* Colunas da exportação CSV (§29/§56). */
const CSV_COLUMNS = [
    { key: "name", header: "nome" },
    { key: "category", header: "categoria" },
    { key: "neighborhood", header: "bairro" },
    { key: "city", header: "cidade" },
    { key: "state", header: "estado" },
    { key: "country", header: "pais" },
    { key: "address", header: "endereco" },
    { key: "phone", header: "telefone" },
    { key: "website", header: "site" },
    { key: "instagram", header: "instagram" },
    { key: "facebook", header: "facebook" },
    { key: "mapsUrl", header: "google_maps" },
    { key: "rating", header: "avaliacao" },
    { key: "reviews", header: "quantidade_de_avaliacoes" },
    { key: "status", header: "status_site" },
    { key: "score", header: "perfil_prospeccao" },
    { key: "leadStatus", header: "status_prospeccao" },
    { key: "notes", header: "observacoes" },
    { key: "searchedAt", header: "data_da_busca" }
];

/* Colunas exibidas na tabela que vira cards no mobile (§64). */
const PROSPECT_COLUMNS = [
    { key: "name", header: "Empresa", primary: true },
    { key: "category", header: "Categoria" },
    { key: "location", header: "Localização" },
    { key: "phone", header: "Telefone" },
    { key: "status", header: "Status" },
    { key: "leadStatus", header: "Contato" },
    { key: "searchedAt", header: "Data" }
];

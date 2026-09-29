# Prospecção Web

> Sistema web de prospecção comercial que localiza empresas por categoria e localização, analisa a presença digital e identifica quais empresas **não possuem site próprio** — com distinção explícita entre "sem site confirmado" e "verificação necessária".

Interface: HTML5, CSS3 e JavaScript ES6+. Sem build, sem dependências, compatível com GitHub Pages.

## O que o sistema faz

```
Buscar por categoria + localização
        ↓
Normalizar os resultados do provedor
        ↓
Analisar cada URL (site próprio, rede social, diretório, redirecionamento)
        ↓
Classificar com 6 estados verificáveis
        ↓
Filtrar, salvar na prospecção, exportar CSV
```

## Estados de classificação

| Estado | Significado |
| --- | --- |
| `HAS_WEBSITE` | Existe site próprio válido e a correspondência com a empresa foi confirmada. |
| `NO_WEBSITE_SOCIAL` | Não há site próprio, mas há Instagram, Facebook, TikTok etc. |
| `NO_WEBSITE` | Nenhum site, rede social ou diretório informado pelo provedor. |
| `REDIRECT_SOCIAL` | O domínio informado redireciona para uma rede social. |
| `DIRECTORY_ONLY` | A única presença é diretório, marketplace ou hospedagem de sites. |
| `VERIFY` | Existe uma URL, mas não foi possível confirmar com segurança. |

O estado `VERIFY` existe para evitar falsos positivos. Quando a verificação
automática falha por CORS, timeout ou bloqueio, o sistema **não** afirma
"sem site" — ele pede verificação manual.

## Busca por região

País, estado/região, cidade, bairro, CEP, raio em km, categoria, subcategoria e
nome de empresa (opcional). Funciona com listas de países de vários idiomas
(Brasil, EUA, Portugal, Espanha, Japão etc.) e os termos de categoria são
adaptados por idioma via `CATEGORY_TERMS` em `js/config.js`.

O campo "Onde?" aceita "Cidade, Estado, País" numa linha só. O raio é repassado
ao provedor; para filtrar por distância dentro do navegador, informe o centro da
busca (latitude/longitude) em "Mais opções". No modo demonstração, o centro é
derivado da cidade automaticamente e a distância aparece em cada resultado.

## Estrutura

```
prospecao-sites/
├── index.html
├── README.md
├── .gitignore
├── robots.txt
├── sitemap.xml
├── llms.txt
├── css/
│   └── style.css
├── js/
│   ├── config.js       configuração, categorias, domínios, pesos do score
│   ├── app.js          bootstrap, rotas, eventos
│   ├── api.js          camada de provedor + Mock Mode + erros
│   ├── search.js       orquestração, normalização, dedupe, filtros
│   ├── classifier.js   análise de URL e classificação
│   ├── storage.js      localStorage, TTL de cache, prospecções
│   ├── ui.js           renderização de cards, modal, dashboard, CSV
│   └── utils.js        normalizadores, debounce, clipboard, WhatsApp
└── assets/
    ├── images/
    │   ├── logo/logo.svg
    │   └── icons/sprite.svg     cópia do sprite embutido no index.html
    └── favicon/                 favicon.svg + PNG 180/192/512
```

O sprite de ícones fica embutido no `index.html` para evitar uma requisição
extra no carregamento. `assets/images/icons/sprite.svg` é a mesma cópia em
arquivo separado, para reaproveitar os ícones em outras páginas. Ao adicionar
um ícone, atualize os dois.

Fluxo de dados: `api.js` (provedor) → `search.js` (normalização) →
`classifier.js` (análise) → `ui.js` (interface). Trocar de provedor não exige
reescrever a aplicação.

## Modo demonstração (Mock Mode)

Ativado por padrão (`CONFIG.enableMockData: true`, `CONFIG.provider: "mock"`).
Gera empresas fictícias com uma distribuição proposital de cenários para
exercitar todos os estados: site próprio, sem site, apenas redes sociais,
apenas diretórios, redirecionamento para rede social, página vazia e caso
duvidoso. Também inclui duplicatas intencionais para testar a remoção de
duplicados.

No mock, a análise de site é **simulada** — empresas e domínios são fictícios,
então uma requisição real falharia sempre. O banner "Modo demonstração" fica
visível no topo.

## Configurar um provedor real

1. Contrate um provedor com API oficial (Google Places, SerpApi, OpenStreetMap
   via Overpass, Foursquare, Mapbox, Bing Web Search).
2. Crie uma função serverless que receba `{ action, params }` e chame a API com
   a chave guardada como variável de ambiente.
3. Configure em `js/config.js`:

```javascript
provider: "google",        // mock | google | osm | serpapi
proxyUrl: "https://api.seudominio.com/places"
```

A interface esperada do proxy:

```
POST { action: "search", params: {...} }  →  { items: [...], total, nextPageToken }
POST { action: "details", params: { id } } →  { ...detalhes... }
GET  { proxyUrl }/analyze?url=...         →  HTML da página (fallback de análise)
```

Cada item deve conter, no mínimo: `id`, `name`, `category`, `address`, `city`,
`state`, `country`, `phone`, `website`, `rating`, `reviews`, `mapsUrl`.

### Opções serverless

- **Cloudflare Workers** — grátis no plano free, latência baixa.
- **Vercel Functions / Netlify Functions** — deploy junto com o front.
- **Supabase Edge Functions** — útil se migrar o armazenamento para Supabase.
- **Google Cloud Functions** — perto dos dados do Google.

## GitHub Pages

```bash
git init
git add .
git commit -m "Prospecção Web: MVP funcional"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

Depois, no repositório: **Settings → Pages → Source: Deploy from a branch →
Branch: main / (root)**. A aplicação fica em
`https://SEU-USUARIO.github.io/SEU-REPO/`.

Como o projeto usa apenas caminhos relativos (`./css/...`, `./js/...`), funciona
na raiz do domínio e em subpastas.

Atualize `sitemap.xml` e `robots.txt` com a URL final antes de publicar.

## Segurança

**Nunca coloque uma chave secreta no repositório.** `config.js` é público no
GitHub Pages.Chaves de API ficam em variáveis de ambiente da função serverless.

Se o provedor oferecer chave pública restrita (Google Maps JavaScript API, por
exemplo), configure no console do provedor:

- restrição de domínio (HTTP referrer e domínio);
- limite de requisições por dia e por minuto;
- escopo mínimo de permissões;
- IP permitido, quando disponível.

Boas práticas já aplicadas neste projeto:

- nenhuma chave, token ou segredo versionado no código;
- o token do proxy fica em campo `type="password"` e não é gravado em
  `localStorage` — ele vale apenas para a sessão atual;
- validação de `rel="noopener noreferrer nofollow"` em todos os links externos;
- `escapeHtml` em toda interpolação de conteúdo externo;
- nenhuma tentativa de contornar CAPTCHA, bloqueio, CORS ou limite de requisição.

## Responsabilidade dos dados

Use apenas dados disponibilizados legitimamente pelo provedor contratado e
respeite os termos de uso. O sistema coleta apenas informações comerciais
públicas: nome, endereço comercial, telefone comercial, site, redes sociais
comerciais, categoria e avaliações agregadas. Não há coleta de dados pessoais
além disso, nem acesso a áreas restritas.

## Exportação

Botão **Exportar CSV** em Resultados, Prospecções e Exportações. O arquivo
inclui BOM UTF-8 e aspas duplicadas, então abre direto no Excel e no Google
Sheets:

```
nome, categoria, bairro, cidade, estado, pais, endereco, telefone, site,
instagram, facebook, google_maps, avaliacao, quantidade_de_avaliacoes,
status_site, perfil_prospeccao, status_prospeccao, observacoes, data_da_busca
```

Também há backup completo em JSON (exportar/importar) em Configurações.

## Armazenamento

`localStorage`, com chaves `pw:` e expiração de cache (`CONFIG.cacheTtlMs`).
Guarda: prospecções com status e observações, histórico de pesquisas, métricas,
preferências, listas de domínios e backup. Tudo fica apenas neste navegador.

`js/storage.js` expõe `StorageAdapter` como ponto de extensão: para migrar para
Supabase, Firebase ou um backend próprio, troque a implementação do adapter sem
alterar `ui.js` nem `app.js`.

Se o `localStorage` estiver indisponível (navegador privado restrito), o
sistema cai para armazenamento em memória e avisa nas configurações.

## Custos de APIs

- **GitHub Pages** hospeda o frontend sem custo.
- **O provedor de dados pode ter custo.** Google Places, SerpApi e Foursquare
  cobram por requisição ou por volume. Estabeleça um teto de gasto no painel do
  provedor antes de usar em produção.
- **Chaves restritas** limitam abuso, mas não limitam cobrança. O restriction
  por domínio é obrigatório.
- **O modo mock não consome API.** Desenvolva e treine a interface sem custo e
  só troque o provedor quando a integração estiver validada.
- Uma função serverless pode ter custo próprio (Cloudflare Workers e Netlify
  têm cotas gratuitas generosas; Vercel Functions é gratuita em uso baixo).
- Classifique URLs consome requisições: cada domínio único é buscado no máximo
  uma vez por pesquisa, com concorrência limitada.

## Acessibilidade

HTML semântico, `label` em todos os campos, `aria-label` nos botões de ícone,
`role="tablist"` nas abas, `aria-live` para contadores e toasts, foco visível,
`skip-link`, navegação por teclado com `/` para a busca e `Esc` para fechar
modal e menu, e `prefers-reduced-motion` respeitado.

## Responsividade

Testado de 320px a 1920px. No celular o sidebar vira menu, os filtros colapsam
em campos empilhados, a tabela vira cards e a modal abre como folha inferior.

## Fluxo de uso

1. Escolher região
2. Escolher categoria
3. Pesquisar
4. Filtrar **Sem site**
5. Abrir detalhes e conferir o motivo da classificação
6. Salvar na prospecção e definir o status de contato
7. Enviar o modelo de site e a proposta

## Roadmap

O MVP entrega busca → análise → prospecção. A arquitetura já separa
provedor, análise, persistência e interface para crescer em CRM e gerador de
sites, mas **nada disso está implementado ainda**. O botão "Criar modelo"
exibe apenas a mensagem de que a integração virá.

Possíveis próximos passos: login e usuários, banco Supabase, histórico
sincronizado, pipeline Kanban, tarefas e lembretes, Templates de proposta,
geração de landing page a partir dos dados coletados, integração real de
WhatsApp e e-mail.

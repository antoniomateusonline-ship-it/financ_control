/*
  Service Worker — Finanças Pessoais
  Estratégia: NETWORK-FIRST.
  Sempre tenta buscar a versão mais nova na internet primeiro; se não
  conseguir (sem conexão, offline, etc.), cai para a última versão
  salva no cache. Isso garante que, com internet, você sempre vê a
  versão mais recente do app publicada no GitHub Pages, e sem internet
  o app continua funcionando com o que já foi carregado antes.

  IMPORTANTE: sempre que publicar uma atualização do app, mude o
  CACHE_NAME abaixo (ex.: "financas-v2", "financas-v3"...) para que o
  cache antigo seja descartado e o novo seja usado.

  SEGURANÇA: este service worker só cacheia os arquivos do próprio app
  (o "esqueleto") e a biblioteca do Supabase. Chamadas à API do Supabase
  (login e dados do usuário) NUNCA passam por aqui nem são guardadas em
  cache — vão sempre direto pra rede, para não arriscar misturar dados
  de contas diferentes caso mais de uma pessoa use o mesmo navegador.
*/

const CACHE_NAME = "financas-v2";
const SUPABASE_JS_HINT = "supabase-js"; // trecho presente na URL do CDN da biblioteca

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
];

// Instala e pré-carrega os arquivos essenciais no cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // não trava a instalação se algum asset falhar
  );
  self.skipWaiting();
});

// Remove caches de versões antigas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first: tenta a rede, cai para o cache se falhar
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só intercepta requisições GET (POST/PUT etc. seguem direto pra rede)
  if (req.method !== "GET") return;

  const isSameOrigin = req.url.indexOf(self.location.origin) === 0;
  const isSupabaseLib = req.url.indexOf(SUPABASE_JS_HINT) !== -1;

  // Qualquer outra coisa (principalmente chamadas à API do Supabase) não
  // passa pela nossa lógica de cache — segue o comportamento padrão do navegador.
  if (!isSameOrigin && !isSupabaseLib) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Só clona/guarda respostas válidas (do próprio site ou da lib do Supabase)
        if (response && response.status === 200 && (response.type === "basic" || response.type === "cors")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          // fallback final: se pediu uma navegação de página, devolve o index.html do cache
          if (req.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 504, statusText: "Offline" });
        })
      )
  );
});

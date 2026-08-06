# BaiakIdle Helper

[![Release](https://img.shields.io/github/v/release/iIlusion/baiakidle-helper?style=flat-square&logo=github&label=release)](https://github.com/iIlusion/baiakidle-helper/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-suporte-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/Hy7HqcAgQG)
[![GitHub Stars](https://img.shields.io/github/stars/iIlusion/baiakidle-helper?style=flat-square&logo=github&label=stars)](https://github.com/iIlusion/baiakidle-helper/stargazers)
[![License](https://img.shields.io/github/license/iIlusion/baiakidle-helper?style=flat-square&label=license)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-userscript-00485B?style=flat-square&logo=tampermonkey&logoColor=white)](https://github.com/iIlusion/baiakidle-helper/releases/latest/download/baiakidle-helper.user.js)
Userscript para Tampermonkey que adiciona ao [BaiakIdle](https://baiakidle.com/jogar/) um painel integrado à interface do jogo.

## Recursos

### Loot & inventário

- **Auto Sell:** envia `sell all` quando o Loot Pouch atinge a % configurada (slider 1–100%; padrão **90%**). Com **Auto Transfer** ligado, move as raridades marcadas para o backpack **antes** de vender (ignora o cooldown do loop de transfer).
- **Open All Glooth Bag:** abre todas as Glooth Bags quando existe espaço e a venda não está em cooldown.
- **Auto Sell Supply Potions:** move potions da Supply Pouch para a Loot Pouch e vende (`sell all`). Filtros opcionais:
  - só no Treino online;
  - só sem Glooth Bag no backpack;
  - só com Loot Pouch vazia.
- **Auto Transfer:** move itens da Loot Pouch para o Backpack por raridade (Rare / Epic / Legendary / Mythical).

### Hunt & stamina

- **Auto Hunt:** na cidade, entra na hunt escolhida no catálogo (pacote de stage + fallback DOM).
- **Treino ↔ Hunt por stamina:** com Auto Hunt ligado, roteia automaticamente:
  - stamina ≤ limiar (padrão **378 min / 6h18m**, 15% de 42h) → vai ao Treino online e **só depois** esvazia a Loot Pouch (transfer de raridades + `sell all`, aguardando cooldown até vender). O default evita hunt com **0.5× XP e gold** (penalidade com stamina abaixo de 15%); pouch vazia libera open glooth / sell potions no Treino;
  - stamina ≥ limiar (padrão **42h**, máx. 42h / 2520 min) → volta à hunt alvo.

### Sessão, market e desempenho

- **Auto Reconnect:**
  - **Homepage:** só path exato `/` (não outras páginas `/*`) → `/jogar` após **10s**.
  - **Manutenção:** em `/` com “Em Manutenção” → vai a `/jogar`; no modal “JOGO EM MANUTENÇÃO” faz refresh a cada **30s** e detecta se o overlay sumiu.
  - **Limite de contas simultâneas / takeover:** detecta o overlay e tenta de novo a cada **10s**.
  - **Pause (sessão):** mini-bar na home/site pausa o auto reconnect até retomar (sessionStorage).
  - Queda / stuck.
- **Auto Market Announce:** `aucshare` no chat Market; coleta IDs sozinha (Market invisível → Meus anúncios → Vitrine → fecha), **sem** Bearer/token do helper (evita SESSÃO EXPIRADA).
- **Loot vendido (Hunt Analyzer):** modo Sessão = textos de venda (g+mg) + gold drop direto (`fx`); modo Jogo = nativo.
- **Modo leve (sem VFX):** bloqueia pacotes `fx` antes do Pixi (magias, projéteis e efeitos) para reduzir freeze em combate.

### Interface

- **Painel nativo:** botão **Helper** na barra de abas do jogo; preferências salvas no navegador (`localStorage`).
- **MCP opcional:** na build de desenvolvimento, uma aba explica como conectar o jogo ao Codex; a bridge **não** é necessária para a automação.

Por padrão, **Auto Sell** e **Open All Glooth Bag** começam ligados. As demais opções ficam desligadas até você ativá-las no painel.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/) no navegador.
2. Ative a permissão **Allow User Scripts** nas configurações da extensão, caso o navegador a exija.
3. [Instale a versão mais recente do BaiakIdle Helper](https://github.com/iIlusion/baiakidle-helper/releases/latest/download/baiakidle-helper.user.js).
4. Abra ou recarregue `https://baiakidle.com/jogar/`.
5. Use a nova aba **Helper** na barra superior do jogo.

O estado de cada opção é salvo em `localStorage` e pode ser alterado a qualquer momento no painel.

### Atualizações automáticas

A partir da versão `1.0.2`, o Tampermonkey verifica `releases/latest` e instala novas versões automaticamente conforme a frequência configurada na extensão.

Se você usa a versão `1.0.1` ou anterior, instale a [versão mais recente](https://github.com/iIlusion/baiakidle-helper/releases/latest/download/baiakidle-helper.user.js) manualmente uma vez para ativar o auto-update.

## Suporte e contato

Precisa de ajuda, encontrou um bug ou quer sugerir uma melhoria?

- [Entre no Discord](https://discord.gg/Hy7HqcAgQG) para suporte e contato direto.
- [Abra uma issue](https://github.com/iIlusion/baiakidle-helper/issues) para problemas reproduzíveis e acompanhamento público.

## Desenvolvimento

Requisitos: Node.js 20 ou mais recente e npm.

```bash
git clone https://github.com/iIlusion/baiakidle-helper.git
cd baiakidle-helper
npm install
npm run build
```

O build gera localmente os userscripts em `dist/` (a pasta é ignorada pelo Git):

- `dist/baiakidle-helper.user.js`: versão de produção;
- `dist/baiakidle-helper.dev.user.js`: loader para desenvolvimento local.

Para trabalhar com atualização contínua:

1. Instale `dist/baiakidle-helper.dev.user.js` no Tampermonkey.
2. Desative a versão de produção para não carregar duas cópias.
3. Execute:

```bash
npm run dev
```

4. Recarregue a página após uma alteração. O loader busca o bundle atual em `http://127.0.0.1:8946` sem precisar ser reinstalado.

Comandos disponíveis:

```bash
npm run dev        # build em watch mode + servidor local na porta 8946
npm run build      # gera os userscripts de produção e desenvolvimento
npm run typecheck  # valida o TypeScript sem gerar arquivos
npm run test       # checagens leves (ex.: catálogo / rates)
```

## Desenvolvimento com MCP

O Helper funciona sozinho. Para analisar DOM, fetch/XHR e pacotes WebSocket com o Codex, use o projeto separado [baiakidle-mcp](https://github.com/iIlusion/baiakidle-mcp).

A aba **Desenvolvimento** (build dev) também mostra o estado da bridge e um exemplo de configuração do Codex. Essa separação mantém a extensão principal pequena e evita capturar tráfego quando as ferramentas de desenvolvimento não estão sendo usadas.

## Estrutura

```text
src/
  control.tsx              painel React e wiring das opções
  control.css              aparência integrada ao jogo
  analyzers.ts             melhorias de analyzers / loot gold
  packets.ts               payloads base64 (sell, open, supplymove, …)
  rate.ts                  parsing de rates / gold de venda
  socket.ts                transporte WebSocket do Helper
  socket-role.ts           identificação do socket de gameplay
  ws-filter.ts             filtro de pacotes (modo leve / VFX)
  automation/
    settings.ts            load/save de preferências
    scheduler.ts           tick unificado (hunt → transfer → sell → …)
    hunt.ts                auto hunt + rota treino/stamina
    transfer.ts            auto transfer por raridade
    reconnect.ts           auto reconnect
    market-announce.ts     auto market announce
    state.ts               leitura de inventário / stamina / mundo
  data/
    hunts.ts               catálogo de hunts
    hunt-catalog.json
  components/ui/switch.tsx
scripts/
  dev.mjs
  add-userscript-banner.mjs
  check-rates.mjs
dist/                      userscripts locais, publicados apenas nos releases
docs/                      notas locais de reverse (ignorado no Git)
```

## Privacidade e uso

O Helper roda em `https://baiakidle.com/*` (match do userscript). Ele não envia telemetria nem depende de um servidor externo; as preferências ficam no próprio navegador. Os comandos automatizados usam a conexão já aberta pela página.

Use somente na sua própria sessão e verifique as regras do jogo. Este é um projeto independente, sem vínculo oficial com BaiakIdle.

## Licença

[MIT](LICENSE)

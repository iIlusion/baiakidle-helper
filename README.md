# BaiakIdle Helper

Userscript para Tampermonkey que adiciona ao [BaiakIdle](https://baiakidle.com/jogar/) um painel integrado à interface do jogo.

## Recursos

- **Auto Sell:** envia `sell all` quando o Loot Pouch chega ao limite.
- **Open All Glooth Bag:** abre todas as Glooth Bags quando existe espaço disponível e a venda não está em cooldown.
- **Painel nativo:** botão dentro da barra de abas do jogo, com preferências salvas no navegador.
- **MCP opcional:** uma aba de desenvolvimento explica como conectar o jogo ao Codex sem tornar a bridge necessária para a automação.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/) no navegador.
2. Ative a permissão **Allow User Scripts** nas configurações da extensão, caso o navegador a exija.
3. [Instale o BaiakIdle Helper](https://raw.githubusercontent.com/iIlusion/baiakidle-helper/main/dist/baiakidle-helper.user.js).
4. Abra ou recarregue `https://baiakidle.com/jogar/`.
5. Use a nova aba **Helper** na barra superior do jogo.

As duas automações começam habilitadas. O estado de cada opção é salvo em `localStorage` e pode ser alterado a qualquer momento no painel.

## Desenvolvimento

Requisitos: Node.js 20 ou mais recente e npm.

```bash
git clone https://github.com/iIlusion/baiakidle-helper.git
cd baiakidle-helper
npm install
npm run build
```

O build gera somente os userscripts em `dist/`:

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
```

## Desenvolvimento com MCP

O Helper funciona sozinho. Para analisar DOM, fetch/XHR e pacotes WebSocket com o Codex, use o projeto separado [baiakidle-mcp](https://github.com/iIlusion/baiakidle-mcp).

A aba **Desenvolvimento** dentro do painel também mostra o estado da bridge e um exemplo de configuração do Codex. Essa separação mantém a extensão principal pequena e evita capturar tráfego quando as ferramentas de desenvolvimento não estão sendo usadas.

## Estrutura

```text
src/
  control.tsx            painel React e automações
  control.css            aparência integrada ao jogo
  socket.ts              transporte mínimo para os comandos do Helper
  socket-role.ts         identificação do WebSocket de gameplay
  components/ui/switch.tsx
scripts/
  dev.mjs                servidor local e build incremental
  add-userscript-banner.mjs
dist/                    userscripts instaláveis
```

## Privacidade e uso

O Helper roda apenas em `https://baiakidle.com/jogar/`. Ele não envia telemetria nem depende de um servidor externo; as preferências ficam no próprio navegador. Os comandos automatizados usam a conexão já aberta pela página.

Use somente na sua própria sessão e verifique as regras do jogo. Este é um projeto independente, sem vínculo oficial com BaiakIdle.

## Licença

[MIT](LICENSE)
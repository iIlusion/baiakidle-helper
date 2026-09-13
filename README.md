# Leviticus Extension

[![Release](https://img.shields.io/github/v/release/iIlusion/baiakidle-helper?style=flat-square&logo=github&label=release)](https://github.com/iIlusion/baiakidle-helper/releases/latest)
[![Site](https://img.shields.io/badge/site-leviticusbot.com-8d78ff?style=flat-square)](https://leviticusbot.com)
[![Discord](https://img.shields.io/badge/Discord-entrar-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.leviticusbot.com)
[![License](https://img.shields.io/github/license/iIlusion/baiakidle-helper?style=flat-square&label=license)](LICENSE)

O antigo Baiakidle Helper agora é o **Leviticus Extension**. A extensão faz parte do ecossistema Leviticus e adiciona automações próprias à sessão do [BaiakIdle](https://baiakidle.com/jogar/).

[Conhecer o Leviticus](https://leviticusbot.com) · [Entrar no Discord](https://discord.leviticusbot.com) · [Instalar a versão mais recente](https://github.com/iIlusion/baiakidle-helper/releases/latest/download/baiakidle-helper.user.js)

## O que a extensão faz

### Loot e inventário

- **Auto Sell:** vende quando a Loot Pouch chega ao limite configurado.
- **Auto Transfer:** envia itens da Loot Pouch para o Backpack por raridade.
- **Open All Glooth Bag:** abre as bags quando há espaço disponível.
- **Auto Sell Supply Potions:** organiza e vende as potions da Supply Pouch.

### Hunt e stamina

- **Auto Hunt:** escolhe a hunt configurada e inicia o fluxo pelo catálogo do jogo.
- **Treino automático:** alterna entre hunt e Treino online conforme a stamina.
- A rota pode transferir itens e vender a pouch antes de voltar à hunt.

### Auto Boss próprio

O Leviticus Extension tem um Auto Boss próprio dentro do modal de Bosses do jogo. Ele não usa o Auto Boss nativo, presets, preparação ou AutoBuild.

Você pode:

- montar a lista de bosses;
- arrastar os cards para trocar a ordem;
- remover bosses da fila;
- iniciar e parar a execução;
- ativar o início automático diário às **00:00 no horário de Brasília**.

A extensão mostra o estado atual no cabeçalho da wave e continua usando a conexão já aberta pelo jogo.

### Sessão e interface

- **Auto Reconnect:** tenta recuperar a sessão em quedas, manutenção e limite de contas.
- **Auto Market Announce:** publica anúncios no Market usando o fluxo normal da página.
- **Modo leve:** reduz efeitos visuais que podem pesar durante o combate.
- **Painel Leviticus:** concentra as opções na nova aba Leviticus e salva as preferências no navegador.

Por padrão, **Auto Sell** e **Open All Glooth Bag** começam ligados. As outras automações ficam desligadas até você ativá-las.

## Instalação

### Instalação normal

1. Instale o [Tampermonkey](https://www.tampermonkey.net/) no seu navegador.
2. Se o navegador pedir a permissão **Allow User Scripts**, ative-a para o Tampermonkey.
3. Abra o instalador oficial: [baixar Leviticus Extension](https://github.com/iIlusion/baiakidle-helper/releases/latest/download/baiakidle-helper.user.js).
4. Na tela do Tampermonkey, confira se o nome é **Leviticus Extension** e clique em **Install**.
5. Abra o [BaiakIdle](https://baiakidle.com/jogar/) e recarregue a página depois que o script terminar de instalar.
6. Na barra superior do jogo, abra a aba **Leviticus**.

Na primeira execução de cada versão, a extensão mostra um aviso sobre a mudança de nome. Depois que você fechar o aviso, ele não volta a aparecer nas recargas da mesma versão. Ele aparece novamente quando uma versão nova é instalada.

### Se você já usava o Baiakidle Helper

O Tampermonkey pode manter a cópia antiga separada por causa da mudança de nome. Para evitar duas automações rodando ao mesmo tempo:

1. Abra o painel do Tampermonkey.
2. Desative ou remova o script antigo **Baiakidle Helper**, se ele ainda estiver listado.
3. Deixe apenas o **Leviticus Extension** ativo.
4. Recarregue a página do jogo.

### Atualizações

A instalação oficial já configura o endereço de atualização do Tampermonkey. O navegador verifica novas releases de acordo com o intervalo definido pelo próprio Tampermonkey.

Se quiser atualizar manualmente, abra novamente o [instalador da versão mais recente](https://github.com/iIlusion/baiakidle-helper/releases/latest/download/baiakidle-helper.user.js) e confirme a atualização no Tampermonkey.

### A aba Leviticus não apareceu

Confira estes pontos:

- o Tampermonkey está ativo no navegador;
- o script **Leviticus Extension** está habilitado;
- a permissão **Allow User Scripts** está ativa, quando disponível;
- o script antigo e o loader de desenvolvimento não estão rodando junto com a versão normal;
- a página foi recarregada depois da instalação.

## Desenvolvimento

Requisitos: Node.js 20 ou mais recente e npm.

```bash
git clone https://github.com/iIlusion/baiakidle-helper.git
cd baiakidle-helper
npm install
npm run build
```

O build gera os userscripts locais em `dist/`:

- `dist/baiakidle-helper.user.js`: versão normal, pronta para instalar no Tampermonkey;
- `dist/baiakidle-helper.dev.user.js`: loader para desenvolvimento local.

Para trabalhar com atualização contínua:

1. Instale `dist/baiakidle-helper.dev.user.js` no Tampermonkey.
2. Desative a versão normal para não carregar duas cópias.
3. Execute:

```bash
npm run dev
```

4. Recarregue a página depois de cada alteração. O loader busca o bundle atual em `http://127.0.0.1:8946`.

Comandos principais:

```bash
npm run dev        # build em watch mode + servidor local na porta 8946
npm run build      # gera os userscripts de produção e desenvolvimento
npm run typecheck  # valida o TypeScript sem gerar arquivos
npm run test       # checagens leves (ex.: catálogo / rates)
```

## MCP opcional

A extensão funciona sozinha. Para inspecionar o DOM, as requisições e os pacotes WebSocket do jogo com o Codex, use o projeto separado [baiakidle-mcp](https://github.com/iIlusion/baiakidle-mcp).

A bridge é uma ferramenta de desenvolvimento. Ela não é necessária para usar as automações do Leviticus Extension.

## Privacidade e uso

O Leviticus Extension roda apenas nas páginas do BaiakIdle correspondentes ao userscript. As preferências ficam no `localStorage` do navegador. A extensão não envia telemetria nem depende de um servidor externo para executar as automações.

Este é um projeto independente, sem vínculo oficial com o BaiakIdle. Use-o na sua própria sessão e verifique as regras do jogo.

## Licença

[MIT](LICENSE)

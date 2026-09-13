# Leviticus Extension e Auto Boss próprio — Design

## Objetivo

Transformar a identidade pública do userscript BaiakIdle Helper em **Leviticus Extension**, alinhar seu painel à linguagem visual do site `C:\Users\ak\Desktop\leviticus-bot` e adicionar um Auto Boss integralmente controlado pela extensão.

O Auto Boss terá somente catálogo, fila, iniciar/parar e início diário às 00h de Brasília. Não haverá presets nem preparação por boss. Nenhuma API do Auto Boss nativo do jogo poderá ser usada.

## Restrições de compatibilidade

A renomeação separa identidade pública de contratos técnicos legados.

Devem virar **Leviticus Extension**:

- `@name` e `@description` do userscript de produção e desenvolvimento;
- título, botão, textos acessíveis, cabeçalho, rodapé e mensagens de console visíveis;
- nome e descrição do pacote;
- README, instruções de instalação e documentação de recursos;
- símbolo global de build que não participe do updater.

Devem permanecer com o identificador `baiakidle-helper`:

- URL e slug do repositório GitHub;
- `@homepageURL`, `@updateURL` e `@downloadURL`;
- nomes dos artefatos `baiakidle-helper.user.js` e `baiakidle-helper.dev.user.js`;
- `@namespace`, para manter a identidade da instalação existente;
- chave `baiakidle-helper-v1` do `localStorage`, preservando preferências atuais;
- URLs e porta do loader de desenvolvimento;
- IDs DOM e nomes internos cuja alteração aumentaria risco sem benefício ao usuário.

Essas exceções são internas ou exigidas pela continuidade de update. Não devem aparecer como marca principal da interface.

## Proibição do Auto Boss nativo

A implementação não pode enviar nem consumir nenhum destes contratos:

- `autoboss`;
- `autobosslist`;
- `autobosspreset`;
- `autobossstate`.

Também não deve clicar ou acionar a interface do Auto Boss nativo. Toda a fila, cursor, agenda, classificação de resultado, persistência e máquina de estados serão da Leviticus Extension.

O único comando relacionado a boss que a extensão enviará será o comando manual oficial `boss`, com `{ bossId, fromCity }`, precedido de `cityPresence { away: false }` quando necessário. Isso equivale à ação manual “Enfrentar” e não delega encadeamento ao jogo.

## Arquitetura

### 1. Espelho de estado da sala

O hook de WebSocket existente continuará capturando os pacotes desde `document-start`. Um módulo isolado manterá um decoder por socket para os pacotes Colyseus:

- `JOIN_ROOM`: lê o handshake de reflexão da schema;
- `ROOM_STATE`: aplica o estado integral;
- `ROOM_STATE_PATCH`: aplica atualizações incrementais;
- fechamento do socket: descarta seu decoder.

O espelho expõe apenas um snapshot pequeno e imutável necessário ao Auto Boss:

- `mode` e `huntId`;
- `activeBossId`;
- `bossChargesLeft` e `bossChargesMax`;
- `bossCooldowns`;
- `bestiary`, usado como contador de vitórias;
- level da party;
- stamina convertida para minutos;
- estado de morte.

O módulo não envia mensagens e não observa `autobossstate`. Ele será uma leitura paralela do mesmo estado normal que a página já recebe.

O decoder deverá ficar fora do caminho de renderização. O estado projetado só será recalculado em `ROOM_STATE`/`ROOM_STATE_PATCH`; os pacotes frequentes de combate não passarão por trabalho adicional.

### 2. Catálogo de bosses

O catálogo estático do Leviticus desktop será copiado para a extensão em formato JSON e envolvido por funções pequenas:

- busca por `id` ou `bossKey`;
- ordenação por level e nome;
- normalização e deduplicação da fila;
- data do calendário em `America/Sao_Paulo`.

O catálogo contém somente metadados necessários à seleção e execução. Não serão importados sprites, presets ou módulos de preparação.

### 3. Controlador próprio

O controlador será derivado da máquina de estados já validada em `C:\Users\ak\Desktop\baiakidle-websocket\hub\src\automation\auto-boss.ts`, removendo completamente a integração de preparação.

Estados operacionais:

- parado;
- aguardando conexão/estado inicial;
- aguardando stamina;
- aguardando cargas;
- escolhendo próximo boss elegível;
- entrando;
- lutando;
- aguardando confirmação do resultado;
- concluído.

Regras:

1. `Iniciar` zera o cursor e os resultados do ciclo e começa pela primeira entrada da fila.
2. Boss desconhecido, abaixo do level ou em cooldown é pulado.
3. Com menos de 90 minutos de stamina, a execução permanece ligada e aguarda.
4. Sem cargas, a execução permanece ligada e aguarda.
5. Antes de enviar `boss`, o controlador confirma que a conta não está morta, que o socket está conectado e que não há outra entrada em andamento.
6. A entrada usa um intervalo mínimo de seis segundos para impedir duplicação.
7. Ao entrar, o controlador salva o contador de kills do boss.
8. Ao sair da sala do boss, aguarda até quatro segundos pela atualização tardia do bestiary.
9. Kill incrementado significa vitória; morte ou ausência de incremento após a espera significa derrota.
10. Vitória ou derrota avança a fila. Ao terminar, o ciclo para e fica marcado como concluído.
11. `Parar` impede novas entradas; uma luta já iniciada termina normalmente, mas não encadeia a próxima.

O estado de runtime necessário para sobreviver a reload será persistido junto às configurações: cursor, boss em luta, kills ao entrar, início do ciclo, último resultado e resultados por boss.

### 4. Início diário às 00h

O toggle “Iniciar às 00h” usa a data civil de `America/Sao_Paulo`, independentemente do fuso do computador.

- Ao ativar pela primeira vez, salva a data atual sem iniciar imediatamente.
- Quando a data de Brasília mudar, prepara um novo ciclo.
- Se a stamina estiver abaixo de 90 minutos, não grava o novo dia e continua aguardando.
- Assim que a stamina atingir 90 minutos, inicia, zera cursor/resultados e grava o dia.
- Se não houver conexão ou snapshot ainda, aguarda sem perder a virada.
- Sem cargas, o ciclo é iniciado, mas fica no estado “aguardando cargas”.

## Coordenação com as demais automações

O Auto Boss entra no início do scheduler unificado e tem prioridade sobre Auto Hunt e navegação por stamina.

- Enquanto estiver entrando ou lutando, Auto Hunt não pode enviar `stage` ou `mode`.
- Transfer, sell e abertura de Glooth Bag continuam bloqueados apenas durante transições de navegação; fora delas seguem as regras existentes.
- Ao concluir ou parar, as outras automações voltam a operar normalmente no próximo tick.
- O controlador não altera automaticamente configurações de Auto Hunt, Auto Sell, Helper, equipamentos ou build.

## Interface

### Estrutura

O painel mantém sua montagem na barra nativa do jogo e ganha navegação persistente:

- **Automação**;
- **Auto Boss**;
- **Desenvolvimento**, somente na build dev.

A tela Auto Boss contém:

- cabeçalho com status atual, stamina e cargas;
- botão `Iniciar`/`Parar`;
- toggle `Iniciar às 00h`;
- busca por nome;
- catálogo filtrável de bosses;
- fila ordenada;
- adicionar, remover, mover para cima e mover para baixo;
- drag-and-drop como conveniência em dispositivos com ponteiro;
- progresso `posição/total` e resultado visual por item.

Não haverá abas de preset, preparação, AutoBuild, Helper, set ou imbues.

### Linguagem visual

O painel será uma superfície operacional compacta inspirada no site Leviticus, sem copiar a landing inteira para dentro do jogo.

Tokens principais:

- fundo: `#050609`;
- superfície: `#0f1118`;
- superfície elevada: `#151823`;
- superfície ativa: `#1b1f2c`;
- texto: `#f5f6fa`, `#c5cad5`, `#8992a4`;
- violeta: `#8d78ff` e `#b4a7ff`;
- ciano: `#5ed9ff`;
- sucesso: `#63dfae`;
- atenção: `#ffb865`;
- linhas: branco translúcido entre 12% e 20%.

A marca Leviticus será embutida como SVG no bundle para não criar dependência de rede. A tipografia prioriza `Manrope Variable` quando disponível e usa `Segoe UI`/sans-serif como fallback. O layout mantém boa leitura em 420 px, adapta-se até 320 px e evita depender de hover.

Foco visível, nomes acessíveis, botões de reordenação por teclado e `prefers-reduced-motion` são requisitos de saída.

## Persistência e migração

A chave de storage permanece `baiakidle-helper-v1`. Novos campos recebem defaults seguros e são validados na leitura:

- Auto Boss desligado;
- início às 00h desligado;
- fila vazia;
- cursor zero;
- nenhum boss em luta;
- resultados vazios;
- data diária vazia.

Configurações antigas continuam válidas. IDs removidos do catálogo são descartados da fila sem impedir o carregamento das demais preferências.

## Tratamento de falhas

- Decoder ainda sem handshake: status “Aguardando estado do jogo”; nenhum comando é enviado.
- Socket fechado: mantém fila/runtime e aguarda reconexão.
- Falha ao enviar `boss`: libera o lock após timeout e tenta novamente respeitando o intervalo mínimo.
- Snapshot inválido ou incompleto: não assume zero cargas nem derrota; aguarda um estado válido.
- Boss removido do catálogo: pula e persiste a fila normalizada.
- Reload durante luta: restaura o boss em andamento e compara o bestiary quando o estado reaparecer.
- Reload depois da saída, antes do resultado: mantém a janela de confirmação e resolve sem entrar duas vezes.

## Testes e validação

O trabalho seguirá TDD para os módulos puros e para o controlador.

Cobertura mínima:

- migração das configurações existentes;
- normalização da fila;
- calendário de Brasília e virada de 00h;
- espera por stamina abaixo de 90 minutos;
- espera por cargas;
- salto de level e cooldown;
- trava contra entrada duplicada;
- restauração de luta após reload;
- vitória por incremento de bestiary;
- derrota imediata por morte;
- espera de quatro segundos antes de classificar derrota;
- conclusão e parada da fila;
- garantia de que os tipos nativos de Auto Boss não aparecem no código de produção;
- preservação das URLs e nomes dos artefatos de update.

Validação final:

1. suíte automatizada;
2. `npm run typecheck`;
3. `npm run build`;
4. inspeção do banner gerado;
5. busca por nomes públicos antigos e por contratos nativos proibidos;
6. verificação visual do painel em desktop e viewport estreita;
7. confirmação de que a alteração local preexistente em `src/socket.ts` foi preservada.

## Fora de escopo

- presets de Auto Boss;
- preparação de build, Helper, equipamentos, sets ou imbues;
- Boss Pass automático;
- alteração do repositório ou migração de releases;
- renomeação das chaves/IDs legados necessários ao updater e à persistência;
- uso ou integração com o Auto Boss nativo do jogo.

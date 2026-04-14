# Brasix v1.0 - Estudo de Convergencia com RdM

## Objetivo

Este documento registra o estudo da parte do RdM que monta a pagina principal do jogo e transforma esse estudo em uma especificacao inicial para uma versao simples v1.0 do jogo Brasix.

O objetivo nao e copiar o RdM. O objetivo e aproveitar apenas a arquitetura de tela, a separacao de componentes e os padroes de HUD que fazem sentido para Brasix, respeitando as divergencias centrais entre os dois jogos.

## Fontes lidas no RdM

Material principal lido:

- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\README.md`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\MANUAL.md`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\DEVELOPER_DOCUMENTATION.md`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\docs\ROTAS_E_TELAS.md`

Arquivos centrais da pagina principal do jogo no RdM:

- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\app\ui\server.py`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\app\ui\templates\game_ai_ui_v3.html`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\app\static\js\game-ai-ui-v3.js`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\app\static\js\game-preview.js`
- `C:\Users\Haroldo Duraes\Desktop\GOvGO\RdM\app\static\css\app.css`

## O que o RdM ensina sobre a pagina principal

## 1. O RdM organiza a experiencia real em uma tela unica

O RdM mantem a experiencia principal em uma unica tela de jogo, com o mapa como foco e com HUDs acoplados ao redor dele.

Essa tela combina:

- um setup inicial em overlay
- o mapa principal no centro
- um resumo do jogador humano ancorado na esquerda
- uma barra compacta dos demais jogadores ancorada embaixo
- logs de acoes fixos no canto superior direito ou acoplados aos jogadores
- overlays visuais do mapa para rotas, nos e navios
- modais especificos para decisoes, relatorios, configuracoes e inspecao

Licao estrutural para Brasix:

- a tela principal do jogo deve ser uma tela unica com mapa dominante
- os paineis nao devem competir com o mapa; devem orbitar o mapa
- a abertura da partida pode continuar separada em `/jogo/preparacao`, mas o runtime principal deve viver em uma tela de mapa unica

## 2. O RdM separa bem setup, HUD principal e drawers de jogador

No RdM, a pagina principal nao mistura tudo no mesmo bloco:

- a tela inicial e um overlay proprio de configuracao da partida
- o HUD principal tem poucos blocos persistentes
- os detalhes extras de cada jogador ficam em gavetas expandidas, nao em modais centrais

Isso reduz ruído na leitura da tela.

Licao estrutural para Brasix:

- a tela inicial de configuracao deve continuar como fluxo proprio
- a tela principal nao deve repetir toda a configuracao inicial
- os detalhes de cada jogador devem viver em gavetas acopladas aos cards dos jogadores, e nao em janelas grandes por padrao

## 3. O RdM usa uma barra de jogadores enxuta e gavetas acopladas a cada jogador

Esse e um dos pontos mais convergentes com Brasix.

No RdM:

- os jogadores aparecem em uma barra inferior compacta
- cada card mostra apenas dados essenciais
- ao clicar no jogador, abre uma gaveta acima do proprio card
- a gaveta mostra contrato, ativos, cartas e outros detalhes sem bloquear a tela inteira

Licao estrutural para Brasix:

- manter uma barra inferior com boxes compactos dos jogadores
- o jogador humano fica do lado esquerdo
- os demais jogadores ficam a direita
- cada jogador deve ter uma gaveta acima do seu proprio box
- a gaveta deve concentrar os detalhes operacionais daquele jogador

No Brasix, essa gaveta deve conter principalmente:

- dinheiro
- frota
- caminhoes em operacao
- fretes ativos
- fretes concluidos recentes
- rotas em execucao
- disponibilidade da frota
- indicadores de caixa e ocupacao

## 4. O RdM trata o log como componente independente de HUD

No RdM o log nao e um detalhe escondido do motor. Ele e um componente de primeira classe na UI.

O sistema estudado mostra:

- feed global fixo com tempo de vida configuravel
- opcao de log por jogador
- expiração automatica das entradas
- re-render independente do resto do HUD

Licao estrutural para Brasix:

- o jogo precisa de um sistema explicito de logs de runtime
- cada acao relevante precisa gerar evento visual legivel
- os logs podem existir em dois modos:
  - coluna fixa
  - log local por jogador
- o tempo de persistencia deve ser configuravel

No Brasix, os logs mais importantes sao:

- frete aceito
- frete recusado
- caminhao despachado
- caminhao carregando
- caminhao descarregando
- caminhao em rota
- entrega concluida
- manutencao ou indisponibilidade
- falta de caixa
- troca de sede, compra de caminhao ou expansao de frota

## 5. O RdM desenha os veiculos como overlay independente do mapa

No RdM:

- o mapa e uma camada
- rotas e nos sao overlays
- navios sao outra camada de overlay
- o runtime atualiza a posicao dos navios sem reconstruir toda a tela

Licao estrutural para Brasix:

- os caminhoes nao devem fazer parte do background do mapa
- os caminhoes devem ser entidades visuais em overlay
- a camada de overlay deve ser separada da camada base do mapa
- as atualizacoes de posicao precisam ser independentes do restante do HUD

Para Brasix isso significa:

- mapa base do Brasil com cidades e rede de rotas
- overlay de caminhos planejados ou em execucao
- overlay de caminhoes por jogador
- opcao de destacar um caminhao selecionado e sua rota atual

## 6. O RdM acerta ao manter o mapa como centro visual dominante

Mesmo com muitos componentes, o RdM mantem o mapa como elemento principal da tela.

Licao estrutural para Brasix:

- o mapa precisa ocupar quase toda a tela
- o HUD precisa ser compacto
- o jogo nao pode parecer um dashboard com um mapinha pequeno

Isso converge totalmente com a diretriz ja usada no Brasix.

## 7. O RdM usa um setup inicial forte, mas runtime enxuto

O setup do RdM e rico, mas depois que a partida comeca, a tela principal evita repetir decisoes de setup.

Licao estrutural para Brasix:

- `/jogo/preparacao` deve ficar como tela de abertura e montagem inicial
- depois disso, a tela principal deve focar em operar a empresa e nao em repetir configuracoes iniciais

## O que converge com Brasix

## a) Tela inicial

Convergencia:

- existe uma fase inicial antes da partida
- essa fase define os participantes da simulacao
- essa fase define parametros iniciais da empresa

Aplicacao em Brasix:

- manter `/jogo/preparacao` como tela inicial do jogo
- incorporar nessa tela a criacao da empresa
- incorporar escolha do numero de jogadores robos
- incorporar parametros iniciais do cenario e da simulacao

Campos minimos para v1.0 do Brasix:

- nome da empresa humana
- cor da empresa
- sede inicial
- capital inicial
- frota inicial
- quantidade de jogadores robos
- opcional: perfil geral dos robos

## b) Tela principal

Convergencia:

- mapa unico
- HUD orbitando o mapa
- gameplay concentrado na mesma tela

Aplicacao em Brasix:

- criar uma tela principal de jogo unica, dedicada ao runtime
- essa tela deve ser centrada no mapa do Brasil
- o mapa deve mostrar cidades, corredores, fluxo visual e caminhoes em movimento

## c) Auxiliares da tela principal

Convergencia:

- barra inferior de jogadores
- gavetas adicionais por jogador
- jogador humano destacado em uma zona propria

Aplicacao em Brasix:

- barra inferior com boxes compactos de todos os jogadores
- humano ancorado a esquerda
- robos agrupados a direita
- cada box com:
  - nome
  - cor
  - caixa
  - caminhoes ativos
  - fretes ativos
  - lucro ou receita recente
- cada box abre uma gaveta acima de si

## d) Logs por jogador ou em coluna fixa

Convergencia:

- log visivel e efemero
- log associado ao jogador e ao turno/tempo

Aplicacao em Brasix:

- log global fixo opcional
- log local por jogador opcional
- cada evento com timestamp do runtime
- tempo de persistencia configuravel

## e) Movimentacao de veiculos no mapa

Convergencia:

- o veiculo existe como objeto visual na tela
- a movimentacao e parte da leitura da simulacao

Aplicacao em Brasix:

- cada caminhao selecionado na preparacao vira uma unidade de runtime
- cada caminhao recebe posicao, rota, estado e jogador proprietario
- o mapa mostra esses caminhoes em execucao
- o HUD permite selecionar caminhoes e inspecionar cada operacao

## f) Cards de fretes e cards de caminhoes

Convergencia:

- o jogo precisa mostrar ativos e tarefas em cards compactos

Aplicacao em Brasix:

- cards de fretes por jogador
- cards de caminhoes por jogador
- os cards vivem na gaveta do jogador e nos modais/paineis de decisao

## O que NAO converge e deve ser respeitado como divergencia

## 1. Tempo

RdM:

- tempo discreto
- rodadas e turnos
- resolucao por jogador da vez

Brasix:

- tempo continuo
- simulacao em tempo real
- controles de velocidade: `||`, `>`, `>>`, `>>>`, `>>>>`

Consequencia:

- Brasix nao deve importar o motor de turnos do RdM
- Brasix deve importar apenas a arquitetura de HUD e de composicao da tela

## 2. Sorte e aleatoriedade

RdM:

- sorteio de permissao
- sorteio de origem/destino
- dados
- cartas de sorte/reves

Brasix:

- sem sorte
- sem reves aleatorio
- sem cartas
- sem dados

Consequencia:

- a camada de log e HUD do RdM e util
- a camada de eventos aleatorios do RdM nao deve ser levada para Brasix

## 3. Base de dados do mundo

RdM:

- combina dados fixos do tabuleiro com sorteio e regras economicas do jogo

Brasix:

- nasce dos editores e do runtime consolidado
- tudo deve vir de mapa, produtos, fretes, custos, frota e regras operacionais

Consequencia:

- o Brasix precisa continuar editor-first e runtime-first
- nada relevante deve depender de sorteio para existir no gameplay

## 4. Identidade visual

RdM:

- visual nautico proprio
- tipografia, tons, brilho e componentes proprios

Brasix:

- deve seguir a linguagem visual ja estabelecida pelos editores e viewers do repo
- precisa respeitar modo diurno e noturno

Consequencia:

- aproveitar estrutura de HUD, nao aproveitar aparencia visual

## Principios para a versao simples v1.0 do Brasix

## 1. O jogo de runtime deve ter duas telas principais

### Tela 1: Preparacao

Rota atual de base:

- `/jogo/preparacao`

Responsabilidades:

- criar a empresa humana
- definir sede inicial
- definir dificuldade geral e quantidade de robos
- selecionar frota inicial
- selecionar carteira inicial de fretes

### Tela 2: Jogo principal

Nova rota prevista:

- `/jogo`

Responsabilidades:

- executar a simulacao em tempo continuo
- mostrar mapa, caminhoes e operacoes
- mostrar situacao dos jogadores
- permitir pause, aceleracao e inspecao

## 2. Layout proposto para `/jogo`

### Estrutura geral

- centro dominante: mapa
- faixa superior compacta: controles globais
- coluna esquerda compacta: jogador humano
- canto ou coluna de logs: configuravel
- barra inferior: boxes dos jogadores

### Composicao recomendada

#### Topo

- tempo do runtime
- controle de velocidade `||`, `>`, `>>`, `>>>`, `>>>>`
- botao de pause
- botao de relatorio resumido
- botao de configuracoes

#### Lado esquerdo

- caixa atual da empresa humana
- sede atual
- caminhoes livres
- caminhoes em viagem
- fretes ativos
- receita recente
- gargalos ou alertas

#### Centro

- mapa do Brasil
- cidades
- overlay de rotas ativas
- overlay de caminhoes em movimento
- destaque da empresa/jogador selecionado

#### Barra inferior

- box do humano a esquerda
- boxes dos robos a direita
- cada box com dados resumidos
- cada box com gaveta expansivel acima do proprio box

#### Gaveta do jogador

Conteudo minimo da gaveta no Brasix:

- resumo financeiro
- cards de fretes ativos
- cards de fretes concluidos recentes
- cards de caminhoes
- fila de ociosidade ou disponibilidade
- pequeno log local do jogador

## 3. Modelo de runtime v1.0 para a UI

O runtime visual do Brasix precisa de objetos diretos de UI, sem depender de sorteio ou calculo disperso no frontend.

Estruturas minimas:

### `GameSessionRuntime`

- `session_id`
- `map_id`
- `clock_seconds`
- `speed_level`
- `paused`
- `players`
- `truck_units`
- `active_contracts`
- `completed_contracts_recent`
- `logs`

### `PlayerRuntime`

- `player_id`
- `name`
- `color`
- `is_human`
- `cash_brl`
- `hq_city_id`
- `fleet_total`
- `fleet_idle`
- `fleet_busy`
- `contract_count_active`
- `contract_count_completed_recent`
- `last_profit_delta_brl`

### `TruckUnitRuntime`

- `truck_unit_id`
- `display_number`
- `player_id`
- `truck_type_id`
- `current_city_id`
- `route_edge_ids`
- `route_progress`
- `status`
- `assigned_contract_id`
- `eta_seconds`

### `FreightContractRuntime`

- `contract_id`
- `player_id`
- `product_id`
- `origin_city_id`
- `destination_city_id`
- `assigned_truck_unit_id`
- `payload_t`
- `revenue_brl`
- `cost_brl_estimate`
- `started_at_seconds`
- `expected_finish_at_seconds`
- `status`

### `ActionLogEntry`

- `log_id`
- `player_id`
- `kind`
- `title`
- `detail`
- `created_at_seconds`
- `expires_at_seconds`

## 4. Componentes obrigatorios da UI v1.0

## 4.1 Setup inicial

- reusar a base de `/jogo/preparacao`
- acrescentar numero de robos
- fechar o pacote inicial da partida

## 4.2 Mapa principal

- mapa quase em tela cheia
- overlays separados para cidades, rotas e caminhoes
- selecao de jogador e de caminhao

## 4.3 Barra inferior de jogadores

- boxes compactos
- humano a esquerda
- robos a direita
- sem texto excessivo

## 4.4 Gavetas de jogador

- acopladas ao box do jogador
- abertas por clique
- nao modal por padrao

## 4.5 Feed de logs

- global ou por jogador
- expiracao automatica
- configuracao de persistencia

## 4.6 Cards de fretes

- titulo do frete
- origem e destino
- produto
- tonelagem
- caminhao vinculado
- receita prevista
- status

## 4.7 Cards de caminhoes

- numero do caminhao
- tipo/modelo
- cidade/rota atual
- frete vinculado
- status
- ETA

## 5. O que fica FORA da versao simples v1.0

Para manter o foco, a v1.0 simples do Brasix nao deve tentar reproduzir a profundidade total nem do RdM nem dos editores de autoria.

Ficam fora da v1.0 simples:

- eventos aleatorios
- reves
- cartas
- diplomacia complexa
- negociacao entre jogadores
- manutencao economica profunda por dezenas de tipos de despesa visiveis na UI
- modos de layout editavel ao estilo `?layout`
- relatorios analiticos extensos
- simulacao de instalacoes complexas

## 6. O que entra na v1.0 simples

## Escopo funcional minimo

### Inicio da partida

- criar empresa humana
- definir quantidade de robos
- escolher sede
- comprar frota inicial
- selecionar fretes iniciais

### Runtime continuo

- iniciar relogio
- pausar e acelerar
- despachar caminhoes
- mover caminhoes no mapa
- concluir fretes
- atualizar caixa
- registrar logs

### Leitura operacional

- ver onde esta cada caminhao
- ver que frete esta em curso
- ver quais jogadores estao ganhando ou travados
- abrir gavetas e comparar operacao dos jogadores

## 7. Sequencia recomendada de implementacao no Brasix

## Fase 1. Fechar a tela inicial de jogo

- consolidar `/jogo/preparacao`
- adicionar quantidade de robos
- gerar `GameSessionRuntime` inicial

## Fase 2. Criar shell da tela `/jogo`

- mapa central
- coluna compacta do humano
- barra inferior de jogadores
- gavetas vazias ou com dados mockados do runtime real

## Fase 3. Implementar logs e HUD de jogadores

- log global com TTL
- log local por jogador
- boxes e gavetas com dados reais

## Fase 4. Implementar overlay de caminhoes

- cada caminhao vira token no mapa
- posicao atualizada por tempo continuo
- selecao de caminhao e highlight de rota

## Fase 5. Implementar cards de fretes e cards de caminhoes

- gaveta do humano
- gavetas dos robos
- relacao explicita frete x caminhao

## Fase 6. Amarrar isso ao motor operacional real

- partida inicializada pelos dados de runtime
- simulacao continua
- receita e custos atualizados em tempo real

## 8. Decisao de produto

O RdM prova que a pagina principal do jogo funciona melhor quando:

- o mapa manda na tela
- o HUD e compacto
- os jogadores tem boxes resumidos
- os detalhes vivem em gavetas locais
- os logs sao visiveis e temporarios
- os veiculos sao objetos visuais do mapa

Essa e a parte que converge com Brasix e deve ser importada.

O que nao deve ser importado:

- o motor em turnos
- a sorte
- os dados
- os sorteios de contrato
- a identidade visual nautica

## 9. Decisao final para Brasix v1.0 simples

Brasix v1.0 simples deve ser definido assim:

- uma tela de preparacao separada
- uma tela principal unica com mapa dominante
- tempo continuo com pause e aceleracao
- barra inferior de jogadores
- gavetas por jogador
- logs temporarios
- caminhoes em overlay no mapa
- cards de fretes e de caminhoes por jogador
- visual proprio do Brasix, com modos diurno e noturno

Essa e a convergencia correta com RdM.

Nao e uma copia do RdM. E a importacao da arquitetura de tela certa para o Brasix.
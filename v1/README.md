# Brasix v1

Brasix v1 e a linha ativa de desenvolvimento do Brasix.

O foco desta pasta nao e apenas manter editores isolados. O objetivo real aqui e fazer o jogo funcionar: preparar o mundo jogavel, consolidar o runtime, viabilizar abertura, empresa, frota, fretes, operacao e adversarios controlados por robo.

Os editores, planners, viewers e inspetores continuam importantes, mas entram como ferramentas de suporte para autoria, calibracao, validacao e operacao do jogo.

## Resumo rapido

- stack principal: Python 3.12, FastAPI, Jinja2, Pydantic e frontend em JS/CSS vanilla
- backend principal: [app/ui/server.py](app/ui/server.py)
- carga de dados principal: [app/services/data_loader.py](app/services/data_loader.py)
- runtime consolidado do jogo: [app/game](app/game)
- mapa, catalogos e regras vivem majoritariamente em `json/`, `maps/` e `data/`
- superficie jogavel mais atual: `http://127.0.0.1:8000/jogo/v1-3`
- preparacao da partida: `http://127.0.0.1:8000/jogo/preparacao`
- inspetor tecnico do runtime: `http://127.0.0.1:8000/inspector/runtime`

## O que a v1 ja e hoje

Brasix v1 ja tem uma base consideravel de jogo e de autoria.

### No jogo

- tela de preparacao da partida em `/jogo/preparacao` e `/game/setup`
- runtime jogavel versionado, com foco atual em `/jogo/v1-3` e `/game/v1-3`
- modo de operacao so com robos em `/robo/v1-3`
- abertura com configuracao inicial, empresa humana, robo-only e fluxos separados de setup
- runtime com mapa, empresas, frota, contratos, log, drawer operacional e analytics
- sistema declarativo de configuracao de robos com presets, arquetipos, sliders e aplicacao real no runtime
- analytics internos com abas de geral, jogador, empresas, fretes, caminhoes, produtos e cidades

### Nas ferramentas de suporte

- hub central de ferramentas em `/editores`
- editor de mapa v1.1 e editor de mapa v2
- editor de cidade ligado ao mapa ativo
- editor de fretes orientado pelo mundo jogavel
- planner de rotas sobre a rede ativa
- editor de custos de diesel
- editor de precos do runtime
- products v3 como editor atual de produto + operacional
- viewer de caminhoes
- matriz produto x caminhao
- editor operacional de caminhoes
- inspetor tecnico do runtime consolidado

## Como pensar o projeto

Se voce estiver entrando agora na v1, a leitura correta e esta:

- o centro do projeto e o jogo
- os editores existem para alimentar o jogo
- o runtime deve nascer das fontes de autoria, nao de dados paralelos mantidos a mao
- mapas, produtos, caminhoes, precos e custos precisam convergir para um mesmo pacote jogavel

Em outras palavras: a v1 nao e so uma colecao de telas. Ela ja funciona como pipeline de autoria + runtime do Brasix.

## Superficies principais

### Jogo e runtime

- `http://127.0.0.1:8000/jogo/preparacao`
- `http://127.0.0.1:8000/game/setup`
- `http://127.0.0.1:8000/jogo/v1-3`
- `http://127.0.0.1:8000/game/v1-3`
- `http://127.0.0.1:8000/robo/v1-3`

### Ferramentas de autoria e calibracao

- `http://127.0.0.1:8000/editores`
- `http://127.0.0.1:8000/editor/map_v1_1`
- `http://127.0.0.1:8000/editor/map-v2`
- `http://127.0.0.1:8000/editor/cidade`
- `http://127.0.0.1:8000/editor/fretes`
- `http://127.0.0.1:8000/editor/custos`
- `http://127.0.0.1:8000/editor/precos`
- `http://127.0.0.1:8000/planner/route`

### Catalogos operacionais

- `http://127.0.0.1:8000/editor/products_v3`
- `http://127.0.0.1:8000/viewer/trucks`
- `http://127.0.0.1:8000/viewer/truck-product-matrix`
- `http://127.0.0.1:8000/viewer/truck-operations`

### Inspecao tecnica

- `http://127.0.0.1:8000/inspector/runtime`
- `http://127.0.0.1:8000/api/health`
- `http://127.0.0.1:8000/api/game/runtime`
- `http://127.0.0.1:8000/api/game/runtime/bootstrap`
- `http://127.0.0.1:8000/api/game/runtime/validation`

### Versoes antigas ainda expostas

As versoes anteriores de runtime ainda existem para comparacao e continuidade de trabalho:

- `/jogo`
- `/game`
- `/jogo/v1-1`
- `/game/v1-1`
- `/jogo/v1-2`
- `/game/v1-2`
- `/robo/v1-2`

Hoje, a referencia mais importante para gameplay e interface e a trilha v1.3.

## O runtime v1.3 em uma frase

O runtime v1.3 e a primeira superficie onde mapa, empresa, frota, fretes, operacao, robos e analytics aparecem juntos como jogo, e nao apenas como dados de editor.

### O que ele ja cobre

- abertura da partida
- empresa humana e/ou mesa so com robos
- selecao e configuracao inicial
- contratos e operacao sobre o mapa
- compra e uso de frota
- continuidade de fretes e reposicionamento
- HUD, drawer e log operacional
- configuracao de robos por modo, arquetipo e parametros
- analytics internos de runtime

### O que isso nao significa

- ainda nao e a versao final do jogo
- ainda nao existe todo o meta-jogo de empresa, save e progressao consolidado
- ainda coexistem versoes paralelas e pontos de integracao em evolucao

## IA de robos v1.3

O sistema de robos da v1.3 nao e IA generativa nem aprendizado de maquina.

Ele funciona como IA declarativa por score ponderado:

- perfis montados por arquetipo, presets e overrides manuais
- familias de parametros em **Personalidade**, **Visao**, **Negociacao** e **Habilidades**
- engine que ranqueia candidatos com base em sinais do contexto logistico
- impacto real na escolha de sede, fretes da abertura, proximo frete e recuperacao operacional

Documentacao detalhada:

- [BRASIX_ROBOS_V1_3_EXPLICACAO.md](BRASIX_ROBOS_V1_3_EXPLICACAO.md)

## Arquitetura da v1

### Backend

- [app/ui/server.py](app/ui/server.py) centraliza as rotas HTML e APIs da v1
- [app/services/data_loader.py](app/services/data_loader.py) concentra a maior parte dos loaders e da composicao de catalogos
- [app/game](app/game) concentra os modelos e a consolidacao do runtime do jogo
- [app/maptools](app/maptools) concentra grafo, modelos e logica de rede/roteamento

### Frontend

- templates Jinja2 em [app/ui/templates](app/ui/templates)
- controladores JS em [app/static/js](app/static/js)
- estilos em [app/static/css](app/static/css)

### Dados

- `maps/`: bundles persistidos do mapa ativo e suas variacoes
- `json/`: catalogos versionados, configuracoes de jogo, layout e documentos auxiliares
- `data/`: dados consolidados usados operacionalmente por algumas camadas do runtime
- `assets/`: recursos visuais e apoio de UI

## Fontes de verdade mais importantes

Hoje, ao mexer na v1, estas fontes sao as mais importantes:

- mapa ativo e bundles persistidos em `maps/`
- backend e rotas da v1 em [app/ui/server.py](app/ui/server.py)
- consolidacao de dados em [app/services/data_loader.py](app/services/data_loader.py)
- runtime consolidado em [app/game](app/game)
- catalogo operacional de produtos em `json/game/product_operational_catalog.json`
- catalogo efetivo de caminhoes composto por base + custom + hidden + edits
- dados operacionais de caminhoes em `data/truck/merged_truck_data.json`

## Como rodar

### Requisitos

- Python 3.12+
- Windows, Linux ou macOS
- opcional: Docker, se voce quiser rodar OSRM localmente

### Instalacao

```powershell
python -m pip install -e .[dev]
```

### Subida local

```powershell
python run.py
```

Observacoes praticas:

- o servidor sobe em `127.0.0.1:8000`
- [run.py](run.py) verifica `/api/health` e tenta encerrar uma instancia anterior do proprio Brasix na mesma porta antes de subir outra
- `reload` esta desativado por padrao no entrypoint atual

### Check rapido

Se o servidor subiu corretamente:

- `http://127.0.0.1:8000/api/health`

## Fluxo recomendado para trabalhar na v1

1. Abra `http://127.0.0.1:8000/editores` para navegar pelas ferramentas.
2. Ajuste mapa, produtos, cidade, fretes, precos e frota conforme a necessidade.
3. Use `http://127.0.0.1:8000/jogo/preparacao` para montar a abertura.
4. Execute a rodada principal em `http://127.0.0.1:8000/jogo/v1-3`.
5. Quando precisar depurar a base consolidada, abra `http://127.0.0.1:8000/inspector/runtime`.

## Estrutura da pasta v1

- [app](app): codigo da aplicacao v1
- [app/ui](app/ui): rotas FastAPI, templates e APIs HTTP da v1
- [app/services](app/services): loaders, servicos, integracoes e consolidacao de dados
- [app/game](app/game): runtime consolidado, modelos e validacoes cruzadas
- [app/maptools](app/maptools): grafo, rede e modelos auxiliares de mapa/rota
- [app/static](app/static): JS, CSS e ativos de interface
- [assets](assets): recursos auxiliares de frontend
- [json](json): catalogos, regras e documentos versionados
- [maps](maps): bundles de mapa e persistencia de autoria
- [data](data): dados consolidados e operacionais
- [scripts](scripts): automacoes e utilitarios, incluindo OSRM local
- [tests](tests): testes automatizados da v1
- [run.py](run.py): entrypoint local do servidor
- [pyproject.toml](pyproject.toml): configuracao de projeto e dependencias

## Testes

Para rodar os testes:

```powershell
pytest
```

Cobertura existente na pasta [tests](tests):

- runtime do jogo
- city editor
- freight editor
- pricing editor
- diesel cost editor
- data loader
- route graph e route planner
- OSRM auto-route
- matriz produto x caminhao
- save operacional de produto
- autofill de cidade
- autofill operacional de caminhao
- geracao de imagem de caminhao

## OSRM e roteamento

O roteamento automatico dos editores de mapa depende de OSRM.

### O que existe hoje

- se `BRASIX_OSRM_BASE_URL` estiver definido no `.env`, o backend usa esse endereco
- o projeto aceita apontar para o demo publico do OSRM para testes rapidos
- para trabalho serio com rotas brasileiras, o caminho estavel recomendado e OSRM local

### Configuracao recomendada

```env
BRASIX_OSRM_BASE_URL=http://127.0.0.1:5000
```

Script de apoio:

- [scripts/osrm/README.md](scripts/osrm/README.md)

## Situacao tecnica atual

Pontos fortes da v1 hoje:

- ha uma base consolidada de runtime
- a v1.3 ja une jogo, robos, analytics e operacao numa mesma superficie
- products v3, truck operations e matriz produto x caminhao ja funcionam como base operacional real
- mapa, rota, preco, custo e frete ja tem superficies concretas de autoria e validacao

Limites e riscos ainda presentes:

- ainda existe coexistencia de versoes antigas e novas dentro da mesma linha v1
- alguns fluxos ainda dependem de varios JSONs acoplados
- parte do balanceamento economico e da progressao da empresa continua em evolucao
- autofill por IA depende de servicos externos e nao e a base do jogo

## Principios que valem ao mexer nesta pasta

- jogo primeiro; ferramenta depois
- evitar criar fontes paralelas de dados quando o runtime pode ser consolidado a partir das fontes de autoria
- preservar consistencia entre mapa, produtos, caminhoes, precos e fretes
- tratar products v3, truck operations, matriz, mapa e fretes como infraestrutura do jogo
- preferir correcoes de integracao na raiz, e nao remendos locais em cada tela

## Documentos importantes

- [ROADMAP_JOGO.md](ROADMAP_JOGO.md)
- [BLOCO_0_PLANO_TECNICO.md](BLOCO_0_PLANO_TECNICO.md)
- [BRASIX_ROBOS_V1_3_EXPLICACAO.md](BRASIX_ROBOS_V1_3_EXPLICACAO.md)
- [FRETES_REALISMO_RECOMENDACOES.md](FRETES_REALISMO_RECOMENDACOES.md)
- [scripts/osrm/README.md](scripts/osrm/README.md)

## Resposta curta

Se precisar resumir a v1 em poucas palavras:

> Brasix v1 e a linha em que o projeto deixa de ser apenas um conjunto de editores e passa a operar como jogo em construcao, com runtime consolidado, superfices jogaveis versionadas, IA de robos, analytics e uma camada forte de ferramentas de autoria para sustentar esse mundo jogavel.# Brasix v1

Brasix v1 e a linha ativa de desenvolvimento do jogo. Aqui ficam as ferramentas de suporte, o runtime consolidado e os catalogos versionados que sustentam mapa, produtos, frota e regras operacionais do Brasix.

## O Que Ja Existe

### Ferramentas principais

- `/editores`: central de acesso das telas mais importantes
- `/editor/map_v1_1`: autoria do mapa ativo, cidades manuais, nos e rotas
- `/editor/map-v2`: fluxo avancado de mapa e roteamento
- `/editor/fretes`: geracao, calibracao e leitura visual de fretes representativos por produto
- `/planner/route`: planejamento de caminho sobre a rede ativa
- `/editor/products_v3`: editor atual de produtos e informacoes operacionais
- `/viewer/trucks`: biblioteca de caminhoes
- `/viewer/truck-product-matrix`: matriz de compatibilidade
- `/viewer/truck-operations`: editor operacional de frota
- `/inspector/runtime`: visualizacao tecnica do runtime do jogo

### Capacidades das ferramentas de suporte

- mapas persistidos como bundles em `v1/maps`
- catalogos e configuracoes versionados em `v1/json`
- runtime consolidado em `v1/app/game`
- editor de fretes baseado no mapa ativo e nas camadas baked de oferta e demanda
- roteamento automatico de rodovias via OSRM
- autofill de cidades manuais com Nominatim + IBGE
- autofill operacional de caminhoes
- autofill operacional de produtos no products v3

### Dados consolidados

- catalogo efetivo de caminhoes composto por base + custom + hidden + edits
- dados operacionais da frota concentrados em `v1/data/truck/merged_truck_data.json`
- catalogo operacional de produtos em `v1/json/game/product_operational_catalog.json`
- validacoes iniciais de runtime expostas em `/api/game/runtime/validation`

## Como Rodar

```powershell
python -m pip install -e .[dev]
python run.py
```

Depois abra uma das rotas abaixo:

- `http://127.0.0.1:8000/editores`
- `http://127.0.0.1:8000/editor/map_v1_1`
- `http://127.0.0.1:8000/editor/map-v2`
- `http://127.0.0.1:8000/editor/fretes`
- `http://127.0.0.1:8000/planner/route`
- `http://127.0.0.1:8000/editor/products_v3`
- `http://127.0.0.1:8000/viewer/trucks`
- `http://127.0.0.1:8000/viewer/truck-product-matrix`
- `http://127.0.0.1:8000/viewer/truck-operations`
- `http://127.0.0.1:8000/inspector/runtime`

## Estrutura

- `app/ui`: rotas FastAPI, templates e APIs das ferramentas de suporte do jogo
- `app/services`: carga de dados, roteamento, autofill e integracoes
- `app/game`: modelos, builder e validadores do runtime
- `json`: catalogos, layouts, textos de tela e matrizes
- `maps`: mapas ativos e bundles de autoria
- `data`: dados operacionais consolidados
- `scripts`: apoio operacional, incluindo trilha de OSRM local
- `tests`: cobertura de servicos e integracoes centrais

## Improvements Ja Entregues nesta linha

- central de editores com navegacao limpa e tema diurno/noturno
- runtime inspector com visualizacao estruturada do mundo jogavel
- products v3 como base atual para edicao economica e operacional de produtos
- editor de fretes com geracao e calibracao de fluxos O/D representativos sobre o mapa ativo
- truck operations como base atual para dados operacionais da frota
- matriz produto x caminhao como camada canonica de compatibilidade
- ampliacao da cobertura do autofill geografico e operacional

## O Que Falta

1. consolidar o pacote oficial de mundo jogavel
2. concluir auditoria e preenchimento da frota operacional
3. criar motor de custo e frete integrado ao planner e aos fretes gerados
4. transformar os fretes calibrados em contratos e mercado jogavel
5. introduzir empresa, save e simulacao de viagem
6. abrir a primeira tela jogavel de despacho

## Referencias

- `ROADMAP_JOGO.md`
- `scripts/osrm/README.md`

# Brasix v1

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

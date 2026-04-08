# Brasix

Brasix e um jogo de logistica rodoviaria ambientado no Brasil. Os editores, planners, viewers e inspetores deste repositorio existem como ferramentas de suporte para construir, validar e operar o mundo do jogo.

O desenvolvimento ativo esta concentrado em `v1/`. A raiz do repositorio e `v0/` continuam como referencia historica e base comparativa.

## Estado Atual

Hoje o projeto ja possui um conjunto funcional de ferramentas de suporte ao desenvolvimento e a operacao do jogo:

- central de navegacao em `/editores`
- editor de mapa v1.1 em `/editor/map_v1_1`
- editor de mapa v2 em `/editor/map-v2`
- editor de fretes em `/editor/fretes`
- planejador de rotas em `/planner/route`
- editores de produtos v1, v2 e v3
- biblioteca de caminhoes em `/viewer/trucks`
- matriz caminhao x produto em `/viewer/truck-product-matrix`
- editor operacional de caminhoes em `/viewer/truck-operations`
- runtime inspector em `/inspector/runtime`
- endpoints tecnicos de runtime em `/api/game/runtime` e `/api/game/runtime/validation`

## Improvements Ja Entregues

### Ferramentas de suporte

- hub `/editores` com navegacao direta para as telas principais
- suporte consistente a tema diurno e noturno nas telas mais recentes
- base FastAPI + Jinja2 + JSON versionado consolidada em `v1/app`, `v1/json` e `v1/maps`

### Mapa e rede

- mapa ativo com cidades, nos extras, arestas e waypoints persistidos em bundles versionados
- editor de mapa v1.1 para autoria rapida da rede principal
- editor de mapa v2 para fluxos mais avancados de roteamento e geometria
- roteamento automatico via OSRM para rodovias editaveis
- autofill geografico de cidades manuais com Nominatim + IBGE

### Economia e produtos

- linha evolutiva de editores `products`, `products_v1`, `products_v2` e `products_v3`
- products v3 reorganizado em colunas fixas de detalhes, informacoes e criacao
- editor de fretes para gerar, calibrar e visualizar fretes representativos a partir das matrizes de oferta e demanda
- catalogo operacional de produtos em `v1/json/game/product_operational_catalog.json`
- autosave e autofill assistido para dados operacionais e sazonalidade

### Frota

- biblioteca efetiva de caminhoes com catalogo base, customizacoes, ocultacoes e edits
- matriz de compatibilidade produto x caminhao como camada canonica de liberacao operacional
- editor operacional dedicado para preco, custos, dimensoes e metadados de operacao
- autofill operacional assistido para caminhoes

### Runtime do jogo

- pacote `v1/app/game` com modelos, builder e validacoes estruturais iniciais
- inspector visual do runtime para leitura e auditoria do mundo consolidado

## O Que Ainda Falta

Os proximos passos principais ja estao claros:

1. concluir a consolidacao do runtime unico do jogo
2. fechar a cobertura operacional da frota com restricoes, tempos e auditoria final dos dados
3. ligar rota, frota, produto e fretes a um motor de custo e frete
4. transformar os fretes gerados em mercado, clientes e contratos jogaveis
5. introduzir empresa, caixa, disponibilidade e save do jogador
6. abrir a primeira tela jogavel de despacho e simulacao

O detalhamento desses blocos esta em `v1/ROADMAP_JOGO.md`.

## Como Rodar a Versao Atual

O caminho recomendado hoje e usar o app de `v1`.

```powershell
cd v1
python -m pip install -e .[dev]
python run.py
```

Depois abra:

- `http://127.0.0.1:8000/editores`
- `http://127.0.0.1:8000/editor/map_v1_1`
- `http://127.0.0.1:8000/editor/fretes`
- `http://127.0.0.1:8000/editor/products_v3`
- `http://127.0.0.1:8000/viewer/truck-operations`
- `http://127.0.0.1:8000/inspector/runtime`

## Estrutura do Repositorio

- `app/`: base original da aplicacao na raiz
- `v0/`: snapshot intermediario da linha anterior
- `v1/`: linha atual de desenvolvimento do Brasix
- `v1/app/`: backend, templates, servicos e runtime do jogo
- `v1/json/`: catalogos, configuracoes de UI e matrizes versionadas
- `v1/maps/`: mapas ativos e bundles persistidos
- `v1/data/`: dados consolidados de apoio, incluindo frota operacional
- `dados/`: fontes brutas e materiais de apoio

## Notas de Infraestrutura

- o editor de mapa usa OSRM para gerar geometria automatica de rodovias
- o projeto ja possui trilha para uso de OSRM local em `v1/scripts/osrm`
- o autofill geografico de cidades usa Nominatim + IBGE

## Leitura Recomendada

- `v1/README.md`
- `v1/ROADMAP_JOGO.md`
- `v1/scripts/osrm/README.md`

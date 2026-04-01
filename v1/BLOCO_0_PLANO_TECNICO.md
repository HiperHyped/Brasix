# Brasix v1 - Bloco 0 Plano Tecnico

## Objetivo

Preparar uma base de runtime unica para o jogo a partir das ferramentas de autoria que ja existem.

O objetivo deste bloco nao e criar gameplay. O objetivo e garantir que o jogo possa consumir mapa, rede, produtos e caminhoes a partir de um contrato unico, validado e previsivel.

## Escopo do Bloco 0

O Bloco 0 cobre quatro entregas tecnicas:

1. definir o pacote de runtime do jogo.
2. consolidar dados vindos dos editores atuais.
3. validar referencias cruzadas entre dominios.
4. expor esse pacote para os proximos blocos e para testes.

## Parte Visual do Bloco 0

O Bloco 0 nao e, por natureza, um bloco de interface. Ele e majoritariamente estrutural.

Portanto, a resposta curta e:

- nao deve nascer aqui uma tela nova de jogo.
- nao deve nascer aqui um editor novo.
- nao deve nascer aqui um painel pesado de operacao.

Se houver alguma parte visual neste bloco, ela deve ser apenas uma superficie tecnica minima para inspecao do runtime consolidado.

Essa superficie, se for criada, deve servir apenas para:

- mostrar mapa ativo, contagens e fontes de dados.
- mostrar status de validacao do runtime.
- listar erros e avisos estruturais.
- ajudar a depurar integracao entre mapa, produtos e caminhoes.

Mesmo nesse caso, ela deve seguir estas regras:

- usar o mesmo design-base das ferramentas atuais.
- respeitar modos diurno e noturno.
- ser compacta e objetiva.
- ter o minimo possivel de frases e explicacoes.
- focar em status, contagem, erros e acoes tecnicas.

Conclusao pratica:

- a primeira meta do Bloco 0 e backend e contrato de runtime.
- a parte visual, se existir, entra apenas no fim do bloco como inspetor tecnico enxuto.

## Fontes de Verdade Atuais

### Mapa e rede

- mapa ativo e bundles em [v1/app/services/map_repository.py](v1/app/services/map_repository.py).
- modelo principal do mapa em `MapBundleDocument`.
- rede ativa no campo `route_network` do bundle.
- acesso principal por `load_active_map_bundle()`.

### Produtos

- catalogo mestre em [v1/app/services/data_loader.py](v1/app/services/data_loader.py) via `load_product_catalog_v2_master_payload()`.
- familias, tipos logisticos, matrizes e regras auxiliares no mesmo loader.
- seeds e arquivos atuais em [v1/json/game/product_catalog_v2.json](v1/json/game/product_catalog_v2.json), [v1/json/game/product_family_catalog.json](v1/json/game/product_family_catalog.json), [v1/json/game/product_logistics_type_catalog.json](v1/json/game/product_logistics_type_catalog.json), [v1/json/game/city_product_supply_matrix.json](v1/json/game/city_product_supply_matrix.json) e [v1/json/game/city_product_demand_matrix.json](v1/json/game/city_product_demand_matrix.json).

### Caminhoes

- catalogo efetivo em [v1/app/services/data_loader.py](v1/app/services/data_loader.py) via `load_effective_truck_type_catalog_payload()`.
- implementos em [v1/json/truck_body_catalog.json](v1/json/truck_body_catalog.json).
- categorias auxiliares, edicoes, ocultacoes e customizacoes no mesmo loader.

### Planner e grafo

- o planner ja consome mapa ativo e rede em [v1/app/services/route_planner.py](v1/app/services/route_planner.py).
- o grafo de rotas fica em [v1/app/maptools/graph.py](v1/app/maptools/graph.py).

## Decisao Tecnica Central

O runtime do jogo deve ser gerado a partir das fontes de autoria, e nao mantido manualmente em paralelo.

Isso evita criar um quinto conjunto de dados com risco de ficar desatualizado. A proposta e:

- gerar o pacote de runtime sob demanda.
- permitir exportacao ou snapshot apenas como ferramenta auxiliar.
- manter mapa, produtos e caminhoes como fontes primarias.

## Proposta de Estrutura de Codigo

### Novo pacote sugerido

Criar um pacote novo em `v1/app/game/` com responsabilidade explicita de runtime de jogo.

Arquivos sugeridos:

- `v1/app/game/__init__.py`
- `v1/app/game/models.py`
- `v1/app/game/runtime.py`
- `v1/app/game/validators.py`

### Responsabilidades

#### `models.py`

Modelos Pydantic do pacote consolidado.

Modelos sugeridos:

- `GameWorldMetadata`
- `GameWorldMapSnapshot`
- `GameWorldProductSnapshot`
- `GameWorldTruckSnapshot`
- `GameWorldCatalogSnapshot`
- `GameWorldRuntimeDocument`
- `GameWorldValidationIssue`
- `GameWorldValidationReport`

#### `runtime.py`

Servico que monta o pacote de runtime usando os loaders e repositorios ja existentes.

Funcoes sugeridas:

- `build_game_world_runtime()`
- `build_game_world_metadata()`
- `build_game_world_map_snapshot()`
- `build_game_world_product_snapshot()`
- `build_game_world_truck_snapshot()`

#### `validators.py`

Validacao cruzada entre dominios.

Funcoes sugeridas:

- `validate_game_world_runtime()`
- `validate_map_snapshot()`
- `validate_product_snapshot()`
- `validate_truck_snapshot()`
- `validate_cross_domain_references()`

## Estrutura Sugerida do Runtime

### Documento principal

O runtime consolidado deve conter, no minimo:

- `id`
- `version`
- `generated_at`
- `source_summary`
- `map`
- `products`
- `trucks`
- `catalogs`
- `validation`

### Bloco `map`

Deve incluir:

- `active_map_id`
- `active_map_name`
- `cities`
- `route_network`
- `graph_node_count`
- `edge_count`

Fonte principal:

- `load_active_map_bundle()`

### Bloco `products`

Deve incluir:

- `catalog`
- `family_catalog`
- `logistics_type_catalog`
- `supply_matrix`
- `demand_matrix`
- `region_supply_matrix`
- `inference_rules`
- `active_product_ids`

Fonte principal:

- `load_product_catalog_v2_master_payload()`

### Bloco `trucks`

Deve incluir:

- `type_catalog`
- `body_catalog`
- `category_catalog`
- `active_truck_type_ids`

Fonte principal:

- `load_effective_truck_type_catalog_payload()`

### Bloco `catalogs`

Deve reunir apenas o que o runtime precisa consultar rapidamente, evitando que cada modulo futuro vasculhe vários documentos dispersos.

Pode incluir:

- `product_family_by_id`
- `product_logistics_type_by_id`
- `truck_body_by_id`
- `city_by_id`

## Validacoes Minimas do Bloco 0

### Mapa

- ids de cidades unicos.
- ids de nos do grafo unicos.
- ids de rotas unicos.
- endpoints das rotas existem no mapa ativo.
- o grafo consegue ser instanciado sem erro.

### Produtos

- todo produto possui `id` unico.
- `family_id` existe no catalogo de familias.
- `logistics_type_id` existe no catalogo logistico.
- `compatible_body_type_ids` apontam para implementos existentes.
- matrizes de oferta e demanda so referenciam cidades e produtos validos.

### Caminhoes

- todo tipo de caminhao possui `id` unico.
- todo `canonical_body_type_ids` referencia implementos existentes.
- itens customizados e itens editados entram corretamente no catalogo efetivo.

### Cruzado entre dominios

- para cada produto ativo, existe pelo menos um implemento compativel valido.
- para cada implemento usado por produto, existe pelo menos um tipo de caminhao ativo capaz de usa-lo.
- toda cidade usada em matrizes existe no mapa ativo.
- o planner consegue construir o grafo com o mapa ativo consolidado.

## Proposta de API Tecnica do Bloco 0

O Bloco 0 ainda nao precisa de uma tela nova. Mas vale expor APIs tecnicas para depuracao e para os proximos blocos.

Endpoints sugeridos:

- `GET /api/game/runtime`
- `GET /api/game/runtime/validation`

Objetivo:

- inspecionar o pacote consolidado.
- verificar validacoes sem depender de logs ou debug manual.
- permitir que a futura tela do jogo carregue uma base unica.

## Sequencia de Implementacao Recomendada

### Etapa 1. Modelos de runtime

Criar os modelos do pacote consolidado e do relatorio de validacao.

Saida esperada:

- tipos claros para o runtime.

### Etapa 2. Consolidacao de dados

Implementar o builder do runtime usando:

- mapa ativo do repositorio.
- catalogo mestre de produtos.
- matrizes de oferta e demanda.
- catalogo efetivo de caminhoes.
- catalogos auxiliares.

Saida esperada:

- uma funcao unica que devolve o mundo jogavel consolidado.

### Etapa 3. Validacao cruzada

Implementar regras que gerem relatorio de problemas em vez de falhas silenciosas.

Saida esperada:

- um `GameWorldValidationReport` com erros e avisos.

### Etapa 4. Exposicao por API

Ligar o runtime consolidado ao servidor FastAPI para inspecao tecnica.

Saida esperada:

- endpoints tecnicos prontos para consumo interno.

### Etapa 5. Testes

Criar testes cobrindo:

- montagem do runtime.
- validacao de referencias cruzadas.
- integracao entre mapa, produtos e caminhoes.
- montagem do grafo com o mapa ativo.

Saida esperada:

- base confiavel para avancar aos proximos blocos.

## Arquivos que Provavelmente Serão Tocadas no Bloco 0

Arquivos novos sugeridos:

- `v1/app/game/__init__.py`
- `v1/app/game/models.py`
- `v1/app/game/runtime.py`
- `v1/app/game/validators.py`
- `v1/tests/test_game_runtime.py`

Arquivos existentes com chance de ajuste:

- [v1/app/ui/server.py](v1/app/ui/server.py)
- [v1/app/services/__init__.py](v1/app/services/__init__.py)

## Criterio de Pronto

O Bloco 0 esta concluido quando:

- o sistema monta um runtime unico do jogo a partir das fontes atuais.
- o runtime inclui mapa, produtos, caminhoes e catalogos auxiliares.
- a validacao cruzada identifica problemas estruturais.
- os endpoints tecnicos expõem esse runtime de forma previsivel.
- existe cobertura de testes suficiente para proteger a base.

## O que Vem Logo Depois

Quando o Bloco 0 estiver pronto, o passo natural e o Bloco 1.

Nesse ponto, a expansao do catalogo de caminhoes para dados operacionais fica simples, porque ja existira um runtime consolidado onde:

- produtos sabem seus tipos logisticos.
- implementos validos ja estao resolvidos.
- caminhoes ativos ja estao centralizados.
- mapa e rede ja estao no mesmo pacote.

Ou seja: o Bloco 0 nao cria o jogo, mas remove a maior fonte de risco estrutural antes do jogo comecar.
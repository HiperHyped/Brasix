# Recomendacoes de Realismo para Fretes

Data: 2026-04-13

## Ajustes de parametros aplicados agora

Arquivo alterado: `v1/json/game/pricing_editor/map_mapa-6-3.json`

Objetivo desta etapa: elevar o nivel de preco do mapa ativo sem alterar ainda a formula estrutural do frete.

### Mudancas aplicadas

| Parametro | Antes | Agora | Motivo |
| --- | ---: | ---: | --- |
| `base_rate_brl_per_tkm` | 0.32 | 0.40 | Eleva a base de mercado por tonelada-km. |
| `long_haul_discount_max` | 0.12 | 0.06 | Reduz o desconto excessivo em rotas longas. |
| `handling_base_brl` | 70.0 | 150.0 | Corrige subestimativa de custo operacional fixo por embarque. |
| `handling_per_t_brl` | 5.5 | 7.5 | Corrige subestimativa de custo variavel de manuseio. |
| `cycle_distance_multiplier` | 1.35 | 1.60 | Aproxima melhor o custo de ciclo, retorno e ineficiencias operacionais. |
| `specialization_bulk_multiplier` | 0.93 | 1.02 | Evita barateamento excessivo de granéis. |
| `specialization_general_multiplier` | 0.98 | 1.05 | Evita achatamento dos fretes de carga geral. |

## Diagnostico estrutural pendente

Os parametros acima melhoram o mapa ativo, mas nao resolvem o problema principal. O modelo atual ainda subprecifica varios fretes porque a formula ignora fatores operacionais que ja existem nos dados.

### Problemas principais identificados

1. A capacidade do caminhão esta sendo tratada quase so por peso, ignorando cubagem.
2. O piso usa o caminhão compativel mais barato, e nao o caminhão realmente atribuido ao contrato.
3. O custo usa distancia, mas praticamente nao usa duracao real da rota.
4. O custo nao incorpora corretamente tempos de carga e descarga.
5. A formula ainda nao considera pedagio, retorno vazio e desequilibrio de corredor.
6. O mapa e o planner ja possuem informacao de superficie e acesso viario, mas isso ainda nao entra no preco.
7. O valor agregado da carga ja entra de forma parcial, mas ainda fraca demais para diferenciar bem commodities de baixo valor e cargas nobres de alto valor.

## Valor agregado da carga

Este fator e importante e deve entrar no modelo.

### Situacao atual

Hoje o programa ja considera isso de forma parcial:

1. Existem multiplicadores por classe de valor do produto.
2. Existe um ajuste suave baseado no `price_reference_brl_per_unit` do catalogo.

Ou seja: o tema ja existe no modelo, mas com peso pequeno.

### Problema da implementacao atual

Do jeito atual, o efeito do valor agregado esta subdimensionado.

Consequencias:

1. Cargas baratas por tonelada, como milho, soja e outros alimentos basicos, nao ficam tao baratas quanto deveriam em relacao ao restante.
2. Cargas caras por tonelada, como eletronicos, medicamentos e itens muito visados, nao recebem premio suficiente de risco, seguro e seguranca.
3. O modelo mistura pouco o custo operacional com o custo de risco da mercadoria.

### Recomendacao

O ideal e separar duas coisas diferentes:

1. `custo_operacional`: distancia, tempo, cubagem, tipo de caminhão, pedagio, carga e descarga, retorno vazio, superficie.
2. `premio_de_valor_e_risco`: valor da carga, risco de roubo, necessidade de seguro, GRIS e ad valorem.

### Como modelar melhor

1. Calcular o valor da mercadoria por tonelada com base em `price_reference_brl_per_unit` e `weight_per_unit_kg`.
2. Calcular tambem o valor total embarcado no contrato.
3. Aplicar um premio adicional para cargas de maior valor por tonelada.
4. Aplicar um adicional separado para cargas com risco elevado de roubo ou avaria.
5. Manter esse efeito separado do custo de refrigeracao, perecibilidade, fragilidade e periculosidade, para evitar mistura de causas diferentes.

### Faixas sugeridas para o valor por tonelada

Estas faixas sao uma recomendacao inicial para a proxima etapa estrutural:

| Faixa de valor da carga | Referencia em R$/t | Multiplicador sugerido |
| --- | ---: | ---: |
| baixo valor | ate 3.000 | 0.94 a 1.00 |
| medio valor | 3.000 a 12.000 | 1.00 a 1.08 |
| alto valor | 12.000 a 40.000 | 1.08 a 1.18 |
| muito alto valor | acima de 40.000 | 1.18 a 1.35 |

### Adicional de risco sobre o valor da carga

Para o jogo, uma forma simples e realista de aproximar seguro, GRIS e ad valorem e aplicar um adicional percentual sobre o valor total da mercadoria embarcada.

Faixa sugerida:

1. baixo valor: 0.05% a 0.12% do valor embarcado
2. medio valor: 0.12% a 0.25% do valor embarcado
3. alto valor: 0.25% a 0.50% do valor embarcado
4. muito alto valor ou carga muito visada: 0.50% a 0.90% do valor embarcado

### Observacao importante

Valor agregado nao deve ser a unica explicacao do frete.

Exemplos:

1. Alimentos basicos secos tendem a ter premio de valor menor.
2. Alimentos pereciveis ou refrigerados podem continuar tendo frete alto por exigencia operacional, mesmo sem alto valor por tonelada.
3. Eletronicos podem ter frete alto mesmo sem precisar refrigeracao, por causa de risco, seguro e seguranca.

## Exemplos concretos do mapa ativo

### Embalagem

- Fluxo: Brasilia -> Salvador
- Quantidade: 24 t
- Volume por tonelada no catalogo: 5 m3
- Volume total estimado: 120 m3

Resultado: uma carreta bau 6x2 com 35 m3 nao consegue atender isso em uma unica viagem. Pela cubagem, esse fluxo pede varias viagens, mas a formula atual tende a contar apenas pelo peso.

### Moveis

- Fluxo: Brasilia -> Vitoria
- Quantidade: 10 t
- Volume por tonelada no catalogo: 6 m3
- Volume total estimado: 60 m3

Resultado: novamente a cubagem pressiona mais do que o peso. A formula atual tende a subprecificar.

## Mudancas estruturais recomendadas para a proxima etapa

### Prioridade 1

1. Calcular viagens pela maior restricao entre peso e volume.
2. Precificar o contrato pelo caminhão realmente selecionado ou atribuido.
3. Usar `total_duration_hours` da rota para formar custo de tempo, e nao apenas distancia.
4. Somar `load_time_minutes` e `unload_time_minutes` no custo operacional.

### Prioridade 2

1. Adicionar componente de pedagio por rota.
2. Adicionar fator de retorno vazio ou desequilibrio logistico entre origem e destino.
3. Adicionar penalidade operacional por superficie de rota e restricao de acesso do caminhão.
4. Reforcar a modelagem de valor agregado com premio de risco e seguro sobre o valor da mercadoria.

## Observacao

Esta etapa alterou apenas os parametros do mapa ativo. A formula de frete ainda nao foi modificada.
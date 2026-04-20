# Editor de Precos: Formulas, Algoritmo e Auditoria

Atualizado em 2026-04-17.

## Escopo

Este documento descreve como funcionam os parametros das abas `Sede` e `Frete` do editor de precos do mapa `map_mapa-6-3`, quais formulas o jogo usa de fato, e se cada parametro esta implementado e utilizado.

Fontes de verdade:

- Parametros atuais: `v1/json/game/pricing_editor/map_mapa-6-3.json`
- Formula de sede: `v1/app/static/js/shared/opening-pricing.js`
- Runtime do jogo: `v1/app/static/js/game-runtime-v1.js`
- Preview do editor: `v1/app/static/js/pricing-editor.js`
- Preview do setup inicial: `v1/app/static/js/game-setup.js`
- Bandas populacionais: `v1/json/map_editor_population_bands.json`
- Mapa ativo: `v1/maps/map_mapa-6-3/map_bundle.json`
- Metadados de produto injetados no runtime: `v1/app/services/data_loader.py`

## Resumo executivo

- Todos os parametros das abas `Sede` e `Frete` estao implementados.
- Todos esses parametros sao usados pelo runtime e pelo preview do editor.
- O mapa ativo exercita as faixas populacionais e tambem exercita os principais buckets de frete.
- Em 2026-04-17 foram corrigidas lacunas de modelagem no mapeamento de `value_class` e `logistics_type_id`.
- Em 2026-04-17 o preview do editor e o setup inicial tambem foram alinhados ao runtime, removendo um ajuste heuristico oculto por preco de referencia que nao existia no jogo em execucao.

## 1. Sede

### Algoritmo

Para cada cidade:

1. Determinar a faixa populacional da cidade.
2. Ler o `preco_base_faixa` correspondente.
3. Calcular um componente de populacao com escala logaritmica.
4. Calcular um componente de origem baseado em quantidade de fretes e volume de fretes saindo da cidade.
5. Calcular um componente de destino baseado em quantidade de fretes e volume de fretes entrando na cidade.
6. Combinar esses 3 componentes em um `score_cidade` ponderado.
7. Aplicar o teto da cidade sobre o score.
8. Multiplicar o preco-base da faixa por esse multiplicador.

### Formula exata

```text
score_origem = (w_count * count_origem_norm + w_volume * volume_origem_norm) / (w_count + w_volume)
score_destino = (w_count * count_destino_norm + w_volume * volume_destino_norm) / (w_count + w_volume)
pop = normalizacao(log(1 + population_thousands))

score_cidade = (
  w_pop * pop
  + w_origem * score_origem
  + w_destino * score_destino
) / (w_pop + w_origem + w_destino)

multiplicador_cidade = 1 + (city_multiplier_max * score_cidade)
preco_abertura = preco_base_faixa * multiplicador_cidade
```

### Valores atuais de `Sede`

#### Bases por faixa

| Parametro | Valor atual | Papel |
| --- | ---: | --- |
| `opening.band_base_prices_brl.population_band_up_to_250k` | 70.000 | Base da faixa `Ate 50 mil` |
| `opening.band_base_prices_brl.population_band_250k_to_500k` | 115.000 | Base da faixa `50 mil a 100 mil` |
| `opening.band_base_prices_brl.population_band_500k_to_1m` | 175.000 | Base da faixa `100 mil a 250 mil` |
| `opening.band_base_prices_brl.population_band_1m_to_2m` | 230.000 | Base da faixa `250 mil a 500 mil` |
| `opening.band_base_prices_brl.population_band_2m_plus` | 345.000 | Base da faixa `500 mil a 1 mi` |
| `opening.band_base_prices_brl.population_band_custom_1774572109092` | 470.000 | Base da faixa `1 mi a 2,5 mi` |
| `opening.band_base_prices_brl.population_band_custom_1774572109875` | 620.000 | Base da faixa `Acima de 2,5 mi` |

Observacao: os ids legacy `up_to_250k`, `250k_to_500k` etc. nao refletem mais os limites reais. Os limites reais das bandas estao em `v1/json/map_editor_population_bands.json`.

#### Drivers da sede

| Parametro | Valor atual | Papel na formula | Implementado | Usado |
| --- | ---: | --- | --- | --- |
| `opening.population_weight` | 0,50 | Peso da populacao no `score_cidade` | Sim | Sim |
| `opening.outbound_weight` | 0,58 | Peso do score de origem no `score_cidade` | Sim | Sim |
| `opening.inbound_weight` | 0,59 | Peso do score de destino no `score_cidade` | Sim | Sim |
| `opening.market_count_weight` | 0,45 | Peso da quantidade de fretes nos scores de origem/destino | Sim | Sim |
| `opening.market_volume_weight` | 0,65 | Peso do volume dos fretes nos scores de origem/destino | Sim | Sim |
| `opening.city_multiplier_max` | 0,65 | Teto do agio logistico da cidade | Sim | Sim |

### Observacoes de modelagem para `Sede`

- Os pesos sao normalizados. A magnitude absoluta nao importa; importa a proporcao.
- A populacao entra em escala logaritmica. Crescimento populacional muito alto tem retorno marginal decrescente.
- O mapa ativo cobre todas as bandas populacionais, de cidades muito pequenas ate cidades acima de 2,5 milhoes.

## 2. Frete

### Algoritmo

Para cada fluxo:

1. Encontrar o melhor caminhao compativel para o produto, no criterio de menor custo operacional.
2. Calcular o `preco_mercado`.
3. Calcular o `piso_operacional`.
4. Escolher `max(preco_mercado, piso_operacional)`.
5. Aplicar o bonus de sede no fim.

### Formula exata

```text
preco_mercado = quantidade_t * distancia_km * tarifa_base * fator_distancia * fator_especializacao * fator_produto

preco_piso = custo_operacional * floor_margin_multiplier

receita_jogador = max(preco_mercado, preco_piso) * (1 + bonus_sede)
```

### 2.1 Tarifa e distancia

| Parametro | Valor atual | Papel na formula | Implementado | Usado |
| --- | ---: | --- | --- | --- |
| `freight.base_rate_brl_per_tkm` | 0,40 | Tarifa-base por tonelada-quilometro | Sim | Sim |
| `freight.floor_margin_multiplier` | 1,12 | Margem minima sobre o custo operacional | Sim | Sim |
| `freight.short_haul_markup_max` | 0,50 | Premio maximo para rotas curtas | Sim | Sim |
| `freight.long_haul_discount_max` | 0,09 | Desconto maximo para rotas longas | Sim | Sim |
| `freight.short_haul_reference_km` | 500 | Distancia onde o premio curto vai a zero | Sim | Sim |
| `freight.long_haul_reference_km` | 2.500 | Distancia onde o desconto longo satura | Sim | Sim |

Formula do fator de distancia:

```text
short_share = max(0, 1 - min(distancia, short_ref) / short_ref)
long_share = 0, se distancia <= short_ref
long_share = min(1, (min(distancia, long_ref) - short_ref) / (long_ref - short_ref)), se distancia > short_ref

fator_distancia = 1 + short_share * short_haul_markup_max - long_share * long_haul_discount_max
```

Com os valores atuais:

```text
fator_distancia = 1 + short_share * 0,50 - long_share * 0,09
```

### 2.2 Operacao e sede

| Parametro | Valor atual | Papel na formula | Implementado | Usado |
| --- | ---: | --- | --- | --- |
| `freight.handling_base_brl` | 250 | Manuseio fixo por contrato | Sim | Sim |
| `freight.handling_per_t_brl` | 9 | Manuseio variavel por tonelada | Sim | Sim |
| `freight.cycle_distance_multiplier` | 1,75 | Converte distancia simples em distancia de ciclo | Sim | Sim |
| `freight.driver_daily_km` | 1.200 | Converte distancia de ciclo em dias de rota | Sim | Sim |
| `freight.hq_origin_bonus` | 0,25 | Bonus se a sede esta na origem | Sim | Sim |
| `freight.hq_destination_bonus` | 0,25 | Bonus se a sede esta no destino | Sim | Sim |
| `freight.hq_bonus_cap` | 0,19 | Teto da soma dos bonuses de sede | Sim | Sim |
| `freight.diesel_origin_weight` | 0,70 | Peso do diesel da origem no ajuste regional | Sim | Sim |
| `freight.diesel_destination_weight` | 0,70 | Peso do diesel do destino no ajuste regional | Sim | Sim |

Formula operacional:

```text
trips = max(1, ceil(quantidade_t / payload_t_do_caminhao))
cycle_distance = distancia_km * cycle_distance_multiplier
route_days = max(1, ceil((cycle_distance * trips) / driver_daily_km))

diesel_factor = clamp(0,75, 1,35,
  ((diesel_origem * peso_origem) + (diesel_destino * peso_destino))
  / ((peso_origem + peso_destino) * diesel_medio)
)

variable_cost_per_km = base_variable_cost_brl_per_km * (0,55 + 0,45 * diesel_factor)
variable_cost = trips * cycle_distance * variable_cost_per_km
fixed_cost = route_days * base_fixed_cost_brl_per_day
handling_cost = handling_base_brl + quantidade_t * handling_per_t_brl

custo_operacional = variable_cost + fixed_cost + handling_cost
preco_piso = custo_operacional * floor_margin_multiplier
```

Formula do bonus de sede:

```text
bonus_sede = min(hq_bonus_cap, bonus_origem + bonus_destino)
```

Observacao importante: com os valores atuais, `hq_origin_bonus` e `hq_destination_bonus` sao ambos maiores que `hq_bonus_cap`. Na pratica, qualquer acerto com a sede ja satura no teto de 19%.

### 2.3 Carga e risco

| Parametro | Valor atual | Papel na formula | Implementado | Usado |
| --- | ---: | --- | --- | --- |
| `freight.specialization_bulk_multiplier` | 0,98 | Multiplicador para bucket `bulk` | Sim | Sim |
| `freight.specialization_general_multiplier` | 1,01 | Multiplicador para bucket `general` | Sim | Sim |
| `freight.specialization_palletized_multiplier` | 1,14 | Multiplicador para bucket `palletized` | Sim | Sim |
| `freight.specialization_refrigerated_multiplier` | 1,63 | Multiplicador para bucket `refrigerated` | Sim | Sim |
| `freight.specialization_tank_multiplier` | 1,43 | Multiplicador para bucket `tank` | Sim | Sim |
| `freight.specialization_live_multiplier` | 1,54 | Multiplicador para bucket `live` | Sim | Sim |
| `freight.specialization_hazardous_multiplier` | 1,67 | Multiplicador para bucket `hazardous` | Sim | Sim |
| `freight.value_class_medium_multiplier` | 1,12 | Multiplicador de valor para bucket `medium` | Sim | Sim |
| `freight.value_class_high_multiplier` | 1,23 | Multiplicador de valor para bucket `high` | Sim | Sim |
| `freight.perishable_multiplier` | 1,64 | Adicional para produtos pereciveis | Sim | Sim |
| `freight.fragile_multiplier` | 1,14 | Adicional para produtos frageis | Sim | Sim |
| `freight.temperature_control_multiplier` | 1,10 | Adicional para temperatura controlada | Sim | Sim |
| `freight.hazardous_multiplier` | 1,33 | Adicional para risco quimico | Sim | Sim |

Formula do fator de produto:

```text
fator_produto = valor * perecivel * fragil * temperatura * perigoso
```

### Mapeamento de `logistics_type_id` para bucket de precificacao

O schema de produto tem mais tipos logisticos do que o modelo de precificacao. Por isso o runtime colapsa esses tipos em 7 buckets economicos.

| logistics_type_id | Bucket economico usado no preco |
| --- | --- |
| `granel_seco` | `bulk` |
| `granel_mineral` | `bulk` |
| `cana_in_natura` | `bulk` |
| `granel_liquido` | `tank` |
| `granel_gasoso_pressurizado` | `tank` |
| `carga_geral_paletizada` | `palletized` |
| `carga_geral_perecivel` | `palletized` |
| `carga_valiosa` | `palletized` |
| `transporte_veiculos` | `palletized` |
| `frigorificado` | `refrigerated` |
| `animais_vivos` | `live` |
| `carga_aberta` | `general` |

Regra adicional: se o produto tiver `temperature_control_required = true`, ele vai para `refrigerated` mesmo antes do fallback por `logistics_type_id`. Se o produto tiver `hazardous = true`, ele vai para `hazardous` antes do fallback por `logistics_type_id`.

### Mapeamento de `value_class` para bucket de precificacao

| value_class do catalogo | Bucket economico usado no preco |
| --- | --- |
| `medium` | `medium` |
| `high` | `high` |
| `premium` | `high` |
| `strategic` | `high` |
| outros | sem multiplicador de valor |

## 3. Cobertura real no mapa ativo

O mapa `map_mapa-6-3` exerce na pratica os principais buckets economicos.

Exemplos de fretes presentes no mapa ativo:

- `soja` em `v1/json/game/freight_editor/map_mapa-6-3.json`: bucket `bulk`
- `aves` em `v1/json/game/freight_editor/map_mapa-6-3.json`: bucket `live`
- `carne`, `leite` e `pesca` em `v1/json/game/freight_editor/map_mapa-6-3.json`: bucket `refrigerated` e adicionais de perecibilidade/temperatura
- `etanol` e `gas-natural` em `v1/json/game/freight_editor/map_mapa-6-3.json`: bucket `tank`
- `fertilizante` em `v1/json/game/freight_editor/map_mapa-6-3.json`: adicional de `hazardous`
- `bebida`, `eletronicos` e `veiculos` em `v1/json/game/freight_editor/map_mapa-6-3.json`: bucket `palletized`, com combinacoes de valor alto e fragilidade

Conclusao pratica: os parametros nao estao apenas implementados; eles tambem entram em operacao com o conjunto de fretes atual do mapa.

## 4. Lacunas de modelagem corrigidas em 2026-04-17

### 4.1 `value_class = premium/strategic`

Antes:

- o loader do servidor produzia produtos com `value_class = premium` e `value_class = strategic`
- a formula de frete so tratava `medium` e `high`
- esses produtos nao recebiam multiplicador de valor por essa via

Agora:

- `premium` e `strategic` sao tratados no bucket economico `high`
- o multiplicador `freight.value_class_high_multiplier` passa a valer tambem para eles

### 4.2 `logistics_type_id = carga_valiosa/transporte_veiculos`

Antes:

- `eletronicos`, `veiculos`, `ouro` e outros tipos valiosos ou dedicados podiam cair por fallback em `general`
- isso ignorava a existencia de uma especializacao operacional mais cara

Agora:

- `carga_valiosa` e `transporte_veiculos` sao mapeados explicitamente para o bucket economico `palletized`
- `cana_in_natura` tambem passou a ter mapeamento explicito para `bulk`
- `carga_aberta` passou a ter mapeamento explicito para `general`, deixando claro que hoje ela compartilha esse bucket por falta de parametro proprio

### 4.3 Consistencia entre runtime e previews

Antes:

- `pricing-editor.js` e `game-setup.js` aplicavam um multiplicador heuristico oculto baseado em `price_reference_brl_per_unit`
- esse ajuste nao existia no runtime do jogo

Agora:

- runtime, pricing editor e setup inicial usam a mesma modelagem economica parametrizada
- o `.md` pode ser lido como descricao fiel do que o jogo realmente faz

## 5. Veredito final

### Sede

- Todos os parametros estao implementados.
- Todos os parametros estao sendo usados.

### Frete

- Todos os parametros estao implementados.
- Todos os parametros estao sendo usados.
- As lacunas de mapeamento entre catalogo de produtos e buckets economicos foram corrigidas em 2026-04-17.

## 6. Observacoes finais

- O teto de bonus de sede hoje comprime os bonuses de origem e destino no mesmo valor efetivo de 19%.
- Os pesos de populacao, origem e destino sao relativos; so a proporcao entre eles altera o resultado.
- Os pesos de diesel de origem e destino tambem sao relativos; com `0,70` e `0,70`, o efeito pratico atual e uma media 50/50 entre origem e destino.
# Prompt de Agente Paralelo: Pesquisa Operacional da Frota Sem Acesso a Arquivos

Voce e um agente de pesquisa especializado em transporte rodoviario de cargas no Brasil. Sua tarefa e montar uma base operacional inicial para a frota do jogo Brasix.

## Objetivo

Pesquisar, normalizar e consolidar para cada tipo de caminhao efetivo do jogo os seguintes campos:

- capacidade de peso util em kg
- capacidade volumetrica util em m3
- altura total em metros
- largura total em metros
- comprimento total em metros

## Regra critica de escopo

Voce NAO tem acesso ao repositorio nem a arquivos locais.

Portanto, para esta execucao, trate a lista abaixo como a entrada autoritativa da frota efetiva atual do jogo.

Esta lista ja considera:

- catalogo base
- catalogo custom
- exclusoes de tipos ocultos
- edits de label, porte, estrutura e eixo aplicados

Importante:

- esta lista e um snapshot operacional desta execucao
- no futuro ela pode crescer ou mudar
- para esta pesquisa, use exatamente esta lista e nao tente descobrir outros tipos fora dela
- tipo oculto conhecido e excluido desta rodada: `truck_type_carreta_ls` (`Carreta simples / LS`)

## Lista autoritativa da frota para esta execucao

Total esperado: 34 tipos.

```json
[
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_25",
    "label": "Camionete",
    "size_tier": "super_leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_26",
    "label": "Pick-up",
    "size_tier": "super_leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_24",
    "label": "Van",
    "size_tier": "super_leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_custom_van",
    "canonical_body_type_ids": ["truck_body_custom_van"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_31",
    "label": "Van Refrigerada",
    "size_tier": "super_leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_frigorifico",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_vuc_4x2",
    "label": "VUC",
    "size_tier": "super_leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_carga_seca", "truck_body_sider", "truck_body_frigorifico"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_22",
    "label": "VUC carroceria aberta",
    "size_tier": "super_leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_carga_seca",
    "canonical_body_type_ids": ["truck_body_carga_seca"]
  },
  {
    "truck_type_id": "truck_type_toco_leve_4x2",
    "label": "Toco leve aberto",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_carga_seca",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_carga_seca", "truck_body_sider", "truck_body_frigorifico"]
  },
  {
    "truck_type_id": "truck_type_toco_leve_eletrico_4x2",
    "label": "Toco leve bau",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_carga_seca", "truck_body_sider", "truck_body_frigorifico"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_32",
    "label": "Toco Leve Refrigerado",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_frigorifico",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_34",
    "label": "Toco Leve Tanque",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_tanque",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_33",
    "label": "Toco Medio Refrigerado",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_frigorifico",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_toco_medio_4x2",
    "label": "Toco medio",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_carga_seca", "truck_body_frigorifico", "truck_body_tanque"]
  },
  {
    "truck_type_id": "truck_type_toco_semipesado_4x2",
    "label": "Toco semipesado 4x2",
    "size_tier": "leve",
    "base_vehicle_kind": "rigido",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_carga_seca",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_carga_seca", "truck_body_graneleiro", "truck_body_frigorifico", "truck_body_tanque"]
  },
  {
    "truck_type_id": "truck_type_bitruck_vocacional_8x4",
    "label": "Bitruck aberto 8x2",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "8x4",
    "preferred_body_type_id": "truck_body_carga_seca",
    "canonical_body_type_ids": ["truck_body_basculante", "truck_body_betoneira", "truck_body_munck", "truck_body_prancha"]
  },
  {
    "truck_type_id": "truck_type_bitruck_8x2",
    "label": "Bitruck Bau 8x2",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "8x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_container", "truck_body_tanque", "truck_body_carga_seca"]
  },
  {
    "truck_type_id": "truck_type_offroad_6x6",
    "label": "Bitruck basculante 8x4",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "8x4",
    "preferred_body_type_id": "truck_body_basculante",
    "canonical_body_type_ids": ["truck_body_basculante", "truck_body_prancha", "truck_body_munck", "truck_body_madeireiro"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_28",
    "label": "Truck 6x2 frigorificado",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "6x2",
    "preferred_body_type_id": "truck_body_frigorifico",
    "canonical_body_type_ids": ["truck_body_frigorifico"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_36",
    "label": "Truck Gaseiro 6x2",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "6x2",
    "preferred_body_type_id": "truck_body_custom_gas_comprimido",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_truck_pesado_6x2",
    "label": "Truck pesado 6x2",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "6x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_carga_seca", "truck_body_graneleiro", "truck_body_tanque", "truck_body_container"]
  },
  {
    "truck_type_id": "truck_type_truck_pesado_6x4",
    "label": "Truck pesado 6x4",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "6x4",
    "preferred_body_type_id": "truck_body_basculante",
    "canonical_body_type_ids": ["truck_body_basculante", "truck_body_betoneira", "truck_body_tanque", "truck_body_container", "truck_body_prancha", "truck_body_munck"]
  },
  {
    "truck_type_id": "truck_type_truck_semipesado_6x2",
    "label": "Truck semipesado 6x2",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "6x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_carga_seca", "truck_body_graneleiro", "truck_body_frigorifico", "truck_body_tanque"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_35",
    "label": "Truck Tanque 6x2",
    "size_tier": "medio",
    "base_vehicle_kind": "rigido",
    "axle_config": "6x2",
    "preferred_body_type_id": "truck_body_tanque",
    "canonical_body_type_ids": ["truck_body_bau"]
  },
  {
    "truck_type_id": "truck_type_cavalo_6x4",
    "label": "Carreta Aberta 6x2",
    "size_tier": "pesado",
    "base_vehicle_kind": "cavalo",
    "axle_config": "6x4",
    "preferred_body_type_id": "truck_body_carga_seca",
    "canonical_body_type_ids": ["truck_body_prancha", "truck_body_basculante", "truck_body_tanque", "truck_body_container", "truck_body_graneleiro"]
  },
  {
    "truck_type_id": "truck_type_cavalo_4x2",
    "label": "Carreta Bau 4x2",
    "size_tier": "pesado",
    "base_vehicle_kind": "cavalo",
    "axle_config": "4x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_tanque", "truck_body_container", "truck_body_prancha"]
  },
  {
    "truck_type_id": "truck_type_cavalo_6x2",
    "label": "Carreta Bau 6x2",
    "size_tier": "pesado",
    "base_vehicle_kind": "cavalo",
    "axle_config": "6x2",
    "preferred_body_type_id": "truck_body_bau",
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_tanque", "truck_body_container", "truck_body_prancha", "truck_body_graneleiro", "truck_body_frigorifico"]
  },
  {
    "truck_type_id": "truck_type_cegonheiro",
    "label": "Carreta Cegonha",
    "size_tier": "pesado",
    "base_vehicle_kind": "especial",
    "axle_config": "specialized",
    "preferred_body_type_id": "truck_body_cegonheiro",
    "canonical_body_type_ids": ["truck_body_cegonheiro"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_27",
    "label": "Carreta frigorificada",
    "size_tier": "pesado",
    "base_vehicle_kind": "combinacao",
    "axle_config": "cavalo_6x2_ou_6x4",
    "preferred_body_type_id": "truck_body_frigorifico",
    "canonical_body_type_ids": ["truck_body_frigorifico"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_30",
    "label": "Carreta gaseira",
    "size_tier": "pesado",
    "base_vehicle_kind": "cavalo",
    "axle_config": "6x4",
    "preferred_body_type_id": "truck_body_custom_gas_comprimido",
    "canonical_body_type_ids": ["truck_body_custom_gas_comprimido"]
  },
  {
    "truck_type_id": "truck_type_custom_novo_caminhao_29",
    "label": "Carreta Tanque 6x2",
    "size_tier": "pesado",
    "base_vehicle_kind": "cavalo",
    "axle_config": "6x4",
    "preferred_body_type_id": "truck_body_tanque",
    "canonical_body_type_ids": ["truck_body_tanque"]
  },
  {
    "truck_type_id": "truck_type_romeu_julieta",
    "label": "Romeu e Julieta",
    "size_tier": "pesado",
    "base_vehicle_kind": "combinacao",
    "axle_config": "rigido_mais_reboque",
    "preferred_body_type_id": null,
    "canonical_body_type_ids": ["truck_body_bau", "truck_body_sider", "truck_body_graneleiro", "truck_body_carga_seca", "truck_body_canavieiro"]
  },
  {
    "truck_type_id": "truck_type_bitrem",
    "label": "Bitrem",
    "size_tier": "super_pesado",
    "base_vehicle_kind": "combinacao",
    "axle_config": "cavalo_6x2_ou_6x4",
    "preferred_body_type_id": null,
    "canonical_body_type_ids": ["truck_body_graneleiro", "truck_body_tanque", "truck_body_container", "truck_body_canavieiro"]
  },
  {
    "truck_type_id": "truck_type_rodotrem",
    "label": "Rodotrem",
    "size_tier": "super_pesado",
    "base_vehicle_kind": "combinacao",
    "axle_config": "cavalo_6x4",
    "preferred_body_type_id": null,
    "canonical_body_type_ids": ["truck_body_graneleiro", "truck_body_tanque", "truck_body_container", "truck_body_canavieiro"]
  },
  {
    "truck_type_id": "truck_type_treminhao",
    "label": "Treminhao",
    "size_tier": "super_pesado",
    "base_vehicle_kind": "combinacao",
    "axle_config": "rigido_mais_dois_reboques",
    "preferred_body_type_id": "truck_body_graneleiro",
    "canonical_body_type_ids": ["truck_body_canavieiro", "truck_body_graneleiro", "truck_body_madeireiro"]
  },
  {
    "truck_type_id": "truck_type_tritrem",
    "label": "Tritrem",
    "size_tier": "super_pesado",
    "base_vehicle_kind": "combinacao",
    "axle_config": "cavalo_6x4",
    "preferred_body_type_id": null,
    "canonical_body_type_ids": ["truck_body_canavieiro", "truck_body_graneleiro", "truck_body_madeireiro"]
  }
]
```

## Regra critica de interpretacao

Nao pesquise apenas chassis genericos.

Voce deve pesquisar o tipo operacional que o jogo realmente quer representar.

Exemplos:

- `Carreta Bau 4x2` = conjunto operacional tipico brasileiro correspondente a cavalo + semirreboque bau
- `Carreta Tanque 6x2` = conjunto operacional tanque
- `Carreta gaseira` = conjunto operacional gaseiro / gas comprimido
- `Truck 6x2 frigorificado` = truck rigido frigorificado, nao truck seco generico
- `Van Refrigerada` = van refrigerada, nao van seca generica
- `Romeu e Julieta` = conjunto rigido + reboque, nao caminhao simples isolado
- `Bitrem`, `Rodotrem`, `Tritrem` e `Treminhao` = composicoes completas, usar dimensoes e capacidade do conjunto inteiro

Use como pista principal:

- `label`
- `preferred_body_type_id`
- `canonical_body_type_ids`
- `base_vehicle_kind`
- `axle_config`
- `size_tier`

Se houver conflito entre `label` e `canonical_body_type_ids`, priorize o que o jogo parece querer representar operacionalmente pelo `label` e pelo `preferred_body_type_id`, e explique o conflito em `notes`.

## Prioridade de fontes

Priorize fontes brasileiras e tecnicas:

- fichas tecnicas de montadoras
- fichas tecnicas de implementadoras
- dados de fabricantes de baus, tanques, frigorificados, graneleiros e carrocerias
- documentos regulatorios brasileiros quando ajudarem em dimensoes e limites
- fontes comerciais confiaveis quando nao houver ficha tecnica oficial

Evite blog generico sem dado tecnico.

## Regras de modelagem

Para cada caminhao efetivo, produza valores normalizados seguindo estas regras:

1. `payload_weight_kg`
- Deve representar capacidade util de carga, nao PBT/PBTC bruto.
- Se a fonte trouxer apenas PBT/PBTC, estime a carga util a partir do conjunto mais proximo e explique.

2. `cargo_volume_m3`
- Deve representar volume util real de carga.
- Para bau, sider, frigorifico, tanque e graneleiro, buscar ou inferir m3 reais.
- Para tipos em que m3 nao e uma medida usual de mercado, como cegonha ou certas plataformas especiais, tentar obter a melhor aproximacao operacional e marcar a confianca.
- So retornar `null` se realmente nao houver como sustentar uma aproximacao razoavel.

3. `overall_length_m`, `overall_width_m`, `overall_height_m`
- Devem refletir o conjunto operacional completo que o jogo representa, nao apenas a cabine.
- Para cavalo/combinacao, usar dimensoes totais do conjunto.
- Para rigidos com implemento especifico, usar o veiculo completo com implemento, nao apenas o chassi.

4. `confidence`
- `high`: valor encontrado diretamente em ficha tecnica bem aderente ao tipo do jogo
- `medium`: valor consolidado a partir de 2 fontes proximas ou inferencia forte de mercado
- `low`: valor aproximado por analogia, com falta de fonte direta

5. `research_basis`
- `official_spec`: ficha tecnica oficial claramente aderente
- `manufacturer_sheet`: ficha tecnica de implementadora ou fabricante aderente
- `market_estimate`: consolidacao de fontes comerciais tecnicas proximas
- `derived_estimate`: inferencia controlada a partir de dimensoes e capacidade de tipos equivalentes

## Saida obrigatoria

Entregue 4 blocos:

### 1. Resumo de escopo

- quantidade total de caminhoes considerados
- lista final dos labels usados
- observacoes sobre o tipo oculto excluido
- observacoes sobre conflitos entre label e estrutura

### 2. Tabela markdown completa

Uma linha por caminhao, com estas colunas:

- `truck_type_id`
- `label`
- `size_tier`
- `base_vehicle_kind`
- `axle_config`
- `preferred_body_type_id`
- `payload_weight_kg`
- `cargo_volume_m3`
- `overall_length_m`
- `overall_width_m`
- `overall_height_m`
- `confidence`
- `research_basis`
- `notes`

### 3. JSON normalizado

Forneca tambem um array JSON com este schema:

```json
[
  {
    "truck_type_id": "string",
    "label": "string",
    "size_tier": "string",
    "base_vehicle_kind": "string",
    "axle_config": "string",
    "preferred_body_type_id": "string|null",
    "payload_weight_kg": 0,
    "cargo_volume_m3": 0,
    "overall_length_m": 0,
    "overall_width_m": 0,
    "overall_height_m": 0,
    "confidence": "high|medium|low",
    "research_basis": "official_spec|manufacturer_sheet|market_estimate|derived_estimate",
    "source_urls": ["https://..."],
    "notes": "string"
  }
]
```

### 4. Pendencias

Liste separadamente:

- entradas com `confidence = low`
- entradas com `cargo_volume_m3 = null`
- conflitos entre fontes
- casos que exigem decisao de design do jogo

## Restricoes

- Nao editar codigo.
- Nao inventar valores sem marcar claramente como estimados.
- Nao usar apenas uma heuristica unica para todos os tipos.
- Nao ignorar os custom trucks.
- Nao ignorar edits de label e classificacao ja refletidos na lista acima.
- Nao tentar descobrir um catalogo diferente desta lista nesta execucao.

## Resultado esperado

Ao final, o time deve ter uma base inicial suficientemente defensavel para preencher os campos operacionais de peso, volume e dimensoes da frota inteira do jogo usando apenas a lista embutida neste prompt.
# Brasix Truck Operations Research - Preliminary Baseline

Status: preliminary and usable.

This file consolidates the research obtained so far for the current effective truck roster of the game.
It is suitable as a design baseline for the operational catalog, but it is not yet a fully audited technical dataset.

## Scope

- Effective roster covered: 34 of 34 truck types in the current snapshot.
- Hidden type excluded from this round: truck_type_carreta_ls (Carreta simples / LS).
- Interpretation rule used: values should represent the operational vehicle or full road combination that the game label implies, not only the bare chassis.

## Current Result

| truck_type_id | label | payload_weight_kg | cargo_volume_m3 | overall_length_m | overall_width_m | overall_height_m | confidence | research_basis | source_urls | notes |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| truck_type_custom_novo_caminhao_25 | Camionete | 800 | 2.5 | 5.5 | 2.0 | 2.0 | low | market_estimate |  | Small 4x2 utility, open light-duty cargo use. |
| truck_type_custom_novo_caminhao_26 | Pick-up | 1000 | 3.5 | 5.8 | 2.0 | 2.1 | low | market_estimate |  | Open-bed pickup, single or double cab range. |
| truck_type_custom_novo_caminhao_24 | Van | 1500 | 8.0 | 5.9 | 2.0 | 2.3 | medium | derived_estimate | https://en.wikipedia.org/wiki/Truck | Commercial van / panel-van type. |
| truck_type_custom_novo_caminhao_31 | Van Refrigerada | 1200 | 6.5 | 5.9 | 2.0 | 2.5 | medium | derived_estimate |  | Refrigerated van with roof refrigeration unit. |
| truck_type_vuc_4x2 | VUC | 1500 | 6.0 | 6.3 | 2.0 | 2.3 | medium | market_estimate | https://en.wikipedia.org/wiki/Truck | Urban cargo vehicle class, compact rigid. |
| truck_type_custom_novo_caminhao_22 | VUC carroceria aberta | 1600 | 5.5 | 6.3 | 2.0 | 2.1 | medium | market_estimate |  | VUC with open dry cargo body. |
| truck_type_toco_leve_4x2 | Toco leve aberto | 3500 | 9.0 | 8.5 | 2.5 | 2.7 | medium | derived_estimate |  | Light 4x2 rigid, open-body interpretation. |
| truck_type_toco_leve_eletrico_4x2 | Toco leve bau | 3200 | 10.0 | 8.8 | 2.5 | 2.75 | medium | derived_estimate |  | Light rigid 4x2 with box body. |
| truck_type_custom_novo_caminhao_32 | Toco Leve Refrigerado | 3000 | 8.5 | 8.8 | 2.5 | 2.9 | low | derived_estimate |  | Light rigid refrigerated body with carrier. |
| truck_type_custom_novo_caminhao_34 | Toco Leve Tanque | 3200 | 7.0 | 8.5 | 2.5 | 2.8 | low | derived_estimate |  | Light rigid tank variant; volume depends on product density. |
| truck_type_custom_novo_caminhao_33 | Toco Medio Refrigerado | 5000 | 11.0 | 9.2 | 2.5 | 3.0 | low | derived_estimate |  | Medium rigid refrigerated interpretation. |
| truck_type_toco_medio_4x2 | Toco medio | 5500 | 12.0 | 9.2 | 2.5 | 2.9 | medium | derived_estimate |  | Medium 4x2 rigid, general cargo. |
| truck_type_toco_semipesado_4x2 | Toco semipesado 4x2 | 7000 | 14.0 | 9.5 | 2.5 | 3.0 | low | derived_estimate |  | Semiheavy 4x2 rigid. |
| truck_type_bitruck_vocacional_8x4 | Bitruck aberto 8x2 | 22000 | 48.0 | 15.5 | 2.6 | 2.8 | medium | market_estimate |  | Treated as heavy rigid open-body 8x4/8x2 style vocational truck; actual in-game label conflicts with axle setup. |
| truck_type_bitruck_8x2 | Bitruck Bau 8x2 | 20000 | 92.0 | 15.0 | 2.6 | 4.15 | medium | market_estimate |  | Heavy rigid box-body interpretation. |
| truck_type_offroad_6x6 | Bitruck basculante 8x4 | 24000 | 44.0 | 15.8 | 2.6 | 2.5 | low | market_estimate |  | Vocational dump-truck interpretation; in-game label conflicts with base axle data. |
| truck_type_custom_novo_caminhao_28 | Truck 6x2 frigorificado | 13500 | 58.0 | 14.2 | 2.6 | 4.1 | medium | market_estimate |  | Refrigerated rigid truck, payload reduced by insulated body. |
| truck_type_custom_novo_caminhao_36 | Truck Gaseiro 6x2 | 11000 | 18.0 | 12.8 | 2.6 | 3.9 | medium | derived_estimate |  | Rigid compressed-gas tank layout, high tare weight. |
| truck_type_truck_pesado_6x2 | Truck pesado 6x2 | 19500 | 78.0 | 14.8 | 2.6 | 4.15 | medium | market_estimate |  | Standard heavy rigid 6x2 for box/container style cargo. |
| truck_type_truck_pesado_6x4 | Truck pesado 6x4 | 21000 | 80.0 | 15.0 | 2.6 | 4.15 | medium | market_estimate |  | Heavy rigid 6x4, more traction and slightly higher payload tolerance. |
| truck_type_truck_semipesado_6x2 | Truck semipesado 6x2 | 15500 | 65.0 | 13.8 | 2.6 | 4.1 | medium | market_estimate |  | Intermediate rigid truck. |
| truck_type_custom_novo_caminhao_35 | Truck Tanque 6x2 | 12500 | 25.0 | 13.0 | 2.6 | 3.95 | medium | market_estimate |  | Rigid tank truck, shorter overall cargo volume due to cylindrical tank. |
| truck_type_cavalo_6x4 | Carreta Aberta 6x2 | 18000 | 57.0 | 18.15 | 2.6 | 2.6 | medium | market_estimate |  | Full tractor + open semitrailer set; in-game label conflicts with axle setup. |
| truck_type_cavalo_4x2 | Carreta Bau 4x2 | 12500 | 26.0 | 16.15 | 2.45 | 2.6 | medium | market_estimate |  | Full tractor + box semitrailer set. |
| truck_type_cavalo_6x2 | Carreta Bau 6x2 | 15500 | 35.0 | 16.85 | 2.45 | 2.6 | medium | market_estimate |  | Full tractor + box semitrailer set, larger than 4x2. |
| truck_type_cegonheiro | Carreta Cegonha | 13000 | 28.0 | 17.0 | 2.5 | 3.1 | low | derived_estimate |  | Vehicle carrier / CTV-CTVP style, volume approximated operationally. |
| truck_type_custom_novo_caminhao_27 | Carreta frigorificada | 14000 | 30.0 | 16.7 | 2.45 | 2.8 | medium | market_estimate |  | Full refrigerated combination. |
| truck_type_custom_novo_caminhao_30 | Carreta gaseira | 12000 | 42.0 | 16.5 | 2.5 | 3.0 | low | derived_estimate |  | Full compressed-gas road set, pressure vessel layout. |
| truck_type_custom_novo_caminhao_29 | Carreta Tanque 6x2 | 16000 | 38.0 | 16.75 | 2.5 | 2.9 | medium | market_estimate |  | Full fuel/liquid tank combination. |
| truck_type_romeu_julieta | Romeu e Julieta | 16500 | 45.0 | 17.5 | 2.6 | 2.7 | medium | market_estimate |  | Rigid truck + trailer drawbar combination. |
| truck_type_bitrem | Bitrem | 22000 | 68.0 | 25.0 | 2.6 | 3.05 | low | derived_estimate |  | Full Brazilian double-trailer combination. |
| truck_type_rodotrem | Rodotrem | 23500 | 75.0 | 26.5 | 2.6 | 3.1 | low | derived_estimate |  | Full long combination, commodity-focused. |
| truck_type_treminhao | Treminhao | 27000 | 88.0 | 28.0 | 2.6 | 3.15 | low | market_estimate |  | Full extra-long combination; regulatory corridor assumptions apply. |
| truck_type_tritrem | Tritrem | 25000 | 82.0 | 27.5 | 2.6 | 3.1 | low | derived_estimate |  | Full three-trailer combination. |

## Open Issues

- Source audit is incomplete. Some rows still have no direct URL attached.
- Several rows remain estimated rather than traced to a clean manufacturer or implementer sheet.
- The in-game labels and technical underlay conflict in some records:
  - truck_type_bitruck_vocacional_8x4 -> label says 8x2, axle says 8x4
  - truck_type_offroad_6x6 -> label says Bitruck basculante 8x4, base type says off-road 6x6
  - truck_type_cavalo_6x4 -> label says Carreta Aberta 6x2, axle says 6x4
- Specialized or non-cubic operational types remain the weakest volume estimates:
  - Carreta Cegonha
  - Carreta gaseira
  - Bitrem
  - Rodotrem
  - Treminhao
  - Tritrem

## Recommended Next Step

Use this file as the baseline for operational field creation in the truck catalog, then run a second audit pass only on:

1. low-confidence rows
2. rows without source URLs
3. rows with label / axle conflicts

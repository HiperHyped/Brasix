# Brasix v1.3 - Explicacao das Configuracoes de Robos

## Visao geral

As configuracoes de robos do Brasix v1.3 nao sao um sistema de IA generativa, aprendizado de maquina ou rede neural.

O que existe hoje e um sistema declarativo composto por:

- catalogos de **familias**, **parametros**, **presets**, **modos de mesa** e **arquetipos**
- um montador de perfis que combina esses dados
- um engine de score ponderado que avalia candidatos e ordena escolhas
- integracao real com o runtime para afetar a abertura e a operacao dos robos

Em termos simples: cada robo recebe um perfil numerico, o runtime calcula sinais do contexto atual e o engine combina **perfil + sinais do contexto** para ranquear opcoes.

## Como ler os nomes

Na interface, os nomes foram apresentados em portugues para facilitar a configuracao. Internamente, o sistema usa ids tecnicos em ingles.

O mapeamento correto e este:

- **Negociacao / Operacao** = `operations`
- **Visao / Malha** = `network`
- **Personalidade / Economia** = `economy`
- **Habilidades / Skill** = `skill`

Ou seja: a UI fala em linguagem mais humana, mas o runtime continua organizado nessas quatro familias tecnicas.

## Familias e parametros

Todos os parametros sao normalizados entre `0` e `1`.

Quase todos usam passo de `0.1`.

O parametro de horizonte usa `0.05`.

### **Personalidade / Economia**

Essa familia controla como o robo lida com caixa, expansao e protecao da propria operacao.

- **Reserva de caixa** (`cash_reserve_ratio`)
  Significa quanto capital o robo tenta preservar antes de expandir a frota ou assumir operacoes mais caras.
- **Tolerancia a risco** (`risk_tolerance`)
  Significa o quanto o robo aceita operar mais apertado para buscar cidades, cargas e reposicionamentos mais ambiciosos.
- **Pressao de frota** (`fleet_growth_bias`)
  Significa a tendencia de abrir mais caminhoes ja na largada em vez de comecar com operacao enxuta.
- **Disciplina de margem** (`margin_discipline`)
  Significa o peso dado ao lucro por ciclo e a estabilidade da margem.
- **Retorno seguro** (`emergency_return_bias`)
  Significa a propensao a voltar para bases mais seguras, especialmente a sede, quando o encadeamento logistico quebra.

Presets dessa familia:

- **Expansionista**
- **Equilibrado**
- **Disciplinado**
- **Conservador**
- **Sobrevivente**

### **Visao / Malha**

Essa familia controla como o robo enxerga cidades, conectividade, distancia e continuidade futura.

- **Forca da sede** (`weight_hq_strength`)
  Peso dado a cidades com alto potencial de saida e boa capacidade de sustentar cadeia de fretes.
- **Escala urbana** (`weight_city_scale`)
  Peso dado a cidades maiores, com mais populacao e centralidade economica.
- **Cobertura da malha** (`weight_network_coverage`)
  Peso dado a cidades que abrem mais opcoes de origem e continuidade operacional.
- **Eficiencia de distancia** (`weight_distance_efficiency`)
  Peso dado a trajetos mais curtos e ciclos mais eficientes por hora.
- **Horizonte de leitura** (`planning_horizon_turns`)
  Profundidade de leitura futura. No runtime esse valor e convertido para algo proximo de `0` a `24` horas de horizonte logistico.

Presets dessa familia:

- **Equilibrado**
- **Hubs**
- **Corredores**
- **Regionalista**
- **Expansao**

### **Negociacao / Operacao**

Essa familia controla como o robo escolhe fretes e reposicionamentos na pratica.

- **Peso de receita** (`weight_revenue`)
  Quanto a IA persegue fretes de maior receita total.
- **Encaixe de carga** (`weight_payload_fit`)
  Quanto a IA valoriza usar melhor a capacidade do caminhao.
- **Especializacao** (`weight_specialization_fit`)
  Quanto a IA valoriza cargas mais seletivas ou mais nobres no mix logistico.
- **Preferencia pela sede** (`weight_hq_origin_bonus`)
  Quanto a IA prefere operar perto da cidade-base.
- **Reposicionamento util** (`weight_reposition_opportunity`)
  Quanto a IA aceita reposicionar para capturar a proxima boa oportunidade.

Presets dessa familia:

- **Equilibrado**
- **Faturamento**
- **Especialista**
- **Base local**
- **Encadeador**

### **Habilidades / Skill**

Essa familia controla qualidade de leitura, estabilidade do score e capacidade de recuperacao.

- **Leitura futura** (`foresight`)
  Capacidade de valorizar destinos e sedes que sustentam bons encadeamentos depois da entrega atual.
- **Ruido de avaliacao** (`evaluation_noise`)
  Oscilacao aleatoria nas decisoes. Valor alto deixa o robo mais irregular.
- **Recuperacao logistica** (`recovery_quality`)
  Qualidade ao encontrar o melhor reposicionamento quando a rota atual termina sem continuidade imediata.
- **Consistencia** (`consistency`)
  Tendencia a repetir linhas mais estaveis em vez de alternar demais o comportamento.
- **Adaptacao** (`adaptation_speed`)
  Velocidade com que aceita mudar de polo ou rota ao perceber alternativa melhor.

Presets dessa familia:

- **Iniciante**
- **Operacional**
- **Solido**
- **Tatico**
- **Elite**

## Modos de mesa

Os **modos de mesa** nao sao um quinto grupo de parametros. Eles sao composicoes prontas de arquetipos para distribuir os robos da mesa.

Hoje existem estes modos:

- **Balanceada**
- **Agressiva**
- **Hubs**
- **Especialistas**

Cada modo define uma ordem de arquetipos para os slots dos robos.

Composicao exata de cada modo:

| Modo | Ordem real dos 5 slots | Leitura pratica |
| --- | --- | --- |
| **Balanceada** | Equilibrado -> Controlador de hub -> Despachante especialista -> Guardiao regional -> Cacador de faturamento | Mesa mista, sem viar demais para um unico estilo. |
| **Agressiva** | Cacador de faturamento -> Despachante especialista -> Equilibrado -> Cacador de faturamento -> Controlador de hub | Mais pressao por receita e ocupacao rapida da rede. |
| **Hubs** | Controlador de hub -> Guardiao regional -> Equilibrado -> Controlador de hub -> Despachante especialista | Mais territorial, mais presa a cidades-base fortes. |
| **Especialistas** | Despachante especialista -> Cacador de faturamento -> Equilibrado -> Guardiao regional -> Controlador de hub | Mais variada em encaixe de carga, reposicionamento e leitura de corredor. |

## Dificuldade global

A dificuldade global da abertura tambem altera os robos.

Ela nao muda diretamente os quatro grupos. Ela escolhe o preset de skill que sera forcado na mesa:

- **Dificil** -> **Tatico**
- **Padrao** -> **Solido**
- **Sandbox** -> **Operacional**

Na pratica, a dificuldade global mexe sobretudo na qualidade de leitura, consistencia e ruido da IA.

## Arquetipos

Os **arquetipos** sao perfis compostos, prontos, feitos pela combinacao de um preset de cada familia.

Hoje existem cinco:

- **Equilibrado** (`balanced_operator`)
- **Controlador de hub** (`hub_controller`)
- **Despachante especialista** (`specialist_dispatcher`)
- **Cacador de faturamento** (`revenue_hunter`)
- **Guardiao regional** (`regional_guardian`)

Cada arquetipo aponta para:

- um preset de **Personalidade / Economia**
- um preset de **Visao / Malha**
- um preset de **Negociacao / Operacao**
- um preset de **Habilidades / Skill**

Composicao exata dos arquetipos:

| Arquetipo | **Personalidade / Economia** | **Visao / Malha** | **Negociacao / Operacao** | **Habilidades / Skill** | Leitura pratica |
| --- | --- | --- | --- | --- | --- |
| **Equilibrado** | Equilibrado | Equilibrado | Equilibrado | Solido | Nao exagera em nenhum eixo; busca carteira estavel. |
| **Controlador de hub** | Disciplinado | Hubs | Base local | Tatico | Prioriza sede forte, continuidade perto da base e maior controle territorial. |
| **Despachante especialista** | Expansionista | Corredores | Especialista | Tatico | Anda mais pela rede e busca combinacoes logisticas mais seletivas. |
| **Cacador de faturamento** | Expansionista | Expansao | Faturamento | Operacional | Forca receita alta e aceita abrir mais cedo se o ciclo parecer grande. |
| **Guardiao regional** | Conservador | Regionalista | Base local | Solido | Preserva caixa, cresce com mais calma e reconstrui em torno de um nucleo regional. |

## O que o sistema faz por baixo

O fluxo tecnico e este:

1. o jogo escolhe um **modo de mesa**
2. o modo de mesa define a distribuicao de **arquetipos**
3. cada arquetipo monta um **perfil** usando os quatro grupos
4. a dificuldade da partida pode forcar um preset de **Habilidades / Skill**
5. se o usuario editar presets ou sliders, entram **overrides manuais**
6. esse perfil final e aplicado ao robo
7. nas decisoes do runtime, o engine calcula sinais do contexto e gera um score para cada opcao disponivel

## Quais algoritmos existem

Hoje o sistema usa um algoritmo unico de base:

- **score ponderado por perfil**

Isso quer dizer:

- existe uma formula declarativa
- a formula tem uma base fixa
- ela soma varios termos ponderados
- cada termo combina um sinal do perfil com um sinal do contexto atual
- pode haver ruido aleatorio controlado
- o resultado final e truncado entre `0` e `1`

Em termos praticos:

```text
score = base + soma(termos ponderados) + ruido opcional
```

Esse score e usado para ordenar candidatos.

O robo pega o candidato com maior score.

## Quais decisoes o engine toma

Hoje existem quatro decisoes reais no runtime.

### **Escolha de sede inicial**

Decisao tecnica: `hq_selection`

O engine compara cidades candidatas para escolher onde cada robo vai comecar.

Sinais usados aqui incluem, entre outros:

- potencial logistico da cidade
- escala urbana
- cobertura de malha
- potencial de cadeia longa
- separacao em relacao ao humano
- estabilidade de abastecimento

### **Escolha dos fretes da abertura**

Decisao tecnica: `flow_selection`

O engine escolhe os fretes iniciais que montam a abertura operacional do robo.

Sinais usados aqui incluem:

- receita
- margem
- eficiencia de distancia
- encaixe de carga
- especializacao
- bonus de origem na sede
- continuidade futura do destino
- estabilidade da rota

### **Escolha do proximo frete**

Decisao tecnica: `next_flow_selection`

Depois de entregar uma carga, o robo avalia os fretes disponiveis a partir da cidade atual e ranqueia a proxima rota.

Sinais usados aqui incluem:

- receita
- margem
- eficiencia de distancia
- encaixe de carga
- especializacao
- proximidade com a sede
- continuidade futura
- estabilidade da rota

### **Recuperacao e reposicionamento**

Decisao tecnica: `recovery_dispatch`

Quando o caminhao fica sem sequencia imediata, o engine escolhe entre reposicionar, buscar outra cidade promissora ou voltar para a sede.

Sinais usados aqui incluem:

- oportunidade do destino
- eficiencia de distancia
- retorno para a sede
- valor do frete-alvo
- continuidade futura do destino
- estabilidade da rota
- bonus de fronteira
- bonus por voltar para HQ

## O que mais pesa em cada decisao

Se voce quiser olhar o sistema de forma objetiva, estes sao os pesos dominantes hoje nas formulas declaradas.

### **Escolha de sede inicial** (`hq_selection`)

- **Forca da sede** (`weight_hq_strength`) x potencial logistico da cidade = peso `0.30`
- **Escala urbana** (`weight_city_scale`) x escala da cidade = peso `0.18`
- **Cobertura da malha** (`weight_network_coverage`) x cobertura de rede = peso `0.18`
- **Horizonte de leitura** (`planning_horizon_turns`) x cadeia longa = peso `0.10`
- **Leitura futura** (`foresight`) x cadeia longa = peso `0.08`
- **Consistencia** (`consistency`) x oferta estavel = peso `0.08`
- **Ruido de avaliacao** (`evaluation_noise`) injeta ruido com amplitude `0.04`

### **Escolha dos fretes da abertura** (`flow_selection`)

- **Peso de receita** (`weight_revenue`) x receita = peso `0.24`
- **Disciplina de margem** (`margin_discipline`) x margem = peso `0.18`
- **Eficiencia de distancia** (`weight_distance_efficiency`) x eficiencia de distancia = peso `0.18`
- **Encaixe de carga** (`weight_payload_fit`) x payload fit = peso `0.14`
- **Especializacao** (`weight_specialization_fit`) x specialization fit = peso `0.10`
- **Horizonte de leitura** (`planning_horizon_turns`) x followup do destino = peso `0.08`
- **Preferencia pela sede** (`weight_hq_origin_bonus`) x bonus de origem na HQ = peso `0.08`
- **Ruido de avaliacao** (`evaluation_noise`) injeta ruido com amplitude `0.05`

### **Escolha do proximo frete** (`next_flow_selection`)

- **Peso de receita** (`weight_revenue`) x receita = peso `0.22`
- **Disciplina de margem** (`margin_discipline`) x margem = peso `0.18`
- **Eficiencia de distancia** (`weight_distance_efficiency`) x eficiencia de distancia = peso `0.16`
- **Encaixe de carga** (`weight_payload_fit`) x payload fit = peso `0.12`
- **Horizonte de leitura** (`planning_horizon_turns`) x followup do destino = peso `0.10`
- **Especializacao** (`weight_specialization_fit`) x specialization fit = peso `0.08`
- **Leitura futura** (`foresight`) x estabilidade de rota = peso `0.07`
- **Preferencia pela sede** (`weight_hq_origin_bonus`) x bonus de origem na HQ = peso `0.07`
- **Ruido de avaliacao** (`evaluation_noise`) injeta ruido com amplitude `0.05`

### **Recuperacao e reposicionamento** (`recovery_dispatch`)

- **Reposicionamento util** (`weight_reposition_opportunity`) x oportunidade do destino = peso `0.28`
- **Eficiencia de distancia** (`weight_distance_efficiency`) x eficiencia de distancia = peso `0.24`
- **Retorno seguro** (`emergency_return_bias`) x retorno para casa = peso `0.18`
- **Recuperacao logistica** (`recovery_quality`) x valor do frete-alvo = peso `0.14`
- **Horizonte de leitura** (`planning_horizon_turns`) x followup do destino = peso `0.08`
- **Consistencia** (`consistency`) x estabilidade de rota = peso `0.05`
- **Adaptacao** (`adaptation_speed`) x bonus de fronteira = peso `0.05`
- **Preferencia pela sede** (`weight_hq_origin_bonus`) x destino ser HQ = peso `0.04`
- **Ruido de avaliacao** (`evaluation_noise`) injeta ruido com amplitude `0.04`

## Onde isso realmente afeta o jogo

Sim, as configuracoes afetam o runtime de verdade.

Hoje elas entram em quatro pontos reais:

- **Abertura dos robos**
  Define a sede inicial, a composicao de caminhoes e os fretes iniciais.
- **Proximo frete**
  Define como cada caminhao escolhe a proxima carga.
- **Recuperacao operacional**
  Define como o robo reage quando a sequencia de fretes quebra.
- **Atualizacao ao vivo**
  Se a configuracao muda com a partida em andamento, o perfil dos robos vivos e atualizado para as decisoes futuras.

## Mapa direto dos sliders no codigo

Se voce quiser saber, sem ambiguidade, o que cada slider altera hoje, este e o mapa mais fiel ao codigo atual.

### **Personalidade / Economia**

- **Reserva de caixa** (`cash_reserve_ratio`)
  Nao entra nas quatro formulas declaradas do engine. Entra diretamente na abertura para definir o piso minimo de caixa que o robo tenta preservar depois de comprar caminhoes.
- **Tolerancia a risco** (`risk_tolerance`)
  Entra em `hq_selection` via `early_expansion_room_norm` e tambem reduz o piso de caixa minimo da abertura, permitindo gastar mais cedo.
- **Pressao de frota** (`fleet_growth_bias`)
  Entra em `flow_selection` como empurrao adicional para ciclos de receita e tambem define a meta de caminhoes iniciais, hoje entre `1` e `3` unidades.
- **Disciplina de margem** (`margin_discipline`)
  Entra em `flow_selection` e `next_flow_selection`. Quanto maior, mais o robo valoriza margem e nao apenas faturamento bruto.
- **Retorno seguro** (`emergency_return_bias`)
  Entra em `recovery_dispatch`. Quanto maior, mais o robo aceita reconstruir a operacao voltando para casa ou para uma posicao mais segura.

### **Visao / Malha**

- **Forca da sede** (`weight_hq_strength`)
  Entra em `hq_selection`. Quanto maior, mais o robo favorece cidades com alto potencial logistico de saida.
- **Escala urbana** (`weight_city_scale`)
  Entra em `hq_selection`. Quanto maior, mais o robo favorece cidades grandes.
- **Cobertura da malha** (`weight_network_coverage`)
  Entra em `hq_selection`. Quanto maior, mais o robo favorece cidades que abrem mais continuidade de rede.
- **Eficiencia de distancia** (`weight_distance_efficiency`)
  Entra em `flow_selection`, `next_flow_selection` e `recovery_dispatch`. Quanto maior, mais o robo penaliza trajetos longos e improdutivos.
- **Horizonte de leitura** (`planning_horizon_turns`)
  Entra em `hq_selection`, `flow_selection`, `next_flow_selection` e `recovery_dispatch`. E o slider mais transversal do sistema. No runtime ele vira um horizonte aproximado de `0` a `24` horas de leitura futura.

### **Negociacao / Operacao**

- **Peso de receita** (`weight_revenue`)
  Entra em `flow_selection` e `next_flow_selection`. Quanto maior, mais a IA corre atras de receita bruta alta.
- **Encaixe de carga** (`weight_payload_fit`)
  Entra em `flow_selection` e `next_flow_selection`. Quanto maior, mais o robo valoriza usar bem a capacidade do caminhao.
- **Especializacao** (`weight_specialization_fit`)
  Entra em `flow_selection` e `next_flow_selection`. Quanto maior, mais o robo valoriza cargas seletivas ou mais nobres para o perfil do veiculo.
- **Preferencia pela sede** (`weight_hq_origin_bonus`)
  Entra em `flow_selection`, `next_flow_selection` e `recovery_dispatch`. Quanto maior, mais o robo orbita em torno da propria base.
- **Reposicionamento util** (`weight_reposition_opportunity`)
  Entra em `recovery_dispatch`. Quanto maior, mais o robo aceita se mover vazio para capturar a proxima boa janela de frete.

### **Habilidades / Skill**

- **Leitura futura** (`foresight`)
  Entra em `hq_selection`, `flow_selection` e `next_flow_selection`. Quanto maior, mais o robo valoriza destinos que sustentam continuidade depois da entrega atual.
- **Ruido de avaliacao** (`evaluation_noise`)
  Entra nas quatro decisoes. Quanto maior, mais variacao aleatoria o engine injeta antes de ranquear os candidatos.
- **Recuperacao logistica** (`recovery_quality`)
  Entra em `recovery_dispatch`. Quanto maior, melhor o robo diferencia reposicionamentos ruins de reposicionamentos promissores.
- **Consistencia** (`consistency`)
  Entra em `hq_selection` e `recovery_dispatch`. Quanto maior, mais o robo privilegia linhas mais estaveis.
- **Adaptacao** (`adaptation_speed`)
  Entra em `hq_selection` e `recovery_dispatch`. Quanto maior, mais o robo aceita mudar de polo quando ve vantagem estrutural nisso.

## Leitura pratica rapida

- Se voce sobe **Peso de receita** e **Pressao de frota**, o robo tende a abrir mais caminhoes e buscar ciclos maiores de faturamento.
- Se voce sobe **Disciplina de margem** e **Eficiencia de distancia**, o robo continua competitivo, mas fica menos disposto a perseguir faturamento ruim ou viagens longas.
- Se voce sobe **Preferencia pela sede** e **Retorno seguro**, o robo fica mais territorial e volta com mais frequencia para reconstruir a operacao perto da base.
- Se voce sobe **Horizonte de leitura** e **Leitura futura**, o robo passa a aceitar menos jogadas imediatistas e a valorizar destinos com cadeia mais longa.
- Se voce sobe **Ruido de avaliacao**, qualquer perfil fica menos previsivel, mesmo que os outros pesos continuem iguais.

## O que funciona de fato hoje

### Funciona de fato

- os presets e sliders montam perfis reais
- os perfis sao aplicados aos jogadores robos
- a escolha de sede inicial dos robos usa o engine
- a escolha dos fretes iniciais usa o engine
- a escolha do proximo frete usa o engine
- a recuperacao e o reposicionamento usam o engine
- as mudancas de configuracao podem ser aplicadas aos robos vivos para as proximas decisoes

### Nao faz hoje

- nao existe aprendizado de maquina
- nao existe memoria de partidas anteriores
- nao existe ajuste automatico de pesos ao longo do tempo
- nao existe busca profunda de varios turnos a frente
- nao existe negociacao real entre agentes; o nome **Negociacao** na UI e um nome de apresentacao para a familia **Operacao**
- mudar sliders no meio da partida nao reconstrui a abertura que ja aconteceu; isso so vale para decisoes futuras

## Entao qual e a resposta curta?

Resposta curta:

- **sim**, as configuracoes dos robos funcionam de verdade no runtime
- **nao**, isso nao e uma IA generativa nem um sistema que aprende sozinho
- o sistema atual e uma **IA declarativa por scoring ponderado**, com perfis configuraveis e regras de decisao ligadas a abertura e a operacao

## Resumo final

Se eu resumir tudo em uma frase:

> O Brasix v1.3 usa **familias de parametros em portugues**, agrupadas em **Personalidade**, **Visao**, **Negociacao** e **Habilidades**, para montar perfis numericos que alimentam um algoritmo de **score ponderado**, e esse algoritmo realmente controla a sede inicial, os fretes da abertura, a escolha do proximo frete e a recuperacao logistica dos robos.
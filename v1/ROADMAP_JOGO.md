# Brasix v1 - Roadmap Revisado do Jogo

## Contexto

O projeto ja possui cinco ferramentas de autoria e calibracao que formam a base do jogo:

- `http://127.0.0.1:8000/editor/map_v1_1` para mapa e rede base.
- `http://127.0.0.1:8000/editor/fretes` para gerar e calibrar fretes representativos a partir da matriz O/D.
- `http://127.0.0.1:8000/planner/route` para planejamento de rotas.
- `http://127.0.0.1:8000/viewer/trucks` para catalogo e classificacao de caminhoes.
- `http://127.0.0.1:8000/editor/products_v3` para produtos e matrizes de oferta e demanda.

A decisao desta fase e simples:

- O editor de produtos atual passa a ser a base economica da versao.
- O editor de fretes passa a ser a ponte entre matriz economica e trabalho jogavel.
- Os antigos Blocos B e C deixam de ser caminho critico do MVP.
- O jogo passa a ser construido sobre o loop operacional minimo.

## Loop Jogavel Minimo

O jogo comeca a existir quando o seguinte ciclo estiver fechado:

1. Um produto gera uma oportunidade de carga.
	A camada intermediaria agora passa pelos fretes representativos gerados e calibrados no editor de fretes.
2. Um contrato e ofertado ao jogador.
3. O jogador escolhe um caminhao compativel.
4. O sistema escolhe ou valida uma rota viavel.
5. O custo e o tempo da operacao sao calculados.
6. A viagem e simulada.
7. O resultado altera caixa, reputacao e disponibilidade da frota.

Tudo que vier antes disso serve para preparar o mundo jogavel.

## Principios de Projeto

- Editor-first: os editores continuam sendo a camada de autoria.
- Runtime-first: o jogo precisa de um pacote unico de dados coerentes para executar.
- Compatibilidade-first: evitar quebrar os JSONs e fluxos que ja funcionam.
- MVP-first: priorizar o loop operacional e financeiro antes de sistemas de profundidade.
- Separacao clara entre autoria, runtime e save do jogador.

## Diretriz de Design para as Proximas Construcoes

Todas as proximas telas, fluxos e ferramentas do Brasix devem considerar sempre o mesmo design-base ja estabelecido nas ferramentas atuais.

Isso significa:

- manter consistencia visual entre editores, planner, viewer e futuras telas de jogo.
- reaproveitar sempre que possivel as mesmas escolhas de layout, estrutura, componentes e hierarquia visual.
- respeitar as mesmas decisoes de formatacao, fontes, cores, tamanhos, titulos e espacamentos.
- considerar sempre os modos diurno e noturno como requisito padrao, nao como ajuste posterior.
- fazer layouts enxutos, com o minimo necessario de frases, explicacoes e textos auxiliares.
- priorizar funcionalidade, leitura rapida e densidade util de informacao.
- evitar telas inchadas, texto desnecessario e excesso de orientacao na interface.

Em resumo: as proximas construcoes devem parecer partes do mesmo produto, e nao modulos visuais independentes.

## Nova Ordem de Desenvolvimento

1. Bloco 0. Consolidacao da Base.
2. Bloco 1. Frota Operacional.
3. Bloco 2. Motor de Custo e Frete.
4. Bloco 3. Mercado, Clientes e Contratos.
5. Bloco 4. Estado da Empresa.
6. Bloco 5. Despacho e Simulacao de Viagem.
7. Bloco 6. Primeira Tela de Jogo.
8. Bloco 7. Cenarios e Empacotamento.
9. Bloco 8. Expansoes Futuras.

---

## Bloco 0. Consolidacao da Base

### Objetivo

Transformar os quatro editores atuais em uma fundacao tecnica unica para o jogo.

Hoje cada ferramenta ja funciona no seu proprio dominio, mas o jogo ainda nao tem um contrato de runtime unico. O Bloco 0 serve para definir esse contrato, validar referencias cruzadas e preparar um pacote de mundo jogavel que as proximas camadas possam consumir sem improviso.

Em termos praticos, o Bloco 0 responde a pergunta:

"Como o jogo vai ler, validar e combinar mapa, rede, produtos e caminhoes sem depender da logica interna de cada editor?"

### Problema que o Bloco 0 resolve

Sem o Bloco 0, os proximos blocos seriam construidos sobre acoplamentos soltos:

- O editor de mapa trabalha com mapa ativo e route network.
- O planner usa o mapa ativo e as rotas para calcular caminho.
- O editor de produtos trabalha com catalogo, familias, tipos logisticos e matrizes.
- O editor de caminhoes trabalha com tipos, implementos, overrides e classificacao.

Tudo isso existe, mas ainda nao forma um "mundo de jogo" formalizado. O risco de pular essa etapa e criar regras de frete, contrato e simulacao sobre dados que podem ficar inconsistentes entre si.

### Entregaveis do Bloco 0

#### 0.1 [P0] Congelar o papel dos quatro editores como camada oficial de autoria

Definir formalmente que:

- map editor e a fonte de verdade do mapa ativo e da rede de rotas.
- route planner e o consumidor operacional da rede para calculo.
- truck gallery e a fonte de verdade do catalogo efetivo de caminhoes.
- product editor v2 e a fonte de verdade do catalogo economico e das matrizes de oferta e demanda.

Resultado esperado:

- parar de tratar essas telas como prototipos soltos.
- passar a trata-las como pipeline oficial de dados do jogo.

#### 0.2 [P0] Definir um schema unico de runtime do jogo

Criar um modelo de dados que represente o "estado jogavel do mundo" sem depender diretamente do formato de bootstrap de cada tela.

Esse schema deve incluir pelo menos:

- identificacao do mapa ativo.
- cidades ativas.
- rede de rotas ativa.
- catalogo de produtos ativos.
- matrizes de oferta e demanda ativas.
- catalogo efetivo de caminhoes.
- catalogos auxiliares relevantes para runtime.
- versao do pacote.
- metadados de geracao.

Resultado esperado:

- o jogo consome um pacote unico.
- os proximos servicos nao precisam consultar quatro fontes diferentes ao mesmo tempo.

#### 0.3 [P0] Criar validacao cruzada entre dominios

Antes de abrir gameplay, o sistema precisa recusar pacotes incoerentes.

Validacoes minimas:

- todo produto precisa apontar para familia e tipo logistico validos.
- todo tipo logistico usado por produto precisa ter pelo menos um implemento compativel.
- toda rota precisa referenciar nos existentes no mapa ativo.
- todo caminhao precisa ter implemento canonico ou implementos compativeis validos.
- toda matriz por cidade precisa apontar para cidade existente no mapa ativo.
- todo contrato futuro precisa poder consultar produto, cidade e frota sem referencias quebradas.

Resultado esperado:

- detectar erro estrutural antes de entrar no jogo.
- impedir bugs silenciosos de integracao.

#### 0.4 [P0] Criar um pacote padrao de mundo jogavel

Definir o primeiro "world package" da versao.

Esse pacote deve indicar:

- qual mapa esta ativo.
- quais produtos estao habilitados.
- quais caminhoes estao habilitados.
- quais catalogos auxiliares entram no runtime.
- quais regras padrao serao usadas na primeira versao do jogo.

Resultado esperado:

- existir um conjunto concreto de dados com o qual o jogo pode inicializar.
- reduzir dependencia de selecoes manuais dispersas.

#### 0.5 [P0] Criar testes de integracao da base

Antes dos proximos blocos, a base precisa ser confiavel.

Cobertura minima:

- carga completa do pacote jogavel.
- validacao cruzada de referencias.
- integracao entre mapa ativo, produtos e caminhoes.
- consistencia entre planner, rede e cidades.
- persistencia do pacote consolidado.

Resultado esperado:

- qualquer quebra de contrato aparece cedo.
- a programacao dos blocos seguintes fica muito menos arriscada.

### O que o Bloco 0 nao e

O Bloco 0 nao e:

- sistema de contratos.
- sistema financeiro.
- simulacao de viagem.
- tela final do jogo.
- balanceamento economico.

Ele e a fundacao que permite construir tudo isso sem remendar integracoes depois.

### Sugestao de saidas tecnicas do Bloco 0

Sem fixar implementacao ainda, a tendencia natural e sair deste bloco com:

- um schema Pydantic de runtime do jogo.
- um servico de consolidacao do mundo jogavel.
- um servico de validacao cruzada.
- um JSON consolidado de mundo ativo ou um payload equivalente gerado sob demanda.
- testes de smoke e integracao para esse pipeline.

### Criterio de pronto do Bloco 0

O Bloco 0 esta pronto quando:

- o sistema consegue montar um pacote jogavel unico a partir dos editores atuais.
- esse pacote passa por validacoes estruturais.
- planner, produtos e caminhoes conseguem ser consultados a partir da mesma base consolidada.
- os proximos blocos podem consumir esse runtime sem conhecer a estrutura interna de cada editor.

---

## Bloco 1. Frota Operacional

### Objetivo

Transformar o catalogo de caminhoes em base operacional real do jogo.

### Tarefas

- 1.1 [P0] Acrescentar capacidade em peso por tipo de caminhao.
- 1.2 [P0] Acrescentar capacidade em volume por tipo de caminhao.
- 1.3 [P0] Definir consumo vazio e carregado.
- 1.4 [P0] Definir custo fixo e custo variavel base.
- 1.5 [P0] Definir restricoes urbanas, rodoviarias e por superficie.
- 1.6 [P0] Definir tempos de carga e descarga.
- 1.7 [P0] Integrar implementos e tipos logisticos do catalogo de produtos.
- 1.8 [P0] Evoluir a truck gallery para editor operacional.
- 1.9 [P0] Criar testes de schema, compatibilidade e persistencia.

### Resultado esperado

Ao fim do bloco, cada caminhao deve poder responder:

- o que consegue transportar.
- quanto consegue transportar.
- quanto custa operar.
- onde consegue operar.

---

## Bloco 2. Motor de Custo e Frete

### Objetivo

Converter rota e frota em calculo economico utilizavel pelo jogo.

### Tarefas

- 2.1 [P0] Criar catalogo de regras operacionais: diesel, pedagio, manutencao, motorista, seguro e desgaste.
- 2.2 [P0] Definir multiplicadores por tipo de estrada.
- 2.3 [P0] Definir multiplicadores por urgencia, risco, frio, carga especial e retorno vazio.
- 2.4 [P0] Criar formula-base de custo operacional.
- 2.5 [P0] Criar formula-base de frete sugerido.
- 2.6 [P0] Criar servico que receba rota, caminhao, produto e quantidade.
- 2.7 [P0] Integrar esse servico ao route planner.
- 2.8 [P0] Criar testes de calculo e calibracao inicial.

### Resultado esperado

Ao fim do bloco, o planner nao mostra apenas km e horas. Ele passa a mostrar custo, consumo e frete minimo sugerido.

---

## Bloco 3. Mercado, Clientes e Contratos

### Objetivo

Gerar trabalho jogavel a partir da economia ja definida no editor de produtos.

O editor de fretes em `/editor/fretes` ja cobre a etapa de gerar, calibrar e visualizar fretes representativos a partir da matriz de oferta e demanda. O restante deste bloco transforma esses fretes em entidades de mercado, clientes e contratos do runtime.

### Tarefas

- 3.1 [P0] Criar catalogo de tipos de cliente.
- 3.2 [P0] Criar catalogo de tipos de contrato.
- 3.3 [P0] Transformar fretes gerados em oportunidades de carga do runtime.
- 3.4 [P0] Definir origem, destino, produto, volume, prazo, janela e pagamento.
- 3.5 [P0] Definir SLA, multa, urgencia e restricoes operacionais.
- 3.6 [P0] Filtrar contratos inviaveis por rota ou por frota.
- 3.7 [P0] Persistir estados do contrato.
- 3.8 [P0] Criar testes de geracao, aceite e ciclo de vida.

### Resultado esperado

Ao fim do bloco, o jogo consegue apresentar contratos coerentes em vez de apenas dados economicos brutos.

---

## Bloco 4. Estado da Empresa

### Objetivo

Criar a entidade central que recebe os efeitos das operacoes.

### Tarefas

- 4.1 [P0] Criar a entidade empresa do jogador.
- 4.2 [P0] Definir caixa inicial, reputacao, cidade-base e frota inicial.
- 4.3 [P0] Controlar disponibilidade dos caminhoes.
- 4.4 [P0] Aplicar receita, custo e penalidade no estado da empresa.
- 4.5 [P0] Criar persistencia de save.
- 4.6 [P0] Criar testes para estado financeiro e disponibilidade operacional.

### Resultado esperado

Ao fim do bloco, o jogador deixa de operar no vazio. Passa a existir um estado economico persistente.

---

## Bloco 5. Despacho e Simulacao de Viagem

### Objetivo

Executar o contrato aceito dentro das regras do jogo.

### Tarefas

- 5.1 [P0] Criar fluxo de despacho de contrato.
- 5.2 [P0] Validar compatibilidade entre contrato, produto, caminhao e rota.
- 5.3 [P0] Simular etapas de carga, viagem e descarga.
- 5.4 [P0] Registrar custo final, tempo final e resultado operacional.
- 5.5 [P0] Resolver sucesso, atraso, falha ou entrega parcial.
- 5.6 [P0] Gerar log da viagem.
- 5.7 [P0] Criar testes end-to-end do ciclo operacional.

### Resultado esperado

Ao fim do bloco, ja existe uma operacao jogavel completa, ainda que simples.

---

## Bloco 6. Primeira Tela de Jogo

### Objetivo

Criar a primeira interface que junta empresa, contratos, frota e viagens, separada das ferramentas de autoria.

### Tarefas

- 6.1 [P0] Criar a rota e a tela inicial do jogo.
- 6.2 [P0] Mostrar contratos disponiveis, frota, caixa e reputacao.
- 6.3 [P0] Permitir aceitar contrato e iniciar despacho.
- 6.4 [P0] Mostrar viagens em andamento e resultado recente.
- 6.5 [P0] Definir condicao minima de progresso e fracasso.

### Resultado esperado

Ao fim do bloco, o projeto deixa de ser um conjunto de editores e passa a ter uma tela de jogo real.

---

## Bloco 7. Cenarios e Empacotamento

### Objetivo

Separar mundo authored, mundo jogavel e save do jogador.

### Tarefas

- 7.1 [P1] Criar pacote de cenario com mapa, produtos, frota e regras.
- 7.2 [P1] Permitir escolher capital inicial, dificuldade e frota inicial.
- 7.3 [P1] Criar exportacao e importacao de cenarios.
- 7.4 [P1] Definir separacao limpa entre dados de cenario e dados de save.

### Resultado esperado

Ao fim do bloco, o jogo pode nascer com configuracoes diferentes sem duplicar logica de runtime.

---

## Bloco 8. Expansoes Futuras

### Objetivo

Adicionar profundidade depois do MVP jogavel.

### Tarefas

- 8.1 [P2] Perfis economicos de cidade.
- 8.2 [P2] Instalacoes e polos.
- 8.3 [P2] Sazonalidade e eventos.
- 8.4 [P2] Campanha ampliada e progressao mais profunda.

### Resultado esperado

Ao fim desse conjunto, o jogo deixa de ser apenas operacional e passa a ter uma economia mais viva e dinamica.

---

## Linha de Corte do MVP

Se os Blocos 0 a 6 estiverem concluidos, o Brasix ja funciona como jogo em primeira versao.

Isso significa que o projeto ja conseguira:

- ler um mundo jogavel consolidado.
- gerar contratos coerentes.
- despachar frota real.
- calcular custo e frete.
- simular entrega.
- alterar o estado da empresa.
- mostrar isso em uma tela de jogo propria.

Tudo depois disso e expansao, profundidade e campanha.
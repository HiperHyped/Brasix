# Brasix

Mapa interativo de cidades representativas da producao de commodities do Brasil.


## Requisitos

- Python 3.12 ou superior
- Navegador moderno

## Instalacao

```powershell
python -m pip install -e .[dev]
```

## Gerando a base de referencia

Os arquivos brutos ficam em `dados/`. Para converter a planilha e o arquivo de icones em JSON:

```powershell
python scripts\build_reference_data.py
```

Arquivos gerados:

- `data/commodities.json`
- `data/cities.json`
- `data/map_config.json`
- `data/routes.json`

## Como rodar

```powershell
python run.py
```

Depois abra:

- `http://127.0.0.1:8000/`

## Estrutura

- `app/domain`: modelos centrais do projeto
- `app/services`: carga e preparacao dos dados
- `app/maptools`: base para rotas e calculo de caminhos
- `app/ui`: paginas e APIs
- `data`: JSON pronto para o mapa e para a futura engine de jogo
- `scripts`: pipeline de importacao

## Proximo passo natural

Depois do mapa inicial, a base ideal e:

1. criar um editor de rotas entre cidades
2. salvar essas rotas em `data/routes.json`
3. usar o grafo para contratos, deslocamento e custo logistico

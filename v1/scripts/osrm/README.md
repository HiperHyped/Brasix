# OSRM local para o Brasix

Este diretorio prepara o caminho para rodar um `OSRM` local quando houver `Docker` instalado na maquina.

## O que o editor v1.1 usa hoje

- Se `BRASIX_OSRM_BASE_URL` estiver definido no `.env`, o backend usa esse endereco.
- No estado atual do projeto, o `.env` aponta para `https://router.project-osrm.org` para o auto-route funcionar imediatamente.

## Quando quiser migrar para OSRM local

1. Instale o Docker Desktop.
2. Baixe um extrato OSM/PBF do Brasil.
3. Ajuste o `.env` para:

```env
BRASIX_OSRM_BASE_URL=http://127.0.0.1:5000
```

4. Rode o script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\osrm\start_osrm_brazil.ps1
```

## Observacao

O processamento do Brasil inteiro pode demorar bastante e exigir bastante disco e memoria. Para testes iniciais, um extrato regional menor pode ser mais rapido.

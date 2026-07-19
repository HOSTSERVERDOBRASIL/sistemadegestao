# Comparativo dos sistemas de referência

Referências auditadas em 18/07/2026:

- `XDB-PAINELBACK-V2-main.zip`
- `XDB-PAINELFRONT-V2-main.zip`
- `website-main.zip`
- `entrega-codex.zip`

Os ZIPs foram usados como fonte de regras e fluxos. Nenhum deles foi copiado por cima deste projeto.

## Onde o AtlasX atual evoluiu

| Área | Resultado consolidado |
|---|---|
| Contrato e pedido | Modelo único, multi-item, vínculo flexível, validação de vigência e saldo |
| Empenho e OF | Reserva atômica, impedimento de excesso e estorno rastreável |
| Faturamento | Nota fiscal com valor, nota de crédito e aprovação de estorno |
| Loja | Ponte autenticada, idempotência, itens completos e caminho por contrato |
| Efi | Serviço isolado, certificado por arquivo/base64, webhook protegido e conciliação |
| Auditoria | Eventos de negócio separados de logs técnicos |
| Interface | Recursos consolidados em Cliente, Pedido, Contrato e Configurações; sem replicar o menu extenso legado |

## Capacidades recuperadas e melhoradas dos anexos

- Consultas oficiais de CPF/CNPJ no Serpro com cache de token, timeout e erros seguros.
- ViaCEP com validação local antes da chamada externa.
- Classificação assistida de esfera pública por natureza jurídica; casos ambíguos ficam para revisão manual.
- Recusa de novo CNPJ inativo quando a validação Serpro está configurada.
- Integração ERP ↔ CLM com token interno, HMAC SHA-256, controle de origem e idempotência por `eventId`.
- Eventos técnicos atualizam o Pedido e a execução de cada item, sem criar telas operacionais duplicadas.
- Registro de solicitações LGPD dentro do Cliente, sem exclusão automática de dados.
- Contrato, empenho e parceiro podem coexistir no mesmo pedido; `vinculo.tipo` virou apenas classificação compatível com filtros antigos.

## O que não deve ser importado

- As três coleções paralelas de pedido e os dois financeiros do backend legado.
- Controllers de emissão de certificado dentro do ERP: emissão continua responsabilidade do CLM.
- Telas repetidas de pedido, certificado e administração encontradas no frontend antigo.
- Certificados privados encontrados no ZIP legado.

## Auditoria das credenciais e certificados

- O `.env` local não foi incluído no Git e valores secretos não foram copiados para arquivos versionados.
- Os dois PFX legíveis de `ecn/` têm o mesmo certificado e-CNPJ Safeweb, expirado em 02/04/2025. Eles não são certificados mTLS válidos da Efi para ativação atual.
- `xdigitalbrasilAntigo.pfx` não abriu com as senhas disponíveis no pacote.
- O `.env` atual possui parte da configuração Efi, mas a chave PIX permanece vazia.
- Não foi encontrado valor configurado para `SERPRO_BASIC_TOKEN`/`BASECTOKEN_SERPRO`, nem para os segredos da integração CLM.

Esses valores devem ser cadastrados em **Configurações**, que mascara segredos e aplica as variáveis sem expô-las ao frontend.

## Validação

- Backend: build TypeScript aprovado.
- Frontend: build Vite/TypeScript aprovado.
- Testes: 103 aprovados em 12 suítes, incluindo assinatura e idempotência CLM e validação local de documentos.

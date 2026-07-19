# Aplicação da entrega-codex neste repositório

Referência analisada: `D:\entrega-codex.zip`, começando por `spec/ESPECIFICACAO.md` e usando as versões mais recentes indicadas na seção 9.

## Aplicado ou já existente

| Especificação | Situação neste projeto |
|---|---|
| Contrato e Pedido como entidades próprias | Já existente |
| Pedido multi-item | Aplicado, com cálculo no backend |
| Esfera pública e exigência de empenho | Aplicado |
| Nota de Empenho e controle de saldo | Aplicado; reserva com validação atômica |
| Evidências múltiplas | Já aplicado, com upload e preview |
| Aditivos | Aplicado; total com direito = original + aditivos |
| Reservado → Confirmado | Aplicado via protocolo CLM |
| Cancelamento confirmado | Nota de crédito + aprovação manual antes de devolver saldo |
| Auditoria | Coleção e tela próprias, separadas dos logs técnicos |
| Ponte loja → AtlasX | `find-or-create`, `subscriptions/assign`, CNPJ, CPF, CEP e consulta de contrato |
| Rate limit da ponte | 60 consultas/minuto nas rotas de lookup |
| Menu proposto | Adaptado à estrutura React atual |

## Adaptações ao modelo atual

- O repositório usa `Cliente`, `Contrato`, `Pedido` e `OrdemFornecimento`; não existem `Company`, `AtaModel` e `Carona`.
- A consulta de contrato da loja retorna saldo financeiro e OFs abertas, pois o contrato atual não possui itens quantitativos embutidos.
- `vinculo.tipo` foi mantido para compatibilidade e filtros, mas contrato, parceiro, Nota de Empenho, OF e evidências podem coexistir como campos independentes.
- Pedidos vindos da loja resolvem `moduleId` para `_id` ou `Produto.codigo`; placeholders de produto não são aceitos.
- Requisições repetidas da loja com o mesmo número externo são idempotentes.

## Pendente de decisão ou integração externa

- Lookups CNPJ/CPF via Serpro e CEP via ViaCEP: implementados; falta cadastrar a credencial Serpro real e validar em homologação.
- Alteração do checkout React do `website-main`: pertence ao outro repositório.
- Classificação em lote de clientes: não executada; qualquer migração deverá começar em dry-run.
- Solicitação LGPD: registrada e auditada no Cliente; exclusão continua não automatizada e depende de revisão jurídica e política de retenção.
- Integração ERP ↔ CLM: API/eventos, HMAC, idempotência e execução por item aplicados; falta configurar URL e segredos reais do CLM.
- Minha Fila AGR, estoque de mídias e indicadores ICP-Brasil: são módulos novos de operação e não devem ser simulados sem validar o fluxo real do CLM.
- Transações Mongo multi-documento: recomendadas para NF/contrato/pedido em produção com replica set.

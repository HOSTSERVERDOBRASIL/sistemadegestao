# Sistema de Gestão — Atlas Ops

Painel administrativo enterprise com backend Node.js + TypeScript + MongoDB e frontend React + Vite.

## Pré-requisitos

- Node.js 18+
- MongoDB 7 (ou usar o fallback in-memory automático para desenvolvimento)

## Rodando em desenvolvimento

### 1. Backend

```bash
npm install
cp .env.example .env   # ajuste JWT_SECRET em produção
npm run seed           # cria admin@atlas.com / 123456
npm run dev            # API em http://localhost:3000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # UI em http://localhost:5173
```

O Vite proxy redireciona `/api/*` → `http://localhost:3000/*` automaticamente.

### Com Docker (MongoDB)

```bash
docker-compose up -d   # sobe o MongoDB na porta 27017
npm run dev            # backend conecta automaticamente
```

## Credenciais de acesso (seed)

| Campo | Valor |
|-------|-------|
| E-mail | admin@atlas.com |
| Senha | 123456 |
| Perfil | admin |

## Integração Efí Pay

O Pix exige um certificado de homologação ou produção emitido pela própria Efí. O arquivo não acompanha o código e deve ser salvo em `certs/certificado.p12` (a pasta está no `.gitignore`) ou fornecido em base64 por `EFI_CERT_BASE64`.

1. No painel Efí, acesse **API → Meus Certificados**, escolha o ambiente e crie um novo certificado.
2. Configure `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY`, `EFI_SANDBOX` e `EFI_CERT_PATH` no `.env` ou na tela **Configurações**.
3. Para confirmação automática, configure `EFI_WEBHOOK_URL` com a URL HTTPS pública e gere um `EFI_WEBHOOK_SECRET` longo e aleatório.
4. Pela tela de Configurações, verifique o status e registre o webhook depois que a API estiver publicamente acessível.

O arquivo histórico citado no projeto anterior era `producao-280121-Site-novo.p12`, mas ele não existe no `website-main.zip`. Não use certificado ICP-Brasil/A1 de assinatura: a API Pix aceita o certificado mTLS gerado pela própria Efí para o ambiente correto.

## Perfis de acesso

| Perfil | Acesso |
|--------|--------|
| `admin` | Tudo, incluindo gestão de usuários |
| `operador` | Clientes, produtos, parceiros, contratos, pedidos |
| `financeiro` | Leitura + emissão/cancelamento de NF, relatórios |
| `cliente` | Somente leitura de dados próprios |

---

## API — Endpoints

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Login JWT |
| GET | `/auth/me` | Usuário atual |

### Clientes
| Método | Rota |
|--------|------|
| GET | `/clientes?page&limit&busca&tipo&ativo` |
| GET | `/clientes/:id` |
| POST | `/clientes` |
| PUT | `/clientes/:id` |
| DELETE | `/clientes/:id` (soft-delete) |
| GET | `/clientes/:id/pedidos` |

### Produtos
| Método | Rota |
|--------|------|
| GET/POST | `/produtos` |
| GET/PUT/DELETE | `/produtos/:id` |

### Parceiros
| Método | Rota |
|--------|------|
| GET/POST | `/parceiros` |
| GET/PUT/DELETE | `/parceiros/:id` |

### Contratos
| Método | Rota |
|--------|------|
| GET/POST | `/contratos` |
| GET/PUT/DELETE | `/contratos/:id` |
| POST | `/contratos/:id/faturar-total` |
| GET/POST | `/contratos/:id/ordens-fornecimento` |
| GET | `/contratos/:id/pedidos` |

### Pedidos
| Método | Rota |
|--------|------|
| GET/POST | `/pedidos?page&limit&status&etapa&nfEmitida&busca` |
| GET/PUT | `/pedidos/:id` |
| PATCH | `/pedidos/:id/etapa` — `{ etapa, observacao }` |
| POST | `/pedidos/:id/emitir-nf` |

**Tipos de vínculo:** `Contrato`, `EmpenhoSF`, `CompraDireta`, `Revenda`

**Fluxo operacional (7 etapas):**
`Pedido → Pagamento → Validacao → Preparacao → Processamento → Entrega → Conclusao`

### Financeiro
| Método | Rota |
|--------|------|
| GET | `/financeiro/notas?page&status&emissor` |
| GET | `/financeiro/notas/:id` |
| PATCH | `/financeiro/notas/:id/cancelar` |
| GET | `/financeiro/conciliacao?dataInicio&dataFim` |
| GET | `/financeiro/resumo?dataInicio&dataFim` |

### Relatórios
| Rota | Descrição |
|------|-----------|
| `/relatorios/resumo` | Contadores gerais |
| `/relatorios/faturamento-por-cliente` | Top 50 clientes por volume |
| `/relatorios/faturamento-por-modalidade` | Por tipo de vínculo |
| `/relatorios/pedidos-por-status` | Agrupado por status |
| `/relatorios/contratos-com-saldo` | Contratos com saldo disponível |
| `/relatorios/faturamento-por-mes?meses=12` | Histórico mensal |
| `/relatorios/clientes-ativos` | Contadores PF/PJ |

### Usuários (admin only)
| Método | Rota |
|--------|------|
| GET/POST | `/usuarios` |
| GET/PUT/DELETE | `/usuarios/:id` |

---

## Estrutura do projeto

```
├── src/                    # Backend Express + TypeScript
│   ├── config/database.ts  # Conexão MongoDB (fallback in-memory)
│   ├── middleware/         # auth.middleware, error.middleware
│   ├── models/             # Mongoose schemas
│   ├── routes/             # Routers por módulo
│   ├── services/           # faturamento.service (lógica de NF)
│   ├── app.ts              # Express app
│   ├── server.ts           # HTTP server
│   └── seed.ts             # Dados iniciais
├── frontend/               # React + Vite
│   └── src/
│       ├── api.ts          # HTTP client tipado
│       ├── context/        # AuthContext
│       ├── components/     # Layout, Table, Badge, Modal, etc.
│       ├── pages/          # Uma pasta por módulo
│       └── types.ts        # Tipos TypeScript compartilhados
├── docker-compose.yml      # MongoDB
└── .env.example
```

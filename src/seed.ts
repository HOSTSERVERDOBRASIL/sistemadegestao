import bcrypt from 'bcryptjs';
import { connectDatabase } from './config/database.js';
import { UserModel } from './models/user.model.js';
import { ProdutoModel } from './models/produto.model.js';
import { ClienteModel } from './models/cliente.model.js';

// ─── Produtos XDigital / Host Server do Brasil ──────────────────────────────
// Fonte: repositórios log_atlas + gestasports (HOSTSERVERDOBRASIL)
// Categorias:
//   SSL-DV      → Certificado SSL Validação de Domínio (Sectigo)
//   SSL-OV      → Certificado SSL Validação de Organização (Sectigo)
//   SSL-EV      → Certificado SSL Validação Estendida (Sectigo)
//   ICP-PF      → Certificado ICP-Brasil Pessoa Física (SERPRO / SafeWeb)
//   ICP-PJ      → Certificado ICP-Brasil Pessoa Jurídica (SERPRO / SafeWeb)
//   EMAIL       → Certificado S/MIME (Sectigo Hermes)
//   CODE-SIGN   → Assinatura de Código (Sectigo)
//   SAAS        → Planos de software como serviço (GestaSports)

const PRODUTOS = [
  // ── SSL Sectigo — Validação de Domínio (DV) ──────────────────────────────
  {
    codigo: 'SSL-DV-287',
    nome: 'Certificado PositiveSSL DV — 1 Ano',
    descricao: 'Certificado SSL de validação de domínio simples. Emissão automática em minutos. Ideal para sites e blogs. Criptografia TLS 256-bit. Inclui Sectigo Site Seal.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo',
    preco: 89.00,
    precoTabela: 120.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-DV-287-2A',
    nome: 'Certificado PositiveSSL DV — 2 Anos',
    descricao: 'Certificado SSL DV para 2 anos. Emissão automática. Criptografia TLS 256-bit.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo',
    preco: 159.00,
    precoTabela: 220.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-DV-289',
    nome: 'Certificado PositiveSSL DV Wildcard — 1 Ano',
    descricao: 'Certificado SSL Wildcard de validação de domínio. Cobre o domínio principal e todos os subdomínios (*.seudominio.com.br). Emissão em minutos.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo',
    preco: 570.00,
    precoTabela: 750.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-DV-279',
    nome: 'Certificado PositiveSSL DV Multi-Domínio — 1 Ano',
    descricao: 'Certificado SSL para múltiplos domínios (SAN/UCC). Validação de domínio. Inclui até 3 SANs, expansível. Emissão em minutos.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo',
    preco: 570.00,
    precoTabela: 750.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-DV-330',
    nome: 'Certificado InstantSSL DV — 1 Ano',
    descricao: 'Certificado SSL DV de emissão rápida. Ideal para e-commerces e sistemas web. Preço negociado por contrato.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-INTRA-44',
    nome: 'Certificado INTRANETSSL — 1 Ano',
    descricao: 'Certificado SSL para servidores internos sem domínio público (intranet, VPN, servidores locais). Emitido pela Sectigo para redes privadas.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo',
    preco: 210.00,
    precoTabela: 280.00,
    estoque: 9999,
  },

  // ── SSL Sectigo — Validação de Organização (OV) ──────────────────────────
  {
    codigo: 'SSL-OV-24',
    nome: 'Certificado InstantSSL OV — 1 Ano',
    descricao: 'Certificado SSL com validação de organização. Valida identidade da empresa + domínio. Emissão em horas. Exibe o nome da empresa no certificado. Ideal para portais corporativos.',
    categoria: 'SSL-OV',
    fornecedor: 'Sectigo',
    preco: 610.00,
    precoTabela: 820.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-OV-361',
    nome: 'Certificado UCC OV — 1 Ano',
    descricao: 'Certificado SSL OV Multi-Domínio (UCC/SAN). Validação de organização para múltiplos domínios e subdomínios em um único certificado. Ideal para Exchange, Office 365 e ambientes híbridos.',
    categoria: 'SSL-OV',
    fornecedor: 'Sectigo',
    preco: 610.00,
    precoTabela: 820.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-OV-35',
    nome: 'Certificado PremiumSSL OV Wildcard — 1 Ano',
    descricao: 'Certificado SSL Wildcard com validação de organização. Cobre todos os subdomínios de um domínio com verificação OV. Máxima segurança e confiança.',
    categoria: 'SSL-OV',
    fornecedor: 'Sectigo',
    preco: 790.00,
    precoTabela: 1050.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-OV-768',
    nome: 'Certificado PositiveSSL OV — 1 Ano',
    descricao: 'Certificado SSL OV simples. Validação de organização com emissão em até 48h. Preço negociado por contrato.',
    categoria: 'SSL-OV',
    fornecedor: 'Sectigo',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-OV-769',
    nome: 'Certificado PositiveSSL OV Wildcard — 1 Ano',
    descricao: 'Certificado SSL OV Wildcard. Preço negociado por contrato.',
    categoria: 'SSL-OV',
    fornecedor: 'Sectigo',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-OV-770',
    nome: 'Certificado PositiveSSL OV Multi-Domínio — 1 Ano',
    descricao: 'Certificado SSL OV para múltiplos domínios. Preço negociado por contrato.',
    categoria: 'SSL-OV',
    fornecedor: 'Sectigo',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },

  // ── SSL Sectigo — Validação Estendida (EV) ───────────────────────────────
  {
    codigo: 'SSL-EV-556',
    nome: 'Certificado PositiveSSL EV — 1 Ano',
    descricao: 'Certificado SSL com validação estendida (EV). Exibe o nome completo da empresa verificado na barra de endereço. Máximo nível de confiança. Ideal para e-commerces, bancos e portais de alta segurança. Requer documentação da empresa.',
    categoria: 'SSL-EV',
    fornecedor: 'Sectigo',
    preco: 920.00,
    precoTabela: 1250.00,
    estoque: 9999,
  },
  {
    codigo: 'SSL-EV-557',
    nome: 'Certificado PositiveSSL EV Multi-Domínio — 1 Ano',
    descricao: 'Certificado SSL EV para múltiplos domínios. Validação estendida com nome da empresa verificado. Inclui até 3 SANs adicionais. Máxima confiança e segurança.',
    categoria: 'SSL-EV',
    fornecedor: 'Sectigo',
    preco: 920.00,
    precoTabela: 1250.00,
    estoque: 9999,
  },

  // ── Assinatura de Código ──────────────────────────────────────────────────
  {
    codigo: 'CODE-SIGN-530',
    nome: 'Assinatura de Código EV (Code Signing) — 1 Ano',
    descricao: 'Certificado para assinatura digital de software, executáveis, scripts e apps (EXE, DLL, MSI, VSIX, appx, etc.). Elimina alertas "Editor Desconhecido" do Windows. Validação EV com token físico HSM. Compatível com Microsoft SmartScreen.',
    categoria: 'CODE-SIGN',
    fornecedor: 'Sectigo',
    preco: 990.00,
    precoTabela: 1300.00,
    estoque: 9999,
  },

  // ── Certificados S/MIME (E-mail) ──────────────────────────────────────────
  {
    codigo: 'SMIME-009',
    nome: 'Certificado S/MIME Sectigo — 1 Ano',
    descricao: 'Certificado para assinatura digital e criptografia de e-mails (S/MIME). Compatível com Outlook, Thunderbird, Apple Mail e clientes IMAP. Garante autenticidade e confidencialidade das mensagens.',
    categoria: 'EMAIL',
    fornecedor: 'Sectigo Hermes',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'SMIME-506',
    nome: 'Certificado S/MIME Sectigo Personal Basic — 1 Ano',
    descricao: 'S/MIME para uso pessoal. Validação de e-mail. Assinatura digital e criptografia de mensagens.',
    categoria: 'EMAIL',
    fornecedor: 'Sectigo Hermes',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },

  // ── ICP-Brasil Pessoa Física (e-CPF) ─────────────────────────────────────
  {
    codigo: 'ICP-CPF-A1-12M',
    nome: 'e-CPF A1 — 12 meses (Nuvem)',
    descricao: 'Certificado digital ICP-Brasil para pessoa física. Política A1, armazenado em nuvem. Validade 12 meses. Permite assinar documentos digitalmente, acessar portais gov.br, e-CAC, MEI, Nota Fiscal, e fazer declarações à Receita Federal. Emissão SERPRO ou SafeWeb.',
    categoria: 'ICP-PF',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CPF-A3-12M',
    nome: 'e-CPF A3 — 12 meses (Token USB)',
    descricao: 'Certificado digital ICP-Brasil para pessoa física. Política A3, armazenado em token USB. Validade 12 meses. Maior segurança que A1 — chave gerada e armazenada no dispositivo físico. Inclui token criptográfico.',
    categoria: 'ICP-PF',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CPF-A3-12M-SC',
    nome: 'e-CPF A3 — 12 meses (Smartcard)',
    descricao: 'Certificado digital ICP-Brasil para pessoa física. Política A3, armazenado em smartcard (cartão). Validade 12 meses. Requer leitora de cartão.',
    categoria: 'ICP-PF',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CPF-A1-36M',
    nome: 'e-CPF A1 — 36 meses (Nuvem)',
    descricao: 'Certificado digital ICP-Brasil para pessoa física. Política A1, em nuvem. Validade 36 meses. Economia no custo por ano comparado ao plano de 12 meses.',
    categoria: 'ICP-PF',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CPF-OPENBANKING',
    nome: 'e-CPF Open Banking — 12 meses',
    descricao: 'Certificado digital ICP-Brasil para pessoa física com perfil Open Banking. Habilitado para autenticação em APIs de Open Finance conforme regulamentação do Banco Central.',
    categoria: 'ICP-PF',
    fornecedor: 'SERPRO',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },

  // ── ICP-Brasil Pessoa Jurídica (e-CNPJ) ──────────────────────────────────
  {
    codigo: 'ICP-CNPJ-A1-12M',
    nome: 'e-CNPJ A1 — 12 meses (Nuvem)',
    descricao: 'Certificado digital ICP-Brasil para pessoa jurídica. Política A1, em nuvem. Validade 12 meses. Permite assinar documentos, emitir NF-e, NFS-e, CT-e, MDF-e, enviar SPED, acessar Conectividade Social CAIXA, e-CAC, Portal do Simples Nacional e outros sistemas governamentais.',
    categoria: 'ICP-PJ',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CNPJ-A3-12M',
    nome: 'e-CNPJ A3 — 12 meses (Token USB)',
    descricao: 'Certificado digital ICP-Brasil para pessoa jurídica. Política A3, em token USB. Validade 12 meses. Segurança máxima com chave privada gerada no hardware. Inclui token criptográfico.',
    categoria: 'ICP-PJ',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CNPJ-A3-36M',
    nome: 'e-CNPJ A3 — 36 meses (Token USB)',
    descricao: 'Certificado digital ICP-Brasil para pessoa jurídica. Política A3, em token USB. Validade 36 meses.',
    categoria: 'ICP-PJ',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CNPJ-EPJ-A3-12M',
    nome: 'e-PJ A3 — 12 meses (Nuvem)',
    descricao: 'Certificado digital ICP-Brasil e-PJ para pessoa jurídica. Perfil para representantes de empresas. Política A3 em nuvem. Validade 12 meses. Emissão SERPRO.',
    categoria: 'ICP-PJ',
    fornecedor: 'SERPRO',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CNPJ-OPENBANKING',
    nome: 'e-CNPJ Open Banking — 12 meses',
    descricao: 'Certificado digital ICP-Brasil para pessoa jurídica com perfil Open Banking/Open Finance. Para integração de APIs financeiras conforme regulamentação Banco Central.',
    categoria: 'ICP-PJ',
    fornecedor: 'SERPRO',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ICP-CNPJ-INST-A3-12M',
    nome: 'Certificado Institucional ICP-Brasil — 12 meses (Token)',
    descricao: 'Certificado ICP-Brasil institucional para uso corporativo vinculado ao CNPJ da contratante. Política A3 em token. Emitido em lote. Validade 12 meses.',
    categoria: 'ICP-PJ',
    fornecedor: 'SERPRO / SafeWeb',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },

  // ── GestaSports — Planos SaaS ─────────────────────────────────────────────
  {
    codigo: 'GESTA-ESSENCIAL-MES',
    nome: 'GestaSports — Plano Essencial (Mensal)',
    descricao: 'Plataforma SaaS de gestão para clubes esportivos — Plano Essencial. Módulos básicos: Atletas, Associados, Presenças, Escalações, Relatórios. Ideal para pequenos clubes e escolinhas.',
    categoria: 'SAAS',
    fornecedor: 'GestaSports / Host Server do Brasil',
    preco: 99.00,
    precoTabela: 99.00,
    estoque: 9999,
  },
  {
    codigo: 'GESTA-CLUBE-MES',
    nome: 'GestaSports — Plano Clube (Mensal)',
    descricao: 'Plataforma SaaS de gestão para clubes esportivos — Plano Clube. Inclui módulos Essencial + Jogos, Eventos, Financeiro. Até 100 atletas, 3 times. Domínio personalizado.',
    categoria: 'SAAS',
    fornecedor: 'GestaSports / Host Server do Brasil',
    preco: 149.00,
    precoTabela: 149.00,
    estoque: 9999,
  },
  {
    codigo: 'GESTA-PRO-MES',
    nome: 'GestaSports — Plano Profissional (Mensal)',
    descricao: 'Plataforma SaaS de gestão para clubes esportivos — Plano Profissional. 11 módulos ativos (Associados, Atletas, Jogos, Escalações, Presenças, Rankings, Financeiro, Relatórios, Documentos, Galeria, Configurações). Até 200 atletas, 5 times, 8 usuários. Domínio personalizado.',
    categoria: 'SAAS',
    fornecedor: 'GestaSports / Host Server do Brasil',
    preco: 199.00,
    precoTabela: 199.00,
    estoque: 9999,
  },
  {
    codigo: 'GESTA-ASSOCIACAO-MES',
    nome: 'GestaSports — Plano Associação (Mensal)',
    descricao: 'Plataforma SaaS de gestão para clubes esportivos — Plano Associação. Todos os 13 módulos (inclui Comunicação e Eventos avançados). Sem limite de atletas/times. Multi-tenant.',
    categoria: 'SAAS',
    fornecedor: 'GestaSports / Host Server do Brasil',
    preco: 299.00,
    precoTabela: 299.00,
    estoque: 9999,
  },
  {
    codigo: 'GESTA-IMPLANTACAO',
    nome: 'GestaSports — Taxa de Implantação',
    descricao: 'Taxa única de implantação e configuração inicial da plataforma GestaSports. Inclui setup do ambiente, importação de dados, treinamento inicial e suporte no primeiro mês.',
    categoria: 'SAAS',
    fornecedor: 'GestaSports / Host Server do Brasil',
    preco: 499.00,
    precoTabela: 499.00,
    estoque: 9999,
  },

  // ── SSL Automático (ACME / XDBAutoSecure) ─────────────────────────────────
  {
    codigo: 'ACME-LETSENCRYPT',
    nome: 'XDBAutoSecure — Let\'s Encrypt (Grátis)',
    descricao: 'Emissão e renovação automática de certificado SSL via protocolo ACME com a CA Let\'s Encrypt. Domínio simples ou wildcard. Renovação automática a cada 90 dias. Incluso em planos de hospedagem.',
    categoria: 'SSL-DV',
    fornecedor: "Let's Encrypt",
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
  {
    codigo: 'ACME-SECTIGO-DV',
    nome: 'XDBAutoSecure — Sectigo ACME DV — 1 Ano',
    descricao: 'Emissão automática via ACME com CA Sectigo. Certificado DV com Brand Sectigo. Suporte a domínio simples, wildcard e multi-domínio. Renovação automática integrada.',
    categoria: 'SSL-DV',
    fornecedor: 'Sectigo ACME',
    preco: 0.00,
    precoTabela: 0.00,
    estoque: 9999,
  },
];

// ─── Clientes demo ───────────────────────────────────────────────────────────
const CLIENTES_DEMO = [
  {
    nome: 'Prefeitura Municipal de São Paulo',
    email: 'licitacoes@prefeitura.sp.gov.br',
    documento: '46.395.000/0001-39',
    tipo: 'pessoa-juridica',
    telefone: '(11) 3113-0000',
    ativo: true,
  },
  {
    nome: 'Tech Solutions Ltda',
    email: 'compras@techsolutions.com.br',
    documento: '12.345.678/0001-90',
    tipo: 'pessoa-juridica',
    telefone: '(47) 3333-1111',
    ativo: true,
  },
  {
    nome: 'João Carlos Mendes',
    email: 'joao.mendes@gmail.com',
    documento: '123.456.789-00',
    tipo: 'pessoa-fisica',
    telefone: '(48) 9 9999-8888',
    ativo: true,
  },
  {
    nome: 'Clube Esportivo Floripa',
    email: 'administrativo@clubefloripa.com.br',
    documento: '98.765.432/0001-10',
    tipo: 'pessoa-juridica',
    telefone: '(48) 3232-5555',
    ativo: true,
  },
  {
    nome: 'Maria Fernanda Costa',
    email: 'maria.costa@escritoriocosta.adv.br',
    documento: '987.654.321-00',
    tipo: 'pessoa-fisica',
    telefone: '(47) 9 8888-7777',
    ativo: true,
  },
];

async function main() {
  await connectDatabase();

  // ─── Usuários ──────────────────────────────────────────────────────────────
  const adminExists = await UserModel.findOne({ email: 'admin@atlas.com' });
  if (!adminExists) {
    await UserModel.create({
      nome: 'Administrador',
      email: 'admin@atlas.com',
      passwordHash: await bcrypt.hash('123456', 12),
      role: 'admin',
    });
    console.log('  ✓ Usuário admin criado (admin@atlas.com / 123456)');
  }

  const financeiroExists = await UserModel.findOne({ email: 'financeiro@atlas.com' });
  if (!financeiroExists) {
    await UserModel.create({
      nome: 'Financeiro Atlas',
      email: 'financeiro@atlas.com',
      passwordHash: await bcrypt.hash('123456', 12),
      role: 'financeiro',
    });
    console.log('  ✓ Usuário financeiro criado (financeiro@atlas.com / 123456)');
  }

  const operadorExists = await UserModel.findOne({ email: 'operador@atlas.com' });
  if (!operadorExists) {
    await UserModel.create({
      nome: 'Operador Atlas',
      email: 'operador@atlas.com',
      passwordHash: await bcrypt.hash('123456', 12),
      role: 'operador',
    });
    console.log('  ✓ Usuário operador criado (operador@atlas.com / 123456)');
  }

  // ─── Produtos ─────────────────────────────────────────────────────────────
  let produtosCriados = 0;
  let produtosExistentes = 0;

  for (const p of PRODUTOS) {
    const existe = await ProdutoModel.findOne({ codigo: p.codigo });
    if (!existe) {
      await ProdutoModel.create(p);
      produtosCriados++;
    } else {
      // Atualiza descrição, categoria e fornecedor se mudou
      await ProdutoModel.updateOne({ codigo: p.codigo }, {
        $set: { nome: p.nome, descricao: p.descricao, categoria: p.categoria, fornecedor: p.fornecedor }
      });
      produtosExistentes++;
    }
  }

  console.log(`  ✓ Produtos: ${produtosCriados} criado(s), ${produtosExistentes} já existiam`);

  // ─── Clientes demo ────────────────────────────────────────────────────────
  let clientesCriados = 0;
  for (const c of CLIENTES_DEMO) {
    const existe = await ClienteModel.findOne({ documento: c.documento });
    if (!existe) {
      await ClienteModel.create(c);
      clientesCriados++;
    }
  }
  if (clientesCriados > 0) console.log(`  ✓ Clientes demo: ${clientesCriados} criado(s)`);

  console.log('\n Seed concluída com sucesso!');
  console.log('');
  console.log(' Credenciais de acesso:');
  console.log('   admin@atlas.com       / 123456  (admin)');
  console.log('   financeiro@atlas.com  / 123456  (financeiro)');
  console.log('   operador@atlas.com    / 123456  (operador)');
  console.log('');
  console.log(` Total de produtos cadastrados: ${PRODUTOS.length}`);
  console.log('   Certificados SSL Sectigo (DV/OV/EV) ......... 14');
  console.log('   Code Signing EV ................................ 1');
  console.log('   S/MIME (e-mail) ................................ 2');
  console.log('   ICP-Brasil Pessoa Física (e-CPF) .............. 5');
  console.log('   ICP-Brasil Pessoa Jurídica (e-CNPJ) ........... 7');
  console.log('   GestaSports — Planos SaaS ...................... 5');
  console.log('   XDBAutoSecure / ACME ........................... 2');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro na seed:', error);
    process.exit(1);
  });

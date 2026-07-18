import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { PedidoModel } from '../models/pedido.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';
import { ContratoModel } from '../models/contrato.model.js';

const router = Router();

function escapeCsv(v: unknown): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(cells: string[]): string {
  return cells.map(escapeCsv).join(',');
}

function fmt(d: Date | string | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR');
}

function moeda(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

router.get('/pedidos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { status, etapa, nfEmitida, dataInicio, dataFim } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (etapa) filter.etapaOperacional = etapa;
    if (nfEmitida !== undefined) filter.nfEmitida = nfEmitida === 'true';
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim) range.$lte = new Date(`${dataFim}T23:59:59.999Z`);
      filter.createdAt = range;
    }

    const headers = ['Número', 'Data', 'Cliente', 'Documento Cliente', 'Produto', 'Código Produto', 'Vínculo', 'Valor Total', 'Valor Tabela', 'Desconto', 'Cupom', 'Status', 'Etapa', 'NF Emitida'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write('﻿' + rowToCsv(headers) + '\n');

    const cursor = PedidoModel
      .find(filter)
      .populate('clienteId', 'nome documento')
      .populate('produtoId', 'codigo nome')
      .sort({ createdAt: -1 })
      .lean()
      .cursor();

    for await (const p of cursor) {
      const c = p.clienteId as { nome?: string; documento?: string } | null;
      const pr = p.produtoId as { nome?: string; codigo?: string } | null;
      const row = rowToCsv([
        p.numero,
        fmt((p as unknown as { createdAt: Date }).createdAt),
        c?.nome ?? '',
        c?.documento ?? '',
        pr?.nome ?? '',
        pr?.codigo ?? '',
        p.vinculo.tipo,
        moeda(p.valorTotal),
        moeda(p.valorTabela),
        p.descontoValor ? moeda(p.descontoValor) : '',
        p.cupomCodigo ?? '',
        p.status,
        p.etapaOperacional,
        p.nfEmitida ? 'Sim' : 'Não',
      ]);
      res.write(row + '\n');
    }

    res.end();
  } catch (error) { next(error); }
});

router.get('/notas', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { status, emissor, dataInicio, dataFim } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (emissor) filter.emissor = emissor;
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim) range.$lte = new Date(`${dataFim}T23:59:59.999Z`);
      filter.createdAt = range;
    }

    const headers = ['Número NF', 'Data', 'Pedido', 'Valor', 'Emissor', 'Status', 'Situação SEFAZ', 'Chave Acesso', 'Link DANFE', 'Observações'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="notas-fiscais-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write('﻿' + rowToCsv(headers) + '\n');

    const cursor = NotaFiscalModel
      .find(filter)
      .populate('pedidoId', 'numero')
      .sort({ createdAt: -1 })
      .lean()
      .cursor();

    for await (const n of cursor) {
      const p = n.pedidoId as { numero?: string } | null;
      res.write(rowToCsv([
        n.numero,
        fmt((n as unknown as { createdAt: Date }).createdAt),
        p?.numero ?? String(n.pedidoId),
        moeda(n.valor),
        n.emissor,
        n.status,
        (n as unknown as { situacaoTiny?: string }).situacaoTiny ?? '',
        (n as unknown as { chaveAcesso?: string }).chaveAcesso ?? '',
        (n as unknown as { linkAcesso?: string }).linkAcesso ?? '',
        n.observacoes ?? '',
      ]) + '\n');
    }

    res.end();
  } catch (error) { next(error); }
});

router.get('/contratos', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const headers = ['Número', 'Cliente', 'Documento Cliente', 'Modalidade', 'Valor Total', 'Valor Faturado', 'Saldo', 'Status', 'Início', 'Fim'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contratos-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.write('﻿' + rowToCsv(headers) + '\n');

    const cursor = ContratoModel
      .find({})
      .populate('clienteId', 'nome documento')
      .sort({ createdAt: -1 })
      .lean()
      .cursor();

    for await (const c of cursor) {
      const cl = c.clienteId as { nome?: string; documento?: string } | null;
      res.write(rowToCsv([
        c.numero,
        cl?.nome ?? '',
        cl?.documento ?? '',
        c.modalidade,
        moeda(c.valorTotal),
        moeda(c.valorFaturado),
        moeda(c.valorTotal - c.valorFaturado),
        c.ativo ? 'Ativo' : 'Encerrado',
        fmt(c.dataInicio),
        fmt(c.dataFim),
      ]) + '\n');
    }

    res.end();
  } catch (error) { next(error); }
});

export { router as exportarRouter };

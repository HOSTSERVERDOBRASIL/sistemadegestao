import { Router } from 'express';
import { authenticateLojaBridge, lojaLookupRateLimit } from '../middleware/loja-bridge.middleware.js';
import { atribuirAssinaturaLoja, consultarContratosLoja, encontrarOuCriarClienteLoja } from '../services/loja-bridge.service.js';
import { consultarCEP, consultarCNPJ, consultarCPF } from '../services/cadastro-publico.service.js';

const router = Router();

router.post('/customers/find-or-create', authenticateLojaBridge, async (req, res, next) => {
  try {
    const { name, email, document, phone } = req.body as Record<string, string>;
    if (!name || !email || !document) return res.status(400).json({ message: 'name, email e document são obrigatórios' });
    const resultado = await encontrarOuCriarClienteLoja({ name, email, document, phone });
    res.json({ id: resultado.cliente._id, isNovo: resultado.isNovo });
  } catch (error) { next(error); }
});

router.post('/subscriptions/assign', authenticateLojaBridge, async (req, res, next) => {
  try {
    const resultado = await atribuirAssinaturaLoja(req.body);
    res.json(resultado);
  } catch (error) { next(error); }
});

router.get('/lookup/contrato/:cnpj', authenticateLojaBridge, lojaLookupRateLimit, async (req, res, next) => {
  try {
    const cnpj = Array.isArray(req.params.cnpj) ? req.params.cnpj[0] : req.params.cnpj;
    res.json(await consultarContratosLoja(cnpj));
  } catch (error) { next(error); }
});

router.get('/lookup/cnpj/:cnpj', authenticateLojaBridge, lojaLookupRateLimit, async (req, res, next) => {
  try { res.json(await consultarCNPJ(String(req.params.cnpj))); } catch (error) { next(error); }
});

router.get('/lookup/cpf/:cpf', authenticateLojaBridge, lojaLookupRateLimit, async (req, res, next) => {
  try { res.json(await consultarCPF(String(req.params.cpf))); } catch (error) { next(error); }
});

router.get('/lookup/cep/:cep', authenticateLojaBridge, lojaLookupRateLimit, async (req, res, next) => {
  try { res.json(await consultarCEP(String(req.params.cep))); } catch (error) { next(error); }
});

export { router as lojaBridgeRouter };

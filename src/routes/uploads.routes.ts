import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { PedidoModel } from '../models/pedido.model.js';
import { ContratoModel } from '../models/contrato.model.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${ext}`));
  },
});

const router = Router();

// Upload de comprovante de pagamento num pedido
router.post(
  '/pedidos/:id/comprovante',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  upload.single('arquivo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });

      const pedido = await PedidoModel.findById(req.params.id);
      if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

      const url = `/uploads/${req.file.filename}`;
      pedido.vinculo.comprovantePagamentoAprovado = true;
      await pedido.save();

      res.json({ url, message: 'Comprovante enviado e pedido atualizado' });
    } catch (error) {
      next(error);
    }
  }
);

// Upload de nova versão de contrato
router.post(
  '/contratos/:id/versao',
  authenticate,
  authorize('admin', 'operador'),
  upload.single('arquivo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });

      const contrato = await ContratoModel.findById(req.params.id);
      if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });

      const ultimaVersao = contrato.versoes.reduce((max, v) => Math.max(max, v.numeroVersao), 0);
      const url = `/uploads/${req.file.filename}`;

      contrato.versoes.push({
        numeroVersao: ultimaVersao + 1,
        arquivoUrl: url,
        data: new Date(),
      });
      await contrato.save();

      res.json({ url, versao: ultimaVersao + 1, contrato });
    } catch (error) {
      next(error);
    }
  }
);

export { router as uploadsRouter };

import { CertificadoICPModel } from '../models/certificado-icp.model.js';
import { broadcast } from '../routes/events.routes.js';

export async function verificarCertificadosVencendo(): Promise<void> {
  const hoje = new Date();
  const em30 = new Date(); em30.setDate(hoje.getDate() + 30);
  const em7 = new Date(); em7.setDate(hoje.getDate() + 7);

  const certs = await CertificadoICPModel.find({ statusRevogacao: 'ativo' }).lean();

  const vencendo30 = certs.filter(c => {
    if (!c.fimValidade) return false;
    const d = new Date(c.fimValidade as string);
    return !isNaN(d.getTime()) && d >= hoje && d <= em30;
  });
  const vencendo7 = vencendo30.filter(c => {
    const d = new Date(c.fimValidade as string);
    return d <= em7;
  });

  if (vencendo30.length > 0) {
    broadcast({ type: 'cert_icp:vencendo', payload: { quantidade: vencendo30.length, dias: 30 } });
  }
  if (vencendo7.length > 0) {
    broadcast({ type: 'cert_icp:vencendo', payload: { quantidade: vencendo7.length, dias: 7 } });
  }
}

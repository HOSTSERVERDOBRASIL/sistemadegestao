import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type ModalidadeAtendimento = 'Presencial' | 'Videoconferência';

export type StatusAtendimento =
  | 'Agendado'
  | 'Confirmado'
  | 'Em Atendimento'
  | 'Concluído'
  | 'Cancelado'
  | 'Reagendado'
  | 'Falta';

export interface IDadosTitular {
  nomeCompleto: string;
  cpf: string;
  dataNascimento?: Date;
  email: string;
  telefone: string;
  nomeMae?: string;
  rg?: string;
  rgOrgaoEmissor?: string;
  cnh?: string;
  enderecoCompleto?: string;
  cnpj?: string;
  razaoSocial?: string;
}

export interface IDocumentoAR {
  _id?: Types.ObjectId;
  tipo: string;
  arquivoUrl?: string;
  nomeOriginal?: string;
  verificado: boolean;
  observacao?: string;
}

export interface IAtendimentoAR extends Document {
  pedidoICPId?: Types.ObjectId;
  clienteId?: Types.ObjectId;
  numeroAtendimento: string;
  titular: IDadosTitular;
  tipoCertificado: string;
  midiaEmissao?: string;
  modalidade: ModalidadeAtendimento;
  dataAgendamento: Date;
  horaInicio: string;
  duracao: number;
  agenteResponsavelNome?: string;
  unidade?: string;
  documentos: IDocumentoAR[];
  status: StatusAtendimento;
  observacoes?: string;
  linkVideoconferencia?: string;
  biometriaRealizada?: boolean;
  emitidoEm?: Date;
  numeroSerieCertificado?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DadosTitularSchema = new Schema<IDadosTitular>({
  nomeCompleto:   { type: String, required: true },
  cpf:            { type: String, required: true },
  dataNascimento: Date,
  email:          { type: String, required: true },
  telefone:       { type: String, required: true },
  nomeMae:        String,
  rg:             String,
  rgOrgaoEmissor: String,
  cnh:            String,
  enderecoCompleto: String,
  cnpj:           String,
  razaoSocial:    String,
}, { _id: false });

const DocumentoARSchema = new Schema<IDocumentoAR>({
  tipo:         { type: String, required: true },
  arquivoUrl:   String,
  nomeOriginal: String,
  verificado:   { type: Boolean, default: false },
  observacao:   String,
});

const AtendimentoARSchema = new Schema<IAtendimentoAR>({
  pedidoICPId:           { type: Schema.Types.ObjectId, ref: 'PedidoICP' },
  clienteId:             { type: Schema.Types.ObjectId, ref: 'Cliente' },
  numeroAtendimento:     { type: String, required: true, unique: true },
  titular:               { type: DadosTitularSchema, required: true },
  tipoCertificado:       { type: String, required: true },
  midiaEmissao:          String,
  modalidade:            {
    type: String,
    enum: ['Presencial', 'Videoconferência'],
    required: true,
  },
  dataAgendamento:       { type: Date, required: true },
  horaInicio:            { type: String, required: true },
  duracao:               { type: Number, default: 30 },
  agenteResponsavelNome: String,
  unidade:               String,
  documentos:            [DocumentoARSchema],
  status: {
    type: String,
    enum: ['Agendado', 'Confirmado', 'Em Atendimento', 'Concluído', 'Cancelado', 'Reagendado', 'Falta'],
    default: 'Agendado',
  },
  observacoes:              String,
  linkVideoconferencia:     String,
  biometriaRealizada:       Boolean,
  emitidoEm:                Date,
  numeroSerieCertificado:   String,
}, { timestamps: true });

AtendimentoARSchema.index({ status: 1 });
AtendimentoARSchema.index({ dataAgendamento: 1 });
AtendimentoARSchema.index({ clienteId: 1 });
AtendimentoARSchema.index({ agenteResponsavelNome: 1 });

export const AtendimentoARModel: Model<IAtendimentoAR> =
  mongoose.model<IAtendimentoAR>('AtendimentoAR', AtendimentoARSchema);

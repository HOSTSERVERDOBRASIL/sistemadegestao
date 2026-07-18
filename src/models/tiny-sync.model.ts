import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type TipoSyncTiny = 'produto' | 'pedido' | 'cliente';
export type StatusSyncTiny = 'pendente' | 'sincronizado' | 'erro';

export interface ITinySync extends Document {
  tipo: TipoSyncTiny;
  localId: Types.ObjectId;
  tinyId?: string;
  tinyNumero?: string;
  status: StatusSyncTiny;
  erro?: string;
  payload?: Record<string, unknown>;
  ultimaSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tinySyncSchema = new Schema<ITinySync>(
  {
    tipo: { type: String, enum: ['produto', 'pedido', 'cliente'], required: true },
    localId: { type: Schema.Types.ObjectId, required: true },
    tinyId: { type: String, index: true, sparse: true },
    tinyNumero: String,
    status: { type: String, enum: ['pendente', 'sincronizado', 'erro'], default: 'pendente' },
    erro: String,
    payload: { type: Schema.Types.Mixed },
    ultimaSync: Date,
  },
  { timestamps: true }
);

tinySyncSchema.index({ tipo: 1, localId: 1 }, { unique: true });

export const TinySyncModel: Model<ITinySync> = mongoose.model<ITinySync>('TinySync', tinySyncSchema);

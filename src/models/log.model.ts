import mongoose, { Schema, Model, Document } from 'mongoose';

export interface ILog extends Document {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  levelNum: number;
  message: string;
  service: string;
  err?: { message: string; stack?: string; type?: string };
  req?: { method: string; url: string; remoteAddress?: string };
  res?: { statusCode: number };
  extra?: Record<string, unknown>;
  createdAt: Date;
}

const logSchema = new Schema<ILog>(
  {
    level:    { type: String, required: true, index: true },
    levelNum: { type: Number, required: true },
    message:  { type: String, required: true },
    service:  { type: String, default: 'atlasX' },
    err:      {
      message: String,
      stack:   String,
      type:    String,
    },
    req: {
      method:        String,
      url:           String,
      remoteAddress: String,
    },
    res: {
      statusCode: Number,
    },
    extra: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// TTL: apaga logs com mais de 30 dias automaticamente
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
// Índice composto para as queries mais comuns
logSchema.index({ levelNum: 1, createdAt: -1 });

export const LogModel: Model<ILog> = mongoose.model<ILog>('Log', logSchema);

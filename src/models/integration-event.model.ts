import mongoose, { Schema, Document, Model } from 'mongoose';

export type IntegrationEventStatus = 'pending' | 'sent' | 'processed' | 'failed' | 'retrying' | 'dead_letter';

export interface IIntegrationEvent extends Document {
  eventId: string;
  eventType: string;
  source: string;
  direction: 'inbound' | 'outbound';
  payload: Record<string, unknown>;
  status: IntegrationEventStatus;
  processedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  nextRetryAt?: Date;
}

const integrationEventSchema = new Schema<IIntegrationEvent>({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true, index: true },
  source: { type: String, required: true, index: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'sent', 'processed', 'failed', 'retrying', 'dead_letter'], default: 'pending', index: true },
  processedAt: Date,
  errorMessage: String,
  retryCount: { type: Number, default: 0 },
  nextRetryAt: Date,
}, { timestamps: true });

integrationEventSchema.index({ status: 1, nextRetryAt: 1 });
integrationEventSchema.index({ createdAt: -1 });

export const IntegrationEventModel: Model<IIntegrationEvent> = mongoose.model<IIntegrationEvent>('IntegrationEvent', integrationEventSchema);

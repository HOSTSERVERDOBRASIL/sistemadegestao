import mongoose, { Schema, Model } from 'mongoose';

interface ITokenBlacklist {
  jti: string;
  expiresAt: Date;
}

const schema = new Schema<ITokenBlacklist>({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// TTL index — MongoDB remove automaticamente após expiresAt
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TokenBlacklistModel: Model<ITokenBlacklist> =
  mongoose.model<ITokenBlacklist>('TokenBlacklist', schema);

import mongoose, { Schema, Model } from 'mongoose';

interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const CounterModel: Model<ICounter> = mongoose.model<ICounter>('Counter', counterSchema);

/** Retorna o próximo número sequencial atômico para o counter dado */
export async function nextSeq(name: string): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc!.seq;
}

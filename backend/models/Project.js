const { Schema, model, models } = require('mongoose');
// `state` = parameters the current Three.js template renderer understands (validated by zod before saving).
// `design` = optional AI-generated layout spec (schemaVersion 1, see validators/design.js).
const ProjectSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  description: { type: String, maxlength: 500, default: '' },
  style: { type: String, maxlength: 40, default: '' },
  floors: { type: Number, min: 1, max: 3, default: 2 },
  state: { type: Schema.Types.Mixed, required: true },
  design: { type: Schema.Types.Mixed, default: null },
  schemaVersion: { type: Number, default: 1 },
  rev: { type: Number, default: 1, min: 1 }, // optimistic-concurrency revision
  ai: { prompt: { type: String, maxlength: 2000 }, provider: String, model: String, generatedAt: Date },
  budget: { tier: { type: String, enum: ['basic', 'standard', 'premium'] }, rate: { type: Number, min: 0 } },
  thumbnail: { type: String, maxlength: 200000 },
}, { timestamps: true, minimize: false });
ProjectSchema.index({ owner: 1, updatedAt: -1 });
ProjectSchema.index({ owner: 1, name: 1 });
module.exports = models.Project || model('Project', ProjectSchema);

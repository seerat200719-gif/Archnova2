const { Schema, model, models } = require('mongoose');
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, match: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
  passwordHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
module.exports = models.User || model('User', UserSchema);

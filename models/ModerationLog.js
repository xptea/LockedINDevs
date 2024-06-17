const mongoose = require('mongoose');

const moderationLogSchema = new mongoose.Schema({
  caseId: { type: Number, required: true },
  moderator: { type: String, required: true },
  action: { type: String, required: true },
  target: { type: String, required: true },
  proof: { type: String, required: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ModerationLog', moderationLogSchema);

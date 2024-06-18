const mongoose = require('mongoose');
const moment = require('moment-timezone');

const moderationLogSchema = new mongoose.Schema({
  caseId: { type: Number, required: true },
  moderator: { type: String, required: true },
  moderatorId: { type: String, required: true }, 
  action: { type: String, required: true },
  target: { type: String, required: true },
  reason: { type: String, required: true },
  proof: { type: String, required: false },
  timestamp: {
    type: String,
    default: () => moment().tz('America/New_York').format('DD/MM/YYYY hh:mm A'),
  }
});

module.exports = mongoose.model('ModerationLog', moderationLogSchema);

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  robloxId: { type: String, required: true },
  robloxUsername: { type: String, required: true },
  joinDate: { type: String, required: true },
});

module.exports = mongoose.model('User', userSchema);

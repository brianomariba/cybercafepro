const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true }, // e.g., 'getting-started', 'computer'
    duration: { type: String, required: true }, // e.g., '15 min'
    lessons: { type: Number, default: 0 },
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'], default: 'Beginner' },
    content: { type: String }, // Basic content or link to video/material
    icon: { type: String }, // Icon identifier
    students: { type: Number, default: 0 },
    color: { type: String, default: '#00B4D8' }, // UI Color
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', CourseSchema);

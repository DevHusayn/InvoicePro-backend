import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Load env variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/invoicepro';

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err));



import authRoutes from './routes/auth.js';
import invoiceRoutes from './routes/invoices.js';
import clientRoutes from './routes/clients.js';
import businessInfoRoutes from './routes/companyInfo.js';

app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/business-info', businessInfoRoutes);

// Basic route
app.get('/', (req, res) => {
    res.send('InvoicePro API running');
});

// TODO: Add resource routes (invoices, clients, business info)

// In-app recurring invoice automation
import './recurringAutomation.js';

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



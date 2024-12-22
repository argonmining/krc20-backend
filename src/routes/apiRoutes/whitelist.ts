import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { parse } from 'csv-parse';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger';
import multer from 'multer';

const router = express.Router();
const prisma = new PrismaClient();

// Set up multer for CSV uploads
const upload = multer({ dest: 'uploads/' });

// Add this near the top of the file with other imports
const KASPA_ADDRESS_REGEX = /^kaspa:[a-z0-9]{61,63}$/;

function isValidKaspaAddress(address: string): boolean {
    return KASPA_ADDRESS_REGEX.test(address);
}

// Schema for single whitelist entry
const whitelistEntrySchema = z.object({
    address: z.string().regex(KASPA_ADDRESS_REGEX, 'Invalid Kaspa address format'),
    signature: z.string(),
});

// Schema for update request
const updateSchema = z.object({
    oldAddress: z.string().regex(KASPA_ADDRESS_REGEX, 'Invalid Kaspa address format'),
    newAddress: z.string().regex(KASPA_ADDRESS_REGEX, 'Invalid Kaspa address format'),
    signature: z.string(),
    adminAddress: z.string().regex(KASPA_ADDRESS_REGEX, 'Invalid Kaspa address format'),
});

// Bulk upload from CSV
router.post('/bulk-upload', upload.single('csv'), async (req, res) => {
    try {
        const { adminAddress, signature } = req.body;
        
        // TODO: Verify admin signature
        
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }

        const records: string[] = [];
        
        // Parse CSV
        fs.createReadStream(req.file.path)
            .pipe(parse({ delimiter: ',', columns: true }))
            .on('data', (data: { address: string }) => {
                if (isValidKaspaAddress(data.address)) {
                    records.push(data.address);
                } else {
                    logger.warn(`Invalid address format found in CSV: ${data.address}`);
                }
            })
            .on('end', async () => {
                // Bulk create whitelist entries
                await prisma.whitelist.createMany({
                    data: records.map(address => ({
                        address,
                        updatedBy: adminAddress,
                        changeType: 'INITIAL',
                        signature: '', // TODO: Handle signatures
                    })),
                    skipDuplicates: true,
                });

                // Clean up uploaded file
                fs.unlinkSync(req.file!.path);

                res.status(200).json({ 
                    message: 'Bulk upload completed',
                    count: records.length 
                });
            });

    } catch (error) {
        logger.error('Error in bulk upload:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update address
router.put('/update', async (req, res) => {
    try {
        const { oldAddress, newAddress, signature, adminAddress } = 
            updateSchema.parse(req.body);

        // TODO: Verify admin signature

        const existingEntry = await prisma.whitelist.findUnique({
            where: { address: oldAddress }
        });

        if (!existingEntry) {
            return res.status(404).json({ 
                error: 'Address not found in whitelist' 
            });
        }

        // Update the address
        const updated = await prisma.whitelist.update({
            where: { address: oldAddress },
            data: {
                address: newAddress,
                previousAddress: oldAddress,
                updatedBy: adminAddress,
                updatedAt: new Date(),
                changeType: 'UPDATE',
                signature
            }
        });

        res.status(200).json({ 
            message: 'Address updated successfully',
            data: updated 
        });

    } catch (error) {
        logger.error('Error updating address:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get whitelist
router.get('/', async (req, res) => {
    try {
        const whitelist = await prisma.whitelist.findMany({
            where: { active: true },
            select: {
                address: true,
                updatedAt: true
            }
        });
        
        res.json(whitelist);
    } catch (error) {
        logger.error('Error fetching whitelist:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 
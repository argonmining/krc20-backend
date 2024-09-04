import { Request, Response } from 'express';
import pool from '../services/dbService';

export const getMintData = async (req: Request, res: Response) => {
  const { startDate, endDate, page = '1', limit = '100', tick } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const query = `
      SELECT "txHash", "tick", "amt", "from", "to", "blockTime"
      FROM "KRC20Transaction"
      WHERE "op" = 'mint'
      AND "blockTime" BETWEEN $1 AND $2
      ${tick ? 'AND "tick" = $5' : ''}
      ORDER BY "blockTime" DESC
      LIMIT $3 OFFSET $4
    `;
    const values = tick 
      ? [startDate, endDate, limit, offset, tick]
      : [startDate, endDate, limit, offset];
    
    const result = await pool.query(query, values);
    
    res.json(result.rows);
  } catch (error: unknown) {
    console.error('Error fetching mint data:', error);
    if (error instanceof Error) {
      res.status(500).json({ 
        error: 'Internal server error', 
        details: error.message,
        code: (error as any).code // Use 'as any' cautiously
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error', 
        details: 'An unknown error occurred'
      });
    }
  }
};

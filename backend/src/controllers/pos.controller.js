// project/backend/src/controllers/pos.controller.js
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Neon PostgreSQL connection pool
const pool = new Pool({
  connectionString: 'postgresql://cosmetic_owner:DoRQqs1zNS5x@ep-silent-king-a2vu43rm-pooler.eu-central-1.aws.neon.tech/cosmetic?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize POS session
export const initializePosSession = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { user_id, warehouse_id, starting_cash } = req.body;
    
    // Check if user has an active session
    const activeSessionCheck = await client.query(
      `SELECT id FROM pos_sessions 
       WHERE user_id = $1 AND status = 'active' 
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );

    if (activeSessionCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'User already has an active POS session'
      });
    }

    // Create new POS session
    const sessionResult = await client.query(
      `INSERT INTO pos_sessions (
        id, user_id, warehouse_id, starting_cash, 
        current_cash, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'active', NOW()) 
       RETURNING *`,
      [uuidv4(), user_id, warehouse_id, starting_cash, starting_cash]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'POS session initialized successfully',
      data: sessionResult.rows[0]
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POS Session Initialization Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize POS session',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Process sale transaction
export const processSale = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      session_id,
      customer_id,
      items,
      payment_method,
      total_amount,
      amount_paid,
      discount_amount = 0,
      tax_amount = 0,
      notes = ''
    } = req.body;

    // Validate POS session
    const sessionCheck = await client.query(
      'SELECT * FROM pos_sessions WHERE id = $1 AND status = $2',
      [session_id, 'active']
    );

    if (sessionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive POS session'
      });
    }

    // Generate sale ID
    const saleId = uuidv4();
    const changeAmount = Math.max(0, amount_paid - total_amount);

    // Create sale record
    const saleResult = await client.query(
      `INSERT INTO sales (
        id, session_id, customer_id, total_amount, 
        discount_amount, tax_amount, amount_paid, 
        change_amount, payment_method, status, 
        notes, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, NOW()) 
       RETURNING *`,
      [
        saleId, session_id, customer_id, total_amount,
        discount_amount, tax_amount, amount_paid,
        changeAmount, payment_method, notes
      ]
    );

    // Process sale items and update inventory
    for (const item of items) {
      // Add sale item
      await client.query(
        `INSERT INTO sale_items (
          id, sale_id, item_id, quantity, 
          unit_price, total_price, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          uuidv4(),
          saleId,
          item.item_id,
          item.quantity,
          item.unit_price,
          item.quantity * item.unit_price
        ]
      );

      // Update inventory stock
      await client.query(
        `UPDATE inventory 
         SET current_stock = current_stock - $1,
             updated_at = NOW()
         WHERE item_id = $2 AND warehouse_id = $3`,
        [
          item.quantity,
          item.item_id,
          sessionCheck.rows[0].warehouse_id
        ]
      );

      // Record stock movement
      await client.query(
        `INSERT INTO stock_movements (
          id, item_id, warehouse_id, movement_type,
          quantity, reference_id, notes, created_at
         ) VALUES ($1, $2, $3, 'sale', $4, $5, $6, NOW())`,
        [
          uuidv4(),
          item.item_id,
          sessionCheck.rows[0].warehouse_id,
          -item.quantity, // Negative for outgoing
          saleId,
          `POS Sale: ${item.quantity} units`
        ]
      );
    }

    // Update POS session cash
    await client.query(
      `UPDATE pos_sessions 
       SET current_cash = current_cash + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount_paid - changeAmount, session_id]
    );

    await client.query('COMMIT');

    // Get complete sale details with items
    const completeSale = await client.query(
      `SELECT s.*, 
              json_agg(
                json_build_object(
                  'id', si.id,
                  'item_id', si.item_id,
                  'item_name', i.name,
                  'quantity', si.quantity,
                  'unit_price', si.unit_price,
                  'total_price', si.total_price
                )
              ) as items
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       LEFT JOIN items i ON si.item_id = i.id
       WHERE s.id = $1
       GROUP BY s.id`,
      [saleId]
    );

    res.status(201).json({
      success: true,
      message: 'Sale processed successfully',
      data: {
        sale: completeSale.rows[0],
        change_amount: changeAmount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sale Processing Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process sale',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get items for POS with search and filtering
export const getPosItems = async (req, res) => {
  try {
    const { search, category_id, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        i.id,
        i.name,
        i.sku,
        i.barcode,
        i.description,
        i.category_id,
        ic.name as category_name,
        i.sale_price,
        i.cost_price,
        COALESCE(inv.current_stock, 0) as current_stock,
        i.tax_rate,
        i.is_active
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE i.is_active = true
    `;
    
    const queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (i.name ILIKE $${paramCount} OR i.sku ILIKE $${paramCount} OR i.barcode = $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    if (category_id) {
      paramCount++;
      query += ` AND i.category_id = $${paramCount}`;
      queryParams.push(category_id);
    }

    query += ` ORDER BY i.name LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('Get POS Items Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch POS items',
      error: error.message
    });
  }
};

// Close POS session
export const closePosSession = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { session_id, closing_cash, notes = '' } = req.body;

    // Get session details
    const sessionResult = await client.query(
      `SELECT * FROM pos_sessions WHERE id = $1 AND status = 'active'`,
      [session_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Active POS session not found'
      });
    }

    const session = sessionResult.rows[0];
    const cashDifference = closing_cash - session.current_cash;

    // Update session to closed
    await client.query(
      `UPDATE pos_sessions 
       SET status = 'closed',
           closing_cash = $1,
           cash_difference = $2,
           closing_notes = $3,
           closed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [closing_cash, cashDifference, notes, session_id]
    );

    // Get session summary
    const salesSummary = await client.query(
      `SELECT 
         COUNT(*) as total_sales,
         COALESCE(SUM(total_amount), 0) as total_revenue,
         COALESCE(SUM(discount_amount), 0) as total_discounts,
         COALESCE(SUM(tax_amount), 0) as total_taxes
       FROM sales 
       WHERE session_id = $1 AND status = 'completed'`,
      [session_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'POS session closed successfully',
      data: {
        session: {
          ...session,
          status: 'closed',
          closing_cash,
          cash_difference: cashDifference
        },
        summary: salesSummary.rows[0]
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Close POS Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close POS session',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get active POS session
export const getActiveSession = async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await pool.query(
      `SELECT ps.*, 
              u.username as user_name,
              w.name as warehouse_name
       FROM pos_sessions ps
       LEFT JOIN users u ON ps.user_id = u.id
       LEFT JOIN warehouses w ON ps.warehouse_id = w.id
       WHERE ps.user_id = $1 AND ps.status = 'active'
       ORDER BY ps.created_at DESC LIMIT 1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active POS session found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get Active Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active session',
      error: error.message
    });
  }
};

// Void a sale
export const voidSale = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { sale_id, reason, user_id } = req.body;

    // Check if sale exists and is not already voided
    const saleCheck = await client.query(
      'SELECT * FROM sales WHERE id = $1 AND status != $2',
      [sale_id, 'voided']
    );

    if (saleCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Sale not found or already voided'
      });
    }

    const sale = saleCheck.rows[0];

    // Get sale items to restore inventory
    const saleItems = await client.query(
      'SELECT * FROM sale_items WHERE sale_id = $1',
      [sale_id]
    );

    // Restore inventory for each item
    for (const item of saleItems.rows) {
      await client.query(
        `UPDATE inventory 
         SET current_stock = current_stock + $1,
             updated_at = NOW()
         WHERE item_id = $2 AND warehouse_id = (
           SELECT warehouse_id FROM pos_sessions WHERE id = $3
         )`,
        [item.quantity, item.item_id, sale.session_id]
      );

      // Record stock movement for void
      await client.query(
        `INSERT INTO stock_movements (
          id, item_id, warehouse_id, movement_type,
          quantity, reference_id, notes, created_at
         ) VALUES ($1, $2, $3, 'void', $4, $5, $6, NOW())`,
        [
          uuidv4(),
          item.item_id,
          sale.session_id, // This should be warehouse_id from session
          item.quantity, // Positive for incoming (restore)
          sale_id,
          `Sale Void: ${reason}`
        ]
      );
    }

    // Update POS session cash
    await client.query(
      `UPDATE pos_sessions 
       SET current_cash = current_cash - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [sale.amount_paid - sale.change_amount, sale.session_id]
    );

    // Void the sale
    await client.query(
      `UPDATE sales 
       SET status = 'voided',
           void_reason = $1,
           voided_by = $2,
           voided_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [reason, user_id, sale_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Sale voided successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Void Sale Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to void sale',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get today's sales summary
export const getTodaysSummary = async (req, res) => {
  try {
    const { session_id } = req.params;

    const summary = await pool.query(
      `SELECT 
         COUNT(*) as total_sales,
         COALESCE(SUM(total_amount), 0) as total_revenue,
         COALESCE(SUM(discount_amount), 0) as total_discounts,
         COALESCE(SUM(tax_amount), 0) as total_taxes,
         COALESCE(SUM(amount_paid), 0) as total_cash_collected,
         COUNT(DISTINCT customer_id) as total_customers,
         MIN(created_at) as first_sale_time,
         MAX(created_at) as last_sale_time
       FROM sales 
       WHERE session_id = $1 
         AND status = 'completed' 
         AND DATE(created_at) = CURRENT_DATE`,
      [session_id]
    );

    // Get top selling items
    const topItems = await pool.query(
      `SELECT 
         i.name as item_name,
         SUM(si.quantity) as total_quantity,
         SUM(si.total_price) as total_revenue
       FROM sale_items si
       JOIN items i ON si.item_id = i.id
       JOIN sales s ON si.sale_id = s.id
       WHERE s.session_id = $1 
         AND s.status = 'completed'
         AND DATE(s.created_at) = CURRENT_DATE
       GROUP BY i.id, i.name
       ORDER BY total_quantity DESC
       LIMIT 10`,
      [session_id]
    );

    res.json({
      success: true,
      data: {
        summary: summary.rows[0],
        top_items: topItems.rows
      }
    });

  } catch (error) {
    console.error('Get Today Summary Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s summary',
      error: error.message
    });
  }
};

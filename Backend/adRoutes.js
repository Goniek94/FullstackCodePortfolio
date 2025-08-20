/**
 * Main Ad Routes
 * Główny plik routingu dla ogłoszeń - importuje wszystkie komponenty
 */

import { Router } from 'express';
import Ad from '../../models/listings/ad.js';
import errorHandler from '../../middleware/errors/errorHandler.js';

// Import route components
import searchRoutes from './ads/search.js';
import crudRoutes from './ads/crud.js';
import featuredRoutes from './ads/featured.js';
import searchStatsRoutes from './searchStatsRoutes.js';

const router = Router();

// Mount route components
router.use('/', searchRoutes);      // Search and filtering routes
router.use('/', crudRoutes);        // CRUD operations
router.use('/', featuredRoutes);    // Featured and rotated ads
router.use('/', searchStatsRoutes); // Search statistics

/**
 * GET /stats - Get ad statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const totalAds = await Ad.countDocuments();
    const activeAds = await Ad.countDocuments({ status: { $in: ['active', 'opublikowane'] } });
    const pendingAds = await Ad.countDocuments({ status: 'pending' });
    const featuredAds = await Ad.countDocuments({ 
      listingType: { $in: ['wyróżnione', 'featured', 'premium'] },
      status: { $in: ['active', 'opublikowane'] }
    });

    // Get brand statistics
    const brandStats = await Ad.aggregate([
      { $match: { status: { $in: ['active', 'opublikowane'] } } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get price statistics
    const priceStats = await Ad.aggregate([
      { $match: { status: { $in: ['active', 'opublikowane'] }, price: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          totalValue: { $sum: '$price' }
        }
      }
  ]);

    res.status(200).json({
      totalAds,
      activeAds,
      pendingAds,
      featuredAds,
      brandStats,
      priceStats: priceStats[0] || {
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0,
        totalValue: 0
      }
    });
  } catch (err) {
    console.error('Error getting ad statistics:', err);
    next(err);
  }
}, errorHandler);

export default router;

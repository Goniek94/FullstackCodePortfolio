/**
 * Ad Controller - Handles all ad-related API endpoints
 * Manages CRUD operations for advertisements
 */

import Ad from "../../models/listings/ad.js";
import {
  getActiveStatusFilter,
  getActiveAdsCount,
} from "../../utils/listings/commonFilters.js";
import logger from "../../utils/logger.js";

/**
 * Controller class for ad endpoints
 */
class AdController {
  /**
   * Get all ads with filtering and pagination
   * GET /api/ads
   */
  static async getAllAds(req, res, next) {
    try {
      const {
        page = 1,
        limit = 30,
        brand,
        model,
        minPrice,
        maxPrice,
        sortBy = "createdAt",
        order = "desc",
        listingType,
      } = req.query;

      // Build filter object - only active ads
      const filter = { status: getActiveStatusFilter() };

      if (brand) filter.brand = brand;
      if (model) filter.model = model;
      if (minPrice)
        filter.price = { ...filter.price, $gte: parseFloat(minPrice) };
      if (maxPrice)
        filter.price = { ...filter.price, $lte: parseFloat(maxPrice) };
      if (listingType) filter.listingType = listingType;

      const sortOptions = {};
      sortOptions[sortBy] = order === "desc" ? -1 : 1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const ads = await Ad.find(filter)
        .select(
          "_id brand model headline title description year price mileage fuelType transmission power images mainImage status listingType createdAt views favorites"
        )
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit));

      const totalAds = await Ad.countDocuments(filter);

      res.status(200).json({
        ads,
        totalPages: Math.ceil(totalAds / parseInt(limit)),
        currentPage: parseInt(page),
        totalAds,
      });
    } catch (error) {
      logger.error("Error in getAllAds", { error: error.message });
      next(error);
    }
  }

  /**
   * Get single ad by ID
   * GET /api/ads/:id
   */
  static async getAdById(req, res, next) {
    try {
      const { id } = req.params;

      const ad = await Ad.findById(id);

      if (!ad) {
        return res.status(404).json({
          success: false,
          message: "Ad not found",
        });
      }

      res.status(200).json({
        success: true,
        data: ad,
      });
    } catch (error) {
      logger.error("Error in getAdById", { error: error.message, adId: id });
      next(error);
    }
  }

  /**
   * Get count of active ads
   * GET /api/ads/active-count
   */
  static async getActiveAdsCount(req, res, next) {
    try {
      const activeCount = await getActiveAdsCount(Ad);

      res.status(200).json({
        activeCount,
        message: `Found ${activeCount} active ads in database`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error in getActiveAdsCount", { error: error.message });
      next(error);
    }
  }

  /**
   * Search ads with advanced filtering and scoring algorithm
   * GET /api/ads/search
   *
   * Features:
   * - Multi-factor relevance scoring
   * - Featured ads priority
   * - Multi-stage sorting (featured → user criteria → score → date)
   * - Seller type filtering
   */
  static async searchAds(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 30;
      const skip = (page - 1) * limit;
      const { sortBy = "createdAt", order = "desc", sellerType } = req.query;

      logger.debug("Search request", { sortBy, order, sellerType });

      // Build filter object - start with active ads only
      const activeFilter = { status: getActiveStatusFilter() };

      // Add seller type filter if provided
      if (sellerType && sellerType !== "all") {
        activeFilter.sellerType = sellerType;
        logger.debug("Applied seller type filter", { sellerType });
      }

      const allAds = await Ad.find(activeFilter);
      logger.debug("Ads found after filters", { count: allAds.length });

      // Calculate match score for each ad
      const adsWithScore = allAds.map((ad) => {
        const match_score = calculateMatchScore(ad, req.query);
        const is_featured = ad.listingType === "wyróżnione" ? 1 : 0;
        return {
          ...ad.toObject(),
          match_score,
          is_featured,
        };
      });

      // Apply multi-stage sorting
      adsWithScore.sort((a, b) => {
        // Stage 1: Prioritize featured ads
        if (b.is_featured !== a.is_featured)
          return b.is_featured - a.is_featured;

        // Stage 2: Apply user-selected sorting
        let comparison = 0;

        switch (sortBy) {
          case "price":
            comparison = (a.price || 0) - (b.price || 0);
            break;
          case "year":
            comparison = (a.year || 0) - (b.year || 0);
            break;
          case "mileage":
            comparison = (a.mileage || 0) - (b.mileage || 0);
            break;
          case "createdAt":
          default:
            comparison = new Date(a.createdAt) - new Date(b.createdAt);
            break;
        }

        // Apply sort order
        const sortMultiplier = order === "desc" ? -1 : 1;
        comparison *= sortMultiplier;

        // Stage 3: Fall back to match score
        if (comparison === 0) {
          if (b.match_score !== a.match_score)
            return b.match_score - a.match_score;

          // Stage 4: Fall back to creation date
          return new Date(b.createdAt) - new Date(a.createdAt);
        }

        return comparison;
      });

      logger.debug("Sorting completed", {
        total: adsWithScore.length,
        sortBy,
        order,
      });

      // Apply pagination
      const paginatedAds = adsWithScore.slice(skip, skip + limit);

      res.status(200).json({
        ads: paginatedAds,
        currentPage: page,
        totalPages: Math.ceil(adsWithScore.length / limit),
        totalAds: adsWithScore.length,
      });
    } catch (error) {
      logger.error("Error in searchAds", { error: error.message });
      next(error);
    }
  }

  /**
   * Get unique brands from active ads
   * GET /api/ads/brands
   */
  static async getBrands(req, res, next) {
    try {
      const activeFilter = { status: getActiveStatusFilter() };
      const brands = await Ad.distinct("brand", activeFilter);

      res
        .status(200)
        .json(brands.filter((brand) => brand && brand.trim() !== ""));
    } catch (error) {
      logger.error("Error in getBrands", { error: error.message });
      next(error);
    }
  }

  /**
   * Get models for a specific brand from active ads
   * GET /api/ads/models
   */
  static async getModels(req, res, next) {
    try {
      const { brand } = req.query;

      if (!brand) {
        return res.status(400).json({
          message: "Brand parameter is required",
        });
      }

      const activeFilter = {
        brand,
        status: getActiveStatusFilter(),
      };
      const models = await Ad.distinct("model", activeFilter);

      res
        .status(200)
        .json(models.filter((model) => model && model.trim() !== ""));
    } catch (error) {
      logger.error("Error in getModels", { error: error.message, brand });
      next(error);
    }
  }

  /**
   * Get similar ads with multi-level fallback strategy
   * GET /api/ads/:id/similar
   *
   * Strategy:
   * 1. Same brand + model + body type
   * 2. Same brand + model (fallback)
   * 3. Same brand + body type (fallback)
   * 4. Same brand only (final fallback)
   */
  static async getSimilarAds(req, res, next) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 6;

      // Get the current ad
      const currentAd = await Ad.findById(id);
      if (!currentAd) {
        return res.status(404).json({
          success: false,
          message: "Ad not found",
        });
      }

      // Build filter for similar ads
      const activeFilter = {
        status: getActiveStatusFilter(),
        _id: { $ne: id }, // Exclude current ad
      };

      // Priority search criteria (multi-level fallback)
      const searchCriteria = [
        // Level 1: Most specific match
        {
          ...activeFilter,
          brand: currentAd.brand,
          model: currentAd.model,
          bodyType: currentAd.bodyType,
        },
        // Level 2: Same brand + model
        {
          ...activeFilter,
          brand: currentAd.brand,
          model: currentAd.model,
        },
        // Level 3: Same brand + body type
        {
          ...activeFilter,
          brand: currentAd.brand,
          bodyType: currentAd.bodyType,
        },
        // Level 4: Same brand only (fallback)
        {
          ...activeFilter,
          brand: currentAd.brand,
        },
      ];

      let similarAds = [];

      // Try each search criteria until we have enough ads
      for (const criteria of searchCriteria) {
        if (similarAds.length >= limit) break;

        const remainingLimit = limit - similarAds.length;
        const foundAds = await Ad.find(criteria)
          .limit(remainingLimit)
          .sort({ createdAt: -1 })
          .select(
            "_id headline brand model year price mileage fuelType mainImage images listingType createdAt bodyType"
          );

        // Add ads that aren't already in the results
        const existingIds = new Set(similarAds.map((ad) => ad._id.toString()));
        const newAds = foundAds.filter(
          (ad) => !existingIds.has(ad._id.toString())
        );

        similarAds.push(...newAds);
      }

      // Limit final results
      similarAds = similarAds.slice(0, limit);

      logger.debug("Similar ads found", {
        adId: id,
        count: similarAds.length,
      });

      res.status(200).json({
        success: true,
        data: similarAds,
        count: similarAds.length,
      });
    } catch (error) {
      logger.error("Error in getSimilarAds", {
        error: error.message,
        adId: id,
      });
      next(error);
    }
  }
}

/**
 * Calculate relevance score for search results
 * Multi-factor scoring algorithm:
 * - Brand + Model exact match: 100 points
 * - Brand match only: 50 points
 * - Price range match: 30 points
 * - Year range match: 20 points
 * - Other attributes: 5-10 points each
 *
 * @param {Object} ad - Advertisement object
 * @param {Object} filters - Search filters
 * @returns {number} - Match score (0-200+)
 */
function calculateMatchScore(ad, filters) {
  let score = 0;

  const normalize = (str) =>
    typeof str === "string" ? str.trim().toLowerCase() : "";

  // Exact brand + model match (highest priority)
  if (
    filters.brand &&
    filters.model &&
    normalize(ad.brand) === normalize(filters.brand) &&
    normalize(ad.model) === normalize(filters.model)
  ) {
    score += 100;
  } else if (
    filters.brand &&
    normalize(ad.brand) === normalize(filters.brand)
  ) {
    score += 50;
  }

  // Price range matching
  if (
    filters.minPrice &&
    filters.maxPrice &&
    ad.price >= parseFloat(filters.minPrice) &&
    ad.price <= parseFloat(filters.maxPrice)
  ) {
    score += 30;
  } else if (filters.minPrice && ad.price >= parseFloat(filters.minPrice)) {
    score += 15;
  } else if (filters.maxPrice && ad.price <= parseFloat(filters.maxPrice)) {
    score += 15;
  }

  // Year range matching
  if (
    filters.minYear &&
    filters.maxYear &&
    ad.year >= parseInt(filters.minYear) &&
    ad.year <= parseInt(filters.maxYear)
  ) {
    score += 20;
  }

  // Additional attribute matching
  if (
    filters.fuelType &&
    normalize(ad.fuelType) === normalize(filters.fuelType)
  ) {
    score += 10;
  }
  if (
    filters.transmission &&
    normalize(ad.transmission) === normalize(filters.transmission)
  ) {
    score += 5;
  }
  if (
    filters.bodyType &&
    normalize(ad.bodyType) === normalize(filters.bodyType)
  ) {
    score += 5;
  }

  return score;
}

export default AdController;

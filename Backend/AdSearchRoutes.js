/**
 * Search Routes dla Ogłoszeń
 * Odpowiada za: wyszukiwanie, filtrowanie i pobieranie list ogłoszeń
 */

import express from 'express';
import { Router } from 'express';
import Ad from '../../models/listings/ad.js';
import errorHandler from '../../middleware/errors/errorHandler.js';
import { createAdFilter, getActiveStatusFilter, getActiveAdsCount } from '../../utils/listings/commonFilters.js';

const router = Router();

// GET /ads - Endpoint zoptymalizowany dla frontendowej wyszukiwarki
router.get('/', async (req, res, next) => {
  const { 
    limit = 10000, // Zwiększony limit dla frontendowego filtrowania
    sortBy = 'createdAt', 
    order = 'desc'
  } = req.query;

  // Tylko aktywne ogłoszenia - bez dodatkowych filtrów (frontend je obsłuży)
  const filter = { status: getActiveStatusFilter() };
  
  console.log('Pobieranie wszystkich aktywnych ogłoszeń dla frontendowej wyszukiwarki');
  
  try {
    // Uproszczone zapytanie - pobieramy wszystkie aktywne ogłoszenia
    const query = Ad.aggregate([
      { $match: filter },
      { $addFields: { 
        sortOrder: { 
          $cond: { 
            if: { $eq: ["$listingType", "wyróżnione"] }, 
            then: 0, 
            else: 1 
          } 
        } 
      }},
      { $sort: { sortOrder: 1, [sortBy]: order === 'desc' ? -1 : 1 } },
      { $limit: parseInt(limit) },
      // Projection - wszystkie pola potrzebne dla frontendowego filtrowania
      { $project: {
        _id: 1,
        brand: 1,
        model: 1,
        headline: 1,
        shortDescription: 1,
        description: 1,
        images: 1,
        mainImage: 1,
        price: 1,
        year: 1,
        mileage: 1,
        fuelType: 1,
        power: 1,
        transmission: 1,
        status: 1,
        listingType: 1,
        createdAt: 1,
        views: 1,
        // Dodatkowe pola dla przyszłych filtrów
        bodyType: 1,
        region: 1,
        city: 1,
        engineCapacity: 1,
        damageStatus: 1,
        vehicleCondition: 1
      }}
    ]);

    const ads = await query;
    const totalAds = ads.length;

    console.log('Zwrócono ogłoszeń dla frontendowej wyszukiwarki:', totalAds);

    // Uproszczona odpowiedź - frontend nie potrzebuje paginacji
    res.status(200).json({
      ads,
      totalAds,
      message: `Pobrano ${totalAds} aktywnych ogłoszeń dla frontendowego filtrowania`
    });
  } catch (err) {
    console.error('Błąd podczas pobierania ogłoszeń:', err);
    next(err);
  }
}, errorHandler);

// GET /ads/count - Endpoint zwracający liczbę ogłoszeń pasujących do kryteriów
router.get('/count', async (req, res, next) => {
  try {
    const filter = createAdFilter(req.query);
    const count = await Ad.countDocuments(filter);
    
    console.log('Zapytanie o liczbę ogłoszeń z filtrami:', req.query);
    console.log('Znaleziono pasujących ogłoszeń:', count);
    
    res.status(200).json({ count });
  } catch (err) {
    console.error('Błąd podczas liczenia ogłoszeń:', err);
    next(err);
  }
}, errorHandler);

// GET /ads/active-count - Endpoint zwracający liczbę wszystkich aktywnych ogłoszeń
router.get('/active-count', async (req, res, next) => {
  try {
    const activeCount = await getActiveAdsCount(Ad);
    
    console.log('Zapytanie o liczbę aktywnych ogłoszeń');
    console.log('Liczba aktywnych ogłoszeń:', activeCount);
    
    res.status(200).json({ 
      activeCount,
      message: `Znaleziono ${activeCount} aktywnych ogłoszeń w bazie danych`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Błąd podczas liczenia aktywnych ogłoszeń:', err);
    next(err);
  }
}, errorHandler);

// GET /ads/body-types - Pobieranie dostępnych typów nadwozi (tylko z aktywnych ogłoszeń)
router.get('/body-types', async (req, res, next) => {
  try {
    const activeFilter = { status: getActiveStatusFilter() };
    const bodyTypes = await Ad.distinct('bodyType', activeFilter);
    const filteredBodyTypes = bodyTypes.filter(type => type && type.trim() !== '');
    res.status(200).json(filteredBodyTypes.sort());
  } catch (err) {
    console.error('Błąd podczas pobierania typów nadwozi:', err);
    next(err);
  }
}, errorHandler);


// GET /ads/brands - Pobieranie dostępnych marek (tylko z aktywnych ogłoszeń)
router.get('/brands', async (req, res, next) => {
  try {
    const activeFilter = { status: getActiveStatusFilter() };
    const brands = await Ad.distinct('brand', activeFilter);
    res.status(200).json(brands);
  } catch (err) {
    next(err);
  }
}, errorHandler);

// GET /ads/models - Pobieranie modeli dla danej marki (tylko z aktywnych ogłoszeń)
router.get('/models', async (req, res, next) => {
  try {
    const { brand } = req.query;
    if (!brand) {
      return res.status(400).json({ message: 'Parametr brand jest wymagany' });
    }
    
    const activeFilter = { 
      brand, 
      status: getActiveStatusFilter() 
    };
    const models = await Ad.distinct('model', activeFilter);
    res.status(200).json(models);
  } catch (err) {
    next(err);
  }
}, errorHandler);

// GET /ads/car-data - Endpoint do pobierania danych o markach i modelach samochodów (tylko z aktywnych ogłoszeń)
router.get('/car-data', async (req, res, next) => {
  try {
    // Pobierz wszystkie unikalne marki i modele z aktywnych ogłoszeń
    const activeFilter = { status: getActiveStatusFilter() };
    const ads = await Ad.find(activeFilter, 'brand model').lean();
    
    // Utwórz obiekt z markami jako kluczami i tablicami modeli jako wartościami
    const carData = {};
    
    ads.forEach(ad => {
      if (ad.brand && ad.model) {
        if (!carData[ad.brand]) {
          carData[ad.brand] = [];
        }
        
        // Dodaj model tylko jeśli jeszcze nie istnieje w tablicy
        if (!carData[ad.brand].includes(ad.model)) {
          carData[ad.brand].push(ad.model);
        }
      }
    });
    
    // Posortuj modele dla każdej marki
    Object.keys(carData).forEach(brand => {
      carData[brand].sort();
    });
    
    res.status(200).json(carData);
  } catch (err) {
    console.error('Błąd podczas pobierania danych o markach i modelach:', err);
    next(err);
  }
}, errorHandler);

// GET /ads/search - Endpoint dla wyszukiwania ogłoszeń (używany przez frontend)
router.get('/search', async (req, res, next) => {
  const { 
    limit = 30,
    page = 1,
    sortBy = 'createdAt', 
    order = 'desc'
  } = req.query;

  console.log('Wyszukiwanie ogłoszeń z parametrami:', req.query);
  
  try {
    // Tworzenie filtra na podstawie parametrów zapytania
    const filter = createAdFilter(req.query);
    
    // Obliczanie paginacji
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Zapytanie z paginacją i sortowaniem
    const query = Ad.aggregate([
      { $match: filter },
      { $addFields: { 
        sortOrder: { 
          $cond: { 
            if: { $eq: ["$listingType", "wyróżnione"] }, 
            then: 0, 
            else: 1 
          } 
        } 
      }},
      { $sort: { sortOrder: 1, [sortBy]: order === 'desc' ? -1 : 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      // Projection - wszystkie pola potrzebne dla frontendu
      { $project: {
        _id: 1,
        brand: 1,
        model: 1,
        headline: 1,
        shortDescription: 1,
        description: 1,
        images: 1,
        mainImage: 1,
        mainImageIndex: 1,
        price: 1,
        year: 1,
        mileage: 1,
        fuelType: 1,
        power: 1,
        transmission: 1,
        status: 1,
        listingType: 1,
        createdAt: 1,
        views: 1,
        bodyType: 1,
        region: 1,
        city: 1,
        voivodeship: 1,
        engineCapacity: 1,
        engineSize: 1,
        capacity: 1,
        damageStatus: 1,
        vehicleCondition: 1,
        condition: 1,
        sellerType: 1,
        drive: 1
      }}
    ]);

    const ads = await query;
    
    // Obliczanie całkowitej liczby ogłoszeń dla paginacji
    const totalAds = await Ad.countDocuments(filter);
    const totalPages = Math.ceil(totalAds / parseInt(limit));

    console.log(`Znaleziono ${ads.length} ogłoszeń na stronie ${page}/${totalPages} (łącznie: ${totalAds})`);

    res.status(200).json({
      ads,
      totalAds,
      totalPages,
      currentPage: parseInt(page),
      hasNextPage: parseInt(page) < totalPages,
      hasPrevPage: parseInt(page) > 1,
      message: `Pobrano ${ads.length} ogłoszeń`
    });
  } catch (err) {
    console.error('Błąd podczas wyszukiwania ogłoszeń:', err);
    next(err);
  }
}, errorHandler);

export default router;

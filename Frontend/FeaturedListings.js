/**
 * FeaturedListings Component - Landing Page Section
 *
 * Features:
 * - Rotated listings with fallback strategy
 * - Content categorization (featured/hot/regular)
 * - Auto-refresh on mount
 * - Responsive grid layouts (2-4-4 pattern)
 * - Error recovery with retry
 * - Loading states
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FaCheckCircle, FaTimesCircle, FaSync } from "react-icons/fa";
import AdsService from "../../services/ads";
import MainFeatureListing from "./MainFeatureListing";
import SmallListingCard from "./SmallListingCard";

const FeaturedListings = () => {
  const [featuredListings, setFeaturedListings] = useState([]);
  const [hotListings, setHotListings] = useState([]);
  const [normalListings, setNormalListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLogoutMessage, setShowLogoutMessage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Check if user just logged out
  useEffect(() => {
    const justLoggedOut = localStorage.getItem("justLoggedOut");
    if (justLoggedOut === "true") {
      setShowLogoutMessage(true);
      localStorage.removeItem("justLoggedOut");

      const timer = setTimeout(() => {
        setShowLogoutMessage(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, []);

  /**
   * Fetch listings with rotation and fallback strategy
   *
   * Strategy:
   * 1. Try to fetch rotated listings from API
   * 2. If fails, fallback to fetching all listings
   * 3. Categorize listings into featured/hot/regular (2-4-4 pattern)
   */
  const fetchListings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Add timestamp to force browser cache refresh
      const timestamp = new Date().getTime();
      const response = await AdsService.getRotatedListings();

      // Handle different response formats
      let data = response;
      if (response && response.data) {
        data = response.data;
      }

      // Verify data completeness
      if (data && data.featured && data.hot && data.regular) {
        setFeaturedListings(data.featured || []);
        setHotListings(data.hot || []);
        setNormalListings(data.regular || []);
        setError(null);
      } else {
        throw new Error("Incomplete API response");
      }
    } catch (err) {
      // FALLBACK STRATEGY - fetch all listings and categorize
      try {
        const fallbackResponse = await AdsService.getAll({ limit: 50 });

        // Extract ads array from response
        let allAds = [];
        if (fallbackResponse && fallbackResponse.data) {
          if (Array.isArray(fallbackResponse.data)) {
            allAds = fallbackResponse.data;
          } else if (
            fallbackResponse.data.ads &&
            Array.isArray(fallbackResponse.data.ads)
          ) {
            allAds = fallbackResponse.data.ads;
          }
        } else if (Array.isArray(fallbackResponse)) {
          allAds = fallbackResponse;
        }

        if (allAds.length > 0) {
          // Filter valid listings only
          const validAds = allAds.filter(
            (ad) => ad && ad._id && ad.brand && ad.model
          );

          // Categorize for 2-4-4 layout
          const featured = validAds.slice(0, 2); // 2 large listings
          const hot = validAds.slice(2, 6); // 4 medium listings
          const regular = validAds.slice(6, 10); // 4 small listings

          setFeaturedListings(featured);
          setHotListings(hot);
          setNormalListings(regular);
          setError(null);
        } else {
          throw new Error("No listings in database");
        }
      } catch (fallbackErr) {
        setError("Failed to load listings");

        // Set empty arrays to prevent rendering errors
        setFeaturedListings([]);
        setHotListings([]);
        setNormalListings([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresh listings handler
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchListings();
  };

  // Fetch listings on component mount
  useEffect(() => {
    fetchListings();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin w-12 h-12 border-4 border-[#35530A] border-t-transparent rounded-full mb-4"></div>
        <div className="text-xl text-gray-600">Loading listings...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">😞</div>
          <div className="text-xl text-red-600 mb-4">{error}</div>
          <button
            onClick={handleRefresh}
            className="bg-[#35530A] text-white px-4 py-2 rounded hover:bg-[#2A4208] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {/* Logout message - mobile optimized */}
      {showLogoutMessage && (
        <div className="fixed top-4 left-2 right-2 sm:top-20 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 z-50 bg-green-100 border border-green-400 text-green-700 px-3 py-2 sm:px-6 sm:py-3 rounded shadow-lg flex items-center text-sm sm:text-base">
          <FaCheckCircle className="text-green-500 mr-2 flex-shrink-0" />
          <span className="flex-1">Successfully logged out</span>
          <button
            onClick={() => setShowLogoutMessage(false)}
            className="ml-2 sm:ml-4 text-green-800 hover:text-green-900 focus:outline-none flex-shrink-0"
          >
            <FaTimesCircle />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-2 sm:px-3 md:px-4 pt-0 pb-8 sm:pb-10 md:pb-12">
        {/* Header - mobile optimized */}
        <div
          className="text-center mb-3 sm:mb-4 md:mb-6 px-2"
          style={{ marginTop: "-10px" }}
        >
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-800">
            LISTINGS
            <div className="w-12 sm:w-16 md:w-24 h-0.5 bg-[#35530A] mx-auto mt-1 sm:mt-2" />
          </h1>
        </div>

        {/* Check if there are any listings */}
        {featuredListings.length === 0 &&
        hotListings.length === 0 &&
        normalListings.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📭</div>
            <div className="text-xl text-gray-600 mb-4">
              No listings to display
            </div>
            <p className="text-gray-500">
              Add your first listing or check database connection
            </p>
          </div>
        ) : (
          <>
            {/* 2 large featured listings - MainFeatureListing */}
            {featuredListings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {featuredListings.map((listing) => (
                  <MainFeatureListing key={listing._id} listing={listing} />
                ))}
              </div>
            )}

            {/* 4 hot deals - SmallListingCard */}
            {hotListings.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                {hotListings.slice(0, 4).map((listing) => (
                  <SmallListingCard
                    key={listing._id}
                    listing={listing}
                    showHotOffer={true}
                  />
                ))}
              </div>
            )}

            {/* AutoSell brand banner with background */}
            <div className="relative shadow-lg rounded-[2px] h-40 mb-10 flex items-center justify-center border border-gray-200 overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: "url(/automobile-1834278_1920.jpg)",
                }}
              ></div>
              <div className="absolute inset-0 bg-black bg-opacity-50"></div>
              <div className="relative z-10 text-center">
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold drop-shadow-lg mb-2">
                  <span className="text-yellow-400">Auto</span>
                  <span className="text-white">sell.pl</span>
                </h2>
                <p className="text-lg sm:text-xl lg:text-2xl font-medium drop-shadow-lg text-white opacity-90">
                  Find your dream car
                </p>
              </div>
            </div>

            {/* Regular listings - same size */}
            {normalListings.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {normalListings.map((listing) => (
                  <SmallListingCard key={listing._id} listing={listing} />
                ))}
              </div>
            )}
          </>
        )}

        {/* CTA Button */}
        <div className="flex justify-center mt-8 sm:mt-10 lg:mt-12">
          <Link
            to="/listings"
            className="bg-[#35530A] text-white px-6 py-2.5 rounded-[2px] hover:bg-[#2A4208] transition-colors text-sm font-medium"
          >
            View All Listings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default FeaturedListings;

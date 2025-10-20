// SearchFormUpdated.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BasicFilters from "./BasicFilters";
import AdvancedFilters from "./AdvancedFilters";
import SearchFormButtons from "./SearchFormButtons";
import { bodyTypes, advancedOptions, regions } from "./SearchFormConstants";
import AdsService from "../../services/ads";
import useCarData from "./hooks/useCarData";
import useSearchStats from "./hooks/useSearchStats";
import useFilterCounts from "./hooks/useFilterCounts";
import debugUtils from "../../utils/debug";

const { safeConsole } = debugUtils;

/**
 * Updated search form component
 * Uses useCarData hook to fetch brands and models data from backend
 *
 * @param {object} props
 * @param {object} props.initialValues - initial form values
 * @param {function} [props.onFilterChange] - callback to pass filters to parent
 */
export default function SearchFormUpdated({
  initialValues = {},
  onFilterChange,
}) {
  const navigate = useNavigate();

  // Allow passing 'brand' instead of 'make' in initialValues
  const sanitizedInitialValues = { ...initialValues };
  if (sanitizedInitialValues.brand && !sanitizedInitialValues.make) {
    sanitizedInitialValues.make = sanitizedInitialValues.brand;
    delete sanitizedInitialValues.brand;
  }

  // Fetch brands and models data from backend
  const {
    carData,
    brands,
    getModelsForBrand,
    getGenerationsForModel,
    loading,
    error,
  } = useCarData();

  // Form state
  const [formData, setFormData] = useState(() => ({
    make: [], // Checklist - must be array
    model: [], // Checklist - must be array
    generation: [], // Checklist - must be array
    priceFrom: "",
    priceTo: "",
    yearFrom: "",
    yearTo: "",
    bodyType: [], // Checklist - must be array
    damageStatus: "",
    country: "",
    region: [], // Checklist - must be array
    city: [], // Checklist - must be array
    fuelType: [], // Checklist - must be array
    driveType: "",
    mileageFrom: "",
    mileageTo: "",
    location: "",
    transmission: [], // Checklist - must be array
    enginePowerFrom: "",
    enginePowerTo: "",
    engineCapacityFrom: "",
    engineCapacityTo: "",
    color: [], // Checklist - must be array
    doorCount: [], // Checklist - must be array
    tuning: "",
    condition: [], // Checklist - must be array
    accidentStatus: "",
    countryOfOrigin: [], // Checklist - must be array
    finish: [], // Checklist - must be array
    weightFrom: "",
    weightTo: "",
    vehicleCondition: "",
    sellingForm: "",
    sellerType: "",
    vat: false,
    invoiceOptions: false,
    imported: false,
    registeredInPL: false,
    firstOwner: false,
    disabledAdapted: false,
    ...sanitizedInitialValues,
  }));

  // Hook for real-time search statistics
  const { stats } = useSearchStats(formData);

  // Hook for filter counts - new cascading filtering system
  const { totalMatching, loading: countsLoading } = useFilterCounts(formData);

  // Available models for selected brand
  const [availableModels, setAvailableModels] = useState([]);

  // Show advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Number of matching results from backend - using new hook
  const matchingResults = totalMatching;

  // Function to reset all filters
  const resetAllFilters = () => {
    // List of all form fields to reset
    const defaultFormData = {
      make: [], // Checklist - must be array
      model: [], // Checklist - must be array
      generation: [], // Checklist - must be array
      priceFrom: "",
      priceTo: "",
      yearFrom: "",
      yearTo: "",
      bodyType: [], // Checklist - must be array
      damageStatus: "",
      country: "",
      region: [], // Checklist - must be array
      city: [], // Checklist - must be array
      fuelType: [], // Checklist - must be array
      driveType: "",
      mileageFrom: "",
      mileageTo: "",
      location: "",
      transmission: [], // Checklist - must be array
      enginePowerFrom: "",
      enginePowerTo: "",
      engineCapacityFrom: "",
      engineCapacityTo: "",
      color: [], // Checklist - must be array
      doorCount: [], // Checklist - must be array
      tuning: "",
      condition: [], // Checklist - must be array
      accidentStatus: "",
      countryOfOrigin: [], // Checklist - must be array
      finish: [], // Checklist - must be array
      weightFrom: "",
      weightTo: "",
      sellerType: "",
      imported: false,
      registeredInPL: false,
      firstOwner: false,
      disabledAdapted: false,
      vehicleCondition: "",
      sellingForm: "",
      vat: false,
      invoiceOptions: false,
    };

    // Reset forms
    setFormData(defaultFormData);

    // Reset available models
    setAvailableModels([]);
  };

  // Update available models when brand changes
  useEffect(() => {
    const updateModels = async () => {
      if (formData.make && formData.make.length > 0) {
        // If one brand is selected, fetch its models
        if (formData.make.length === 1) {
          const models = await getModelsForBrand(formData.make[0]);
          setAvailableModels(models);
        } else {
          // If multiple brands are selected, fetch models for all selected brands
          let allModels = [];
          for (const brand of formData.make) {
            const models = await getModelsForBrand(brand);
            allModels = [...allModels, ...models];
          }
          // Remove duplicates and sort
          const uniqueModels = [...new Set(allModels)].sort();
          setAvailableModels(uniqueModels);
        }
      } else {
        setAvailableModels([]);
      }
    };

    updateModels();
  }, [formData.make, getModelsForBrand]);

  // Handle form field changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      let finalValue = value;
      if (
        [
          "priceFrom",
          "priceTo",
          "mileageFrom",
          "mileageTo",
          "enginePowerFrom",
          "enginePowerTo",
          "engineCapacityFrom",
          "engineCapacityTo",
        ].includes(name)
      ) {
        if (Number(value) < 0) finalValue = 0;
      }
      setFormData((prev) => ({ ...prev, [name]: finalValue }));
    }
  };

  // Handle search button
  const handleSearch = () => {
    // ALWAYS convert 'make' to 'brand' before sending
    const filtersToSend = { ...formData };
    if (filtersToSend.make) {
      filtersToSend.brand = filtersToSend.make;
      delete filtersToSend.make;
    }

    if (onFilterChange) {
      onFilterChange(filtersToSend);
    } else {
      // Navigate to search results page
      const searchParams = new URLSearchParams();

      // Transform form parameters to URL parameters
      Object.entries(filtersToSend).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          // Use key without changes (make already converted to brand)
          const paramName = key;

          if (typeof value === "boolean") {
            searchParams.append(paramName, value.toString());
          } else if (Array.isArray(value)) {
            // Handle arrays - append each value separately with [] notation
            if (value.length > 0) {
              value.forEach((item) => {
                if (item !== "" && item !== null && item !== undefined) {
                  searchParams.append(`${paramName}[]`, item);
                }
              });
            }
          } else {
            searchParams.append(paramName, value);
          }
        }
      });

      const finalURL = `/listings?${searchParams.toString()}`;
      navigate(finalURL);
    }
  };

  // Generate year options
  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    return Array.from(
      { length: currentYear - 1989 },
      (_, i) => currentYear - i
    );
  };

  return (
    <section>
      {/* Loading message - hidden */}
      {/* {loading && (
        <div className="bg-blue-50 p-3 mb-4 rounded-md text-blue-700 text-center">
          Ładowanie danych o markach i modelach...
        </div>
      )} */}

      <div className="bg-white p-3 sm:p-4 md:p-5 shadow-xl shadow-gray-300/60 rounded-[2px] mb-3 sm:mb-4 max-w-7xl mx-auto border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-2 sm:gap-0">
          <h2 className="text-lg sm:text-xl font-bold text-[#35530A]">
            Filtry wyszukiwania
          </h2>
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-xs sm:text-sm text-[#35530A] hover:text-[#2a4208] hover:underline self-start sm:self-auto"
          >
            Wyczyść wszystkie filtry
          </button>
        </div>

        <BasicFilters
          formData={formData}
          handleInputChange={handleInputChange}
          carData={carData}
          bodyTypes={bodyTypes}
          availableModels={availableModels}
          generateYearOptions={generateYearOptions}
          advancedOptions={advancedOptions}
          regions={regions}
          getGenerationsForModel={getGenerationsForModel}
        />

        {showAdvanced && (
          <AdvancedFilters
            formData={formData}
            handleInputChange={handleInputChange}
            advancedOptions={advancedOptions}
            regions={regions}
            carData={carData}
            resetAllFilters={resetAllFilters}
          />
        )}

        <SearchFormButtons
          formData={formData}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          handleSearch={handleSearch}
          matchingResults={matchingResults}
          totalResults={stats.totalCount}
        />
      </div>
    </section>
  );
}

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import getImageUrl from "../../../utils/responsive/getImageUrl";
import PhotoModal from "../../ui/PhotoModal";

const ImageGallery = ({ images = [] }) => {
  const [selectedImage, setSelectedImage] = useState(0);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  // If there are no images, display placeholder
  const displayImages =
    images && images.length > 0 ? images : ["/images/auto-788747_1280.jpg"];

  const handlePrevImage = () => {
    setSelectedImage((prev) =>
      prev > 0 ? prev - 1 : displayImages.length - 1
    );
  };

  const handleNextImage = () => {
    setSelectedImage((prev) =>
      prev < displayImages.length - 1 ? prev + 1 : 0
    );
  };

  const openPhotoModal = (index) => {
    setPhotoIndex(index);
    setIsPhotoModalOpen(true);
  };

  const closePhotoModal = () => {
    setIsPhotoModalOpen(false);
  };

  const nextPhoto = () => {
    setPhotoIndex((prev) => (prev < displayImages.length - 1 ? prev + 1 : 0));
  };

  const prevPhoto = () => {
    setPhotoIndex((prev) => (prev > 0 ? prev - 1 : displayImages.length - 1));
  };

  return (
    <div className="bg-white p-4 shadow-md rounded-sm">
      <div className="relative w-full aspect-video md:h-[400px] md:aspect-auto mb-4">
        <img
          src={getImageUrl(displayImages[selectedImage])}
          alt={`Zdjęcie ${selectedImage + 1}`}
          className="w-full h-full object-cover rounded-sm cursor-pointer"
          onClick={() => openPhotoModal(selectedImage)}
        />
        <div className="absolute top-1/2 -translate-y-1/2 flex justify-between w-full px-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrevImage();
            }}
            className="bg-white/80 p-2 hover:bg-white transition-colors rounded-sm"
            title="Poprzednie"
          >
            <ChevronLeft className="w-6 h-6 text-black" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNextImage();
            }}
            className="bg-white/80 p-2 hover:bg-white transition-colors rounded-sm"
            title="Następne"
          >
            <ChevronRight className="w-6 h-6 text-black" />
          </button>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded-sm text-sm">
          {selectedImage + 1} / {displayImages.length}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
        {displayImages.map((img, index) => (
          <div
            key={index}
            onClick={() => setSelectedImage(index)}
            className={`
              relative cursor-pointer overflow-hidden rounded-lg
              transition-all duration-200
              ${
                selectedImage === index
                  ? "ring-4 ring-[#35530A] ring-offset-2"
                  : "hover:ring-2 hover:ring-[#35530A]/50"
              }
            `}
            style={{ width: "100%", height: "100px" }}
          >
            <img
              src={getImageUrl(img)}
              alt={`Miniatura ${index + 1}`}
              className="w-full h-full object-cover object-center"
              loading="lazy"
            />
            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              {index + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Photo modal */}
      <PhotoModal
        isOpen={isPhotoModalOpen}
        photos={displayImages.map((img) => getImageUrl(img))}
        photoIndex={photoIndex}
        onClose={closePhotoModal}
        prevPhoto={prevPhoto}
        nextPhoto={nextPhoto}
      />
    </div>
  );
};

export default ImageGallery;

import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer, RotateCcw, Sparkles } from 'lucide-react';
import { Template, Layout } from '../types';

interface PhotoStripCanvasProps {
  photos: string[];
  layout: Layout;
  template: Template;
  caption: string;
  subCaption: string;
  onRetake: () => void;
}

export const PhotoStripCanvas: React.FC<PhotoStripCanvasProps> = ({
  photos,
  layout,
  template,
  caption,
  subCaption,
  onRetake
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    renderCanvas();
  }, [photos, layout, template, caption, subCaption]);

  const renderCanvas = async () => {
    setLoading(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Design-scale settings: Target canvas width is 800px for print quality
    const baseWidth = 800;
    
    // Scale template parameters relative to 350px viewport configuration
    const scaleFactor = baseWidth / 350;
    const padding = template.padding * scaleFactor;
    const gap = template.gap * scaleFactor;
    const borderRadius = template.borderRadius * scaleFactor;
    const borderWidth = template.borderWidth * scaleFactor;
    const bottomSpace = template.bottomSpace * scaleFactor;

    // Load all photo images
    const loadImages = photos.map(src => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = src;
      });
    });

    try {
      const loadedPhotos = await Promise.all(loadImages);
      
      // Calculate photo dimensions
      const photoWidth = baseWidth - (padding * 2);
      // Compute photo height based on layout aspect ratio (width / ratio)
      const photoHeight = photoWidth / layout.aspectRatio;
      
      // Calculate canvas height
      const n = layout.photosCount;
      const totalCanvasHeight = (padding * 2) + (photoHeight * n) + (gap * (n - 1)) + bottomSpace;

      // Update canvas dimensions
      canvas.width = baseWidth;
      canvas.height = totalCanvasHeight;

      // Draw background
      ctx.fillStyle = template.backgroundColor;
      ctx.fillRect(0, 0, baseWidth, totalCanvasHeight);

      // Draw photos
      loadedPhotos.forEach((img, idx) => {
        const x = padding;
        const y = padding + idx * (photoHeight + gap);

        ctx.save();

        // Round photo corners
        if (borderRadius > 0) {
          ctx.beginPath();
          ctx.moveTo(x + borderRadius, y);
          ctx.lineTo(x + photoWidth - borderRadius, y);
          ctx.quadraticCurveTo(x + photoWidth, y, x + photoWidth, y + borderRadius);
          ctx.lineTo(x + photoWidth, y + photoHeight - borderRadius);
          ctx.quadraticCurveTo(x + photoWidth, y + photoHeight, x + photoWidth - borderRadius, y + photoHeight);
          ctx.lineTo(x + borderRadius, y + photoHeight);
          ctx.quadraticCurveTo(x, y + photoHeight, x, y + photoHeight - borderRadius);
          ctx.lineTo(x, y + borderRadius);
          ctx.quadraticCurveTo(x, y, x + borderRadius, y);
          ctx.closePath();
          ctx.clip();
        }

        // Draw image keeping correct aspects (cover style)
        const imageAspectRatio = img.width / img.height;
        const targetAspectRatio = layout.aspectRatio;
        
        let srcX = 0;
        let srcY = 0;
        let srcW = img.width;
        let srcH = img.height;

        if (imageAspectRatio > targetAspectRatio) {
          // Image is wider than crop, crop left/right
          srcW = img.height * targetAspectRatio;
          srcX = (img.width - srcW) / 2;
        } else {
          // Image is taller than crop, crop top/bottom
          srcH = img.width / targetAspectRatio;
          srcY = (img.height - srcH) / 2;
        }

        ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, photoWidth, photoHeight);
        ctx.restore();

        // Draw border around individual photos if template requires
        if (borderWidth > 0) {
          ctx.lineWidth = borderWidth;
          ctx.strokeStyle = template.borderColor;
          
          if (borderRadius > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x + borderRadius, y);
            ctx.lineTo(x + photoWidth - borderRadius, y);
            ctx.quadraticCurveTo(x + photoWidth, y, x + photoWidth, y + borderRadius);
            ctx.lineTo(x + photoWidth, y + photoHeight - borderRadius);
            ctx.quadraticCurveTo(x + photoWidth, y + photoHeight, x + photoWidth - borderRadius, y + photoHeight);
            ctx.lineTo(x + borderRadius, y + photoHeight);
            ctx.quadraticCurveTo(x, y + photoHeight, x, y + photoHeight - borderRadius);
            ctx.lineTo(x, y + borderRadius);
            ctx.quadraticCurveTo(x, y, x + borderRadius, y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.strokeRect(x, y, photoWidth, photoHeight);
          }
        }
      });

      // Draw frameOverlay if exists and configured
      if (template.frameOverlay) {
        try {
          const overlayImg = await new Promise<HTMLImageElement>((res, rej) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => rej(new Error('Overlay load error'));
            img.src = template.frameOverlay!;
          });
          ctx.drawImage(overlayImg, 0, 0, baseWidth, totalCanvasHeight);
        } catch (e) {
          console.warn('Frame overlay image not loaded, proceeding with standard styling');
        }
      }

      // Draw bottom text captions
      const textYStart = totalCanvasHeight - (bottomSpace / 1.7);
      
      // Draw Title/Names
      if (caption) {
        ctx.font = `650 ${32 * scaleFactor}px ${template.fontFamily}`;
        ctx.fillStyle = template.textColor;
        ctx.textAlign = 'center';
        ctx.fillText(caption, baseWidth / 2, textYStart);
      }

      // Draw Subcaption/Date
      if (subCaption) {
        ctx.font = `400 ${18 * scaleFactor}px ${template.fontFamily}`;
        // Slightly lower opacity/lighter color for subcaption
        ctx.fillStyle = template.textColor + 'CC'; // Adding hex alpha
        ctx.textAlign = 'center';
        ctx.fillText(subCaption, baseWidth / 2, textYStart + (28 * scaleFactor));
      }

      // Expose output URL
      const url = canvas.toDataURL('image/png');
      setDataUrl(url);
      setLoading(false);
    } catch (err) {
      console.error('Error drawing photo strip:', err);
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    const safeName = caption.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'photo';
    link.download = `photobooth_${safeName}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handlePrint = () => {
    if (!dataUrl) return;
    
    // Create print window containing only the high-res image
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Photo Strip</title>
            <style>
              body {
                margin: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                background-color: white;
              }
              img {
                max-height: 100vh;
                max-width: 100vw;
                object-fit: contain;
              }
              @page {
                size: auto;
                margin: 0;
              }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      {/* Photo Strip Preview Frame */}
      <div className="relative w-full max-w-[320px] sm:max-w-[350px] bg-white rounded-3xl border border-stone-200/80 shadow-premium p-4 flex flex-col items-center transition-all">
        {loading && (
          <div className="absolute inset-0 bg-[#FCFAF7]/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center rounded-3xl text-stone-500">
            <Sparkles className="w-8 h-8 animate-spin text-rose-500 mb-2" />
            <span className="text-sm font-sans font-medium">Generating your strip...</span>
          </div>
        )}
        
        {/* Hidden high-res canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Display rendering */}
        {dataUrl && (
          <img 
            src={dataUrl} 
            alt="Your photo strip preview" 
            className="w-full h-auto rounded-2xl shadow-card select-none"
          />
        )}
      </div>

      {/* Buttons Action Panel */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <button
          onClick={handleDownload}
          disabled={loading || !dataUrl}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-full text-xs sm:text-sm font-sans font-semibold bg-stone-900 hover:bg-stone-800 text-white shadow-sm transition-all disabled:bg-stone-200"
        >
          <Download className="w-4 h-4" />
          Download
        </button>

        <button
          onClick={handlePrint}
          disabled={loading || !dataUrl}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-full text-xs sm:text-sm font-sans font-semibold bg-stone-100 hover:bg-stone-200 text-stone-850 shadow-sm border border-stone-200/60 transition-all disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          Print Strip
        </button>

        <button
          onClick={onRetake}
          className="col-span-2 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-xs sm:text-sm font-sans font-semibold bg-white hover:bg-stone-50 text-rose-600 shadow-sm border border-stone-200 transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          Retake / New Session
        </button>
      </div>
    </div>
  );
};

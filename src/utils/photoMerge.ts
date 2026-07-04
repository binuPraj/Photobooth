/**
 * Merges two base64 image strings side-by-side into a single 4:3 ratio image.
 * Left half contains the host's photo, right half contains the guest's photo.
 */
export const mergePhotosSideBySide = (
  photo1: string,
  photo2: string,
  aspectRatio: number = 4 / 3
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img1 = new Image();
    const img2 = new Image();

    let loadedCount = 0;
    const onImageLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        // Both images loaded, draw on canvas
        const canvas = document.createElement('canvas');
        
        // Define canvas dimensions (e.g. 800 x 600 for 4:3 aspect ratio)
        const canvasWidth = 800;
        const canvasHeight = canvasWidth / aspectRatio;
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get 2D context'));
          return;
        }

        const halfWidth = canvasWidth / 2;

        // Draw left photo (photo1)
        drawCroppedToRect(ctx, img1, 0, 0, halfWidth, canvasHeight);

        // Draw right photo (photo2)
        drawCroppedToRect(ctx, img2, halfWidth, 0, halfWidth, canvasHeight);

        // Add a very thin, clean middle separator line
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(halfWidth, 0);
        ctx.lineTo(halfWidth, canvasHeight);
        ctx.stroke();

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      }
    };

    img1.onload = onImageLoaded;
    img2.onload = onImageLoaded;
    img1.onerror = () => reject(new Error('Failed to load first image'));
    img2.onerror = () => reject(new Error('Failed to load second image'));

    img1.src = photo1;
    img2.src = photo2;
  });
};

/**
 * Helper to draw an image centered and cropped ("cover" object-fit style) inside a rectangle.
 */
const drawCroppedToRect = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  const imgAspect = img.width / img.height;
  const targetAspect = w / h;

  let srcX = 0;
  let srcY = 0;
  let srcW = img.width;
  let srcH = img.height;

  if (imgAspect > targetAspect) {
    // Image is wider than destination rect aspect ratio
    srcW = img.height * targetAspect;
    srcX = (img.width - srcW) / 2;
  } else {
    // Image is taller than destination rect aspect ratio
    srcH = img.width / targetAspect;
    srcY = (img.height - srcH) / 2;
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, w, h);
};

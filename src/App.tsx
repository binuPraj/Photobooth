import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LayoutSelector } from './components/LayoutSelector';
import { TemplateSelector } from './components/TemplateSelector';
import { ControlPanel } from './components/ControlPanel';
import { CameraView } from './components/CameraView';
import { PhotoStripCanvas } from './components/PhotoStripCanvas';
import { Template, Layout } from './types';
import { Sparkles, Heart } from 'lucide-react';

const STATIC_LAYOUTS: Layout[] = [
  { id: 'duo', name: 'Duo Strip', photosCount: 2, aspectRatio: 4 / 3, description: 'Double visual stack' },
  { id: 'trio', name: 'Trio Strip', photosCount: 3, aspectRatio: 4 / 3, description: 'Triple visual stack' },
  { id: 'classic-quad', name: 'Classic Strip', photosCount: 4, aspectRatio: 4 / 3, description: 'Traditional four-photo strip' }
];

// Fallback templates in case config.json fails to fetch
const FALLBACK_TEMPLATES: Template[] = [
  {
    id: 'warm-minimal',
    name: 'Warm Minimalist',
    backgroundColor: '#FAF6F0',
    textColor: '#4A3F35',
    fontFamily: 'Outfit, sans-serif',
    borderColor: '#EAE3D2',
    borderWidth: 4,
    padding: 24,
    gap: 16,
    bottomSpace: 70,
    borderRadius: 6,
    description: 'Clean and timeless with soft off-white tones.'
  },
  {
    id: 'vintage-dark',
    name: 'Classic Vintage',
    backgroundColor: '#191919',
    textColor: '#F5F5F5',
    fontFamily: 'Playfair Display, serif',
    borderColor: '#2A2A2A',
    borderWidth: 6,
    padding: 26,
    gap: 18,
    bottomSpace: 75,
    borderRadius: 0,
    description: 'High-contrast retro style with dark aesthetic borders.'
  }
];

export default function App() {
  const [templates, setTemplates] = useState<Template[]>(FALLBACK_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(FALLBACK_TEMPLATES[0]);
  const [selectedLayout, setSelectedLayout] = useState<Layout>(STATIC_LAYOUTS[2]); // Default classic 4 photos
  
  // Custom user captions
  const [caption, setCaption] = useState<string>('Happy Times');
  const [subCaption, setSubCaption] = useState<string>('');
  
  const [countdownDuration, setCountdownDuration] = useState<number>(3);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isPhotoSessionActive, setIsPhotoSessionActive] = useState<boolean>(true);

  // Load date caption on mount
  useEffect(() => {
    const today = new Date();
    const formatted = today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    setSubCaption(formatted);
  }, []);

  // Fetch templates config dynamically from public folder
  useEffect(() => {
    fetch('/templates/config.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch config');
        return res.json();
      })
      .then(data => {
        if (data.templates && data.templates.length > 0) {
          setTemplates(data.templates);
          setSelectedTemplate(data.templates[0]);
        }
      })
      .catch(err => {
        console.warn('Using fallback templates due to catalog load issue:', err);
      });
  }, []);

  const handleCaptureComplete = (capturedPhotos: string[]) => {
    setPhotos(capturedPhotos);
    setIsPhotoSessionActive(false);
  };

  const handleResetSession = () => {
    setPhotos([]);
    setIsPhotoSessionActive(true);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col font-sans select-none">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 md:py-12 flex flex-col lg:flex-row gap-8 lg:gap-12">
        
        {/* Left Side: Parameters Form Panel */}
        <section className="w-full lg:w-[380px] flex flex-col gap-6 lg:sticky lg:top-24 h-fit">
          <div className="bg-white rounded-3xl border border-stone-200/80 shadow-pinterest p-5 sm:p-6 flex flex-col gap-6">
            <div className="border-b border-stone-100 pb-4">
              <h2 className="text-base font-bold text-stone-850 flex items-center gap-2">
                Customize Photo Booth
              </h2>
              <p className="text-xs text-stone-500 font-sans mt-0.5">Adjust templates, styles, and photo variables.</p>
            </div>

            <LayoutSelector
              layouts={STATIC_LAYOUTS}
              selectedLayout={selectedLayout}
              onLayoutSelect={setSelectedLayout}
              disabled={!isPhotoSessionActive}
            />

            <TemplateSelector
              templates={templates}
              selectedTemplate={selectedTemplate}
              onTemplateSelect={setSelectedTemplate}
              disabled={!isPhotoSessionActive}
            />

            <ControlPanel
              caption={caption}
              onCaptionChange={setCaption}
              subCaption={subCaption}
              onSubCaptionChange={setSubCaption}
              countdownDuration={countdownDuration}
              onCountdownChange={setCountdownDuration}
              disabled={!isPhotoSessionActive}
            />
          </div>

          {/* Elegant Footer Details */}
          <div className="px-4 text-center lg:text-left flex items-center justify-center lg:justify-start gap-1.5 text-stone-400 text-xs font-sans">
            <span>Made with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            <span>for beautiful memories</span>
          </div>
        </section>

        {/* Right Side: Interactive Sandbox Area */}
        <section className="flex-1 flex flex-col justify-start">
          {isPhotoSessionActive ? (
            <div className="flex flex-col gap-6 items-center">
              <div className="text-center max-w-md mx-auto mb-2">
                <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full text-[11px] text-amber-850 font-sans font-medium mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Choose layouts, grant camera and click start!</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold font-sans text-stone-900 tracking-tight">
                  Ready to strike a pose?
                </h3>
                <p className="text-xs sm:text-sm text-stone-500 font-sans mt-1">
                  Start the countdown sequence or drop pictures to build your high-quality digital memories.
                </p>
              </div>

              <CameraView
                layout={selectedLayout}
                onPhotosCaptured={handleCaptureComplete}
                onPhotosUploaded={handleCaptureComplete}
                countdownDuration={countdownDuration}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4 items-center">
              <div className="text-center max-w-md mx-auto mb-2">
                <h3 className="text-xl sm:text-2xl font-bold font-sans text-stone-900 tracking-tight">
                  Your Photo Strip is Ready!
                </h3>
                <p className="text-xs sm:text-sm text-stone-500 font-sans mt-1">
                  Preview your digital strip below. Download the image or print it directly.
                </p>
              </div>

              <PhotoStripCanvas
                photos={photos}
                layout={selectedLayout}
                template={selectedTemplate}
                caption={caption}
                subCaption={subCaption}
                onRetake={handleResetSession}
              />
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

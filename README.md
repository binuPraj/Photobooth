# PhotoBooth Studio 📸

A modern, elegant, and aesthetic web application inspired by vintage photobooths, designed with a Pinterest-inspired UI. It enables couples, friends, and groups to create beautiful digital photo strips entirely in the browser using React, TypeScript, Vite, Tailwind CSS, and Framer Motion.

## Features

- **Webcam Integration**: Sequential photo capture using the browser's MediaDevices API.
- **Configurable Countdown**: Visual countdown numbers animated with Framer Motion (3s, 5s, or 8s).
- **Camera Flash Effect**: Classic camera flash animation overlay.
- **Upload Backup**: Option to drag-and-drop or select local images to build a photo strip when a webcam is not available.
- **Modular Template System**: Background styles, margins, gaps, border roundings, and custom typography configured entirely through external files.
- **High-Resolution Rendering**: Generates clean, crisp, print-ready canvas outputs (800px width base scaled for quality).
- **Print & Download**: Instant PNG downloads or page layout printing.

---

## Folder Structure

```text
├── public/
│   └── templates/
│       └── config.json       # Modular templates database catalog
├── src/
│   ├── components/
│   │   ├── Header.tsx        # Top navigation layout
│   │   ├── CameraView.tsx    # MediaDevices API, countdown timers, flash effects
│   │   ├── LayoutSelector.tsx # Grid select triggers (Duo, Trio, Quad)
│   │   ├── TemplateSelector.tsx # Dynamic theme cards
│   │   ├── ControlPanel.tsx  # Name & Date configuration inputs
│   │   └── PhotoStripCanvas.tsx # HTML5 Canvas layout generator
│   ├── types/
│   │   └── index.ts          # Template, Layout, and State interfaces
│   ├── App.tsx               # Master state provider
│   ├── index.css             # Tailwind rules & animations
│   └── main.tsx              # React mounting root
├── index.html                # HTML document & Google Fonts injection
├── package.json              # Scripts and dependencies
├── tailwind.config.js        # Theme customizations
├── tsconfig.json             # TypeScript configurations
└── vite.config.ts            # Vite compile and local configurations
```

---

## Modular Template System

The application relies on a modular layout template catalog defined in `public/templates/config.json`. To add a new aesthetic design (e.g. Vintage, Scrapbook, Minimal, Birthday theme) or change the options, modify the JSON catalog without touching any React code.

### Schema Fields
* `id`: Unique identifier string for the template.
* `name`: Display name shown to users.
* `backgroundColor`: The main color of the strip backing (hex).
* `textColor`: The color of the footer text caption.
* `fontFamily`: Standard/custom font name (ensure it's imported in `index.html` or CSS).
* `borderColor`: Border color drawn around photos.
* `borderWidth`: Border width around photos in pixels.
* `padding`: Margin size on the outer boundaries of the strip.
* `gap`: Gap size between stacked photos.
* `bottomSpace`: Reserved spacing height at the bottom of the strip for names/dates.
* `borderRadius`: Rounding value for individual photo corners.
* `description`: Short subtitle description about the vibe.
* `frameOverlay` (Optional): Relative path to a PNG overlay image that should be layered over the top.

Example configuration in `public/templates/config.json`:
```json
{
  "templates": [
    {
      "id": "warm-minimal",
      "name": "Warm Minimalist",
      "backgroundColor": "#FAF6F0",
      "textColor": "#4A3F35",
      "fontFamily": "Outfit, sans-serif",
      "borderColor": "#EAE3D2",
      "borderWidth": 4,
      "padding": 24,
      "gap": 16,
      "bottomSpace": 70,
      "borderRadius": 6,
      "description": "Clean and timeless with soft off-white tones."
    }
  ]
}
```

---

## Setup & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
The app will be available locally at `http://localhost:3000`.

### 3. Build for Production
To check for TypeScript compiler warnings and compile the static bundle:
```bash
npm run build
```

---

## Deployment to Vercel

This app is 100% client-side and requires no server-side compilation or backend database. It is optimized to deploy directly to Vercel without any special configuration.

1. Install the Vercel CLI (optional) or link your GitHub repository.
2. In Vercel, import the repository and select the **Vite** framework preset.
3. Keep the default build configurations:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Click **Deploy**. Vercel will host your static files and serve them instantly over CDN with HTTPS.

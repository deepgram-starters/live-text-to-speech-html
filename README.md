# Live Text-to-Speech HTML Frontend

Pure HTML/CSS/JavaScript frontend for [Deepgram's Text-to-Speech API](https://developers.deepgram.com/docs/text-to-speech).

## Features

- 🎙️ Real-time text-to-speech with live audio playback
- 📝 Interactive text input with character count
- 🎛️ Configurable voice models and settings
- 📊 Connection and usage statistics
- 🎨 Built with [Deepgram Design System](https://github.com/deepgram/design-system)
- 🚀 No framework dependencies - pure vanilla JavaScript

## Prerequisites

- Node.js 14.0.0+
- pnpm 10.0.0+
- A backend server that implements the Text-to-Speech WebSocket endpoint

## Backend Requirements

This frontend requires a backend server that provides:

1. **WebSocket endpoint** at `/tts` that:
   - Accepts WebSocket connections
   - Sends text to Deepgram's Text-to-Speech API
   - Streams back audio data in real-time

2. **HTTP endpoint** at `/metadata` (optional) that returns:
   ```json
   {
     "title": "Your App Title",
     "description": "Your app description",
     "repository": "https://github.com/your-org/your-repo"
   }
   ```

See the [Node.js Live Text-to-Speech starter](https://github.com/deepgram-starters/node-live-text-to-speech) for a complete backend implementation example.

## Quickstart

### Install Dependencies

```bash
pnpm install
```

### Development Mode

**Option 1: With Backend (Recommended)**

When using with a backend like [node-live-text-to-speech](https://github.com/deepgram-starters/node-live-text-to-speech):

- **Access the app at:** `http://localhost:8080` (backend port)
- The backend proxies to Vite on port 5173 for HMR
- Users should NEVER access `http://localhost:5173` directly

The frontend's `vite.config.js` has `strictPort: true`, so Vite will fail if port 5173 is in use rather than switching to an alternative port (which would break the backend proxy).

**Option 2: Standalone (Development Only)**

To run the frontend standalone for UI development:

```bash
pnpm dev
```

This runs on `http://localhost:5173` and proxies `/tts` and `/metadata` requests to `http://localhost:8080`.

To change the backend URL, edit `vite.config.js`:

```javascript
proxy: {
  '/tts': {
    target: 'http://localhost:YOUR_BACKEND_PORT',
    ws: true,
  },
}
```

### Build for Production

```bash
pnpm build
```

Outputs to `dist/` directory. Serve these static files from your backend.

### Preview Production Build

```bash
pnpm preview
```

## Integration Patterns

### Pattern 1: Backend Proxies to Frontend (Development)

**Best for:** Active development with HMR (used by node-live-text-to-speech)

- Backend: `http://localhost:8080` ← **Users access this URL only**
- Frontend (Vite): `http://localhost:5173` (internal, proxied by backend)
- Backend proxies all requests to Vite for HMR
- Vite proxies API routes (`/tts`, `/metadata`) back to backend

### Pattern 2: Backend Serves Frontend (Production)

**Best for:** Production deployment

1. Build frontend: `pnpm build`
2. Copy `dist/*` to backend's static files directory
3. Backend serves both static files and API endpoints

Example with Express:

```javascript
import express from 'express';
import path from 'path';

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// API routes
app.get('/metadata', (req, res) => { /* ... */ });

// WebSocket endpoint at /tts
// ... WebSocket server setup
```

### Pattern 3: CDN + Backend API (Advanced)

**Best for:** Global scale, edge deployment

1. Build frontend: `pnpm build`
2. Deploy `dist/*` to CDN (Cloudflare, Vercel, etc.)
3. Update API endpoints in `main.js` to point to backend
4. Configure CORS on backend

## Configuration

### Voice Settings

Located in the left sidebar:

- **Model**: Select TTS voice model
- **Encoding**: Audio format (linear16, mulaw, etc.)
- **Sample Rate**: Audio sample rate (8000, 16000, 24000, 48000 Hz)
- **Container**: Audio container format (none, mp3, wav, etc.)

Settings can be changed and applied at any time.

### Environment Variables

Set `VITE_PORT` to change dev server port:

```bash
VITE_PORT=3000 pnpm dev
```

## Architecture

```
live-text-to-speech-html/
├── index.html          # Main HTML structure
├── main.js            # All JavaScript logic
├── vite.config.js     # Vite configuration
└── package.json       # Dependencies

main.js modules:
├── State Management   # WebSocket, audio, config state
├── DOM Initialization # Element references, event listeners
├── Metadata Loading   # Fetch /metadata endpoint
├── WebSocket Layer    # Connection, message handling
├── Audio Processing   # Audio queue and playback
└── UI Updates         # Status indicators, stats
```

## API Reference

### WebSocket Messages (Client → Server)

**Configure** - Set TTS parameters
```javascript
{
  type: 'Configure',
  model: 'aura-asteria-en',
  encoding: 'linear16',
  sample_rate: 24000,
  container: 'none'
}
```

**Speak** - Send text to synthesize
```javascript
{
  type: 'Speak',
  text: 'Hello, world!'
}
```

### WebSocket Messages (Server → Client)

**Audio** - Binary audio data from TTS
```javascript
// Binary data (ArrayBuffer)
```

**Metadata** - Audio metadata
```javascript
{
  type: 'Metadata',
  duration: 2.5,
  characters: 13
}
```

**Error** - Error occurred
```javascript
{
  type: 'Error',
  description: 'Error message',
  code: 'ERROR_CODE'
}
```

## Customization

### Styling

Uses Deepgram Design System CSS custom properties:

```css
/* Override in index.html <style> */
:root {
  --dg-primary: #13ef95;
  --dg-background: #0b0b0c;
  --dg-charcoal: #1a1a1f;
}
```

### Adding Features

The code is organized into clear sections in `main.js`:

1. **State Management** - Add new state properties
2. **DOM Elements** - Add new element references
3. **Event Listeners** - Add new interactions
4. **WebSocket Handlers** - Add new message types

## Troubleshooting

### WebSocket connection fails

- Ensure backend is running on correct port
- Check `vite.config.js` proxy configuration
- Verify backend implements `/tts` endpoint

### No audio playback

- Check browser audio permissions
- Verify audio context state (may need user interaction to start)
- Check browser console for audio decoding errors

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Code of Conduct

This project follows the [Deepgram Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

For security policy and procedures, see [SECURITY.md](./SECURITY.md).

## License

MIT - See [LICENSE](./LICENSE)

## Related Projects

- [Node Live Text-to-Speech Starter](https://github.com/deepgram-starters/node-live-text-to-speech) - Complete Node.js backend + this frontend
- [Deepgram Text-to-Speech API Docs](https://developers.deepgram.com/docs/text-to-speech)
- [Deepgram Design System](https://github.com/deepgram/design-system)

## Getting Help

- [Open an issue](https://github.com/deepgram-starters/live-text-to-speech-html/issues/new)
- [Deepgram Discord Community](https://discord.gg/xWRaCDBtW4)
- [Deepgram GitHub Discussions](https://github.com/orgs/deepgram/discussions)

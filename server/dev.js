// Local development only. On Vercel the app is served by api/index.js instead.
import app from './app.js';

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));

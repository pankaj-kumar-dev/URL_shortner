import express from 'express';
import urlRoutes from './routes/url.routes';
import authRoutes from './routes/auth.routes';

// Fail fast — don't start with a missing JWT secret in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET env var is required in production');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/', urlRoutes);

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});

export default app;

import express from 'express';
import urlRoutes from './routes/url.routes';
import authRoutes from './routes/auth.routes';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.use('/auth', authRoutes);
// All URL routes at root level — keeps redirect path as short as possible
app.use('/', urlRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

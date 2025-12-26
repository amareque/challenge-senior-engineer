import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  // Middleware to add 3 second delay for testing
  // app.use(async (req, res, next) => {
  //   await new Promise((resolve) => setTimeout(resolve, 3000));
  //   next();
  // });

  await app.listen(3000);
}

void bootstrap();

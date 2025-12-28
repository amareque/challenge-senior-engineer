import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  // Create the HTTP application
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configure CORS
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  // Connect to RabbitMQ as a microservice (hybrid application)
  try {
    const configService = app.get(ConfigService);
    const rabbitmqUrl = configService.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );

    // Connect to deletion queue
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'deletion_queue',
        queueOptions: {
          durable: true,
        },
      },
    });

    // Connect to sync queue
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'sync_queue',
        queueOptions: {
          durable: true,
        },
      },
    });

    // Start all microservices first
    await app.startAllMicroservices();
    console.log('RabbitMQ microservices connected successfully');
  } catch (error) {
    console.error('Error connecting to RabbitMQ microservices:', error);
    throw error;
  }

  // Middleware to add 3 second delay for testing
  // app.use(async (req, res, next) => {
  //   await new Promise((resolve) => setTimeout(resolve, 3000));
  //   next();
  // });

  // Start the HTTP server
  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
}

void bootstrap();

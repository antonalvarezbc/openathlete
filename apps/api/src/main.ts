import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { getAiProviderWarnings } from './common/utils/ai-provider-warnings.util';
import './instrument';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService<ApiEnvSchemaType, true>);

  const aiLogger = new Logger('AiProviders');
  for (const warning of getAiProviderWarnings()) aiLogger.warn(warning);

  const corsOrigins = configService.get('CORS_ORIGINS');
  const allowedOrigins = corsOrigins
    ? corsOrigins.split(',')
    : ['http://localhost:5173'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('OpenAthlete API')
    .setDescription('API documentation for OpenAthlete')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get('PORT') ?? '3000';
  await app.listen(Number.parseInt(port, 10));
}
bootstrap();

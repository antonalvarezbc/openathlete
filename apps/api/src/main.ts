import helmet from 'helmet';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { getAiProviderWarnings } from './common/utils/ai-provider-warnings.util';
import { getAllowedOrigins } from './common/utils/cors.util';
import './instrument';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Security headers. Helmet's default CSP fits the JSON API and the Swagger
  // UI at /docs, whose scripts are all served from the API itself.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const configService = app.get(ConfigService<ApiEnvSchemaType, true>);

  const aiLogger = new Logger('AiProviders');
  for (const warning of getAiProviderWarnings()) aiLogger.warn(warning);
  // Only trust X-Forwarded-For from proxies on private networks (Traefik,
  // Docker) by default, so rate limits see the real client IP and it cannot
  // be spoofed. TRUST_PROXY overrides it (hop count or address list).
  const trustProxy = configService.get('TRUST_PROXY');
  app.set(
    'trust proxy',
    trustProxy === undefined
      ? ['loopback', 'linklocal', 'uniquelocal']
      : /^\d+$/.test(trustProxy)
        ? Number(trustProxy)
        : trustProxy,
  );

  // CORS_ORIGINS, else APP_URL: the same rule as the WebSocket gateways
  app.enableCors({
    origin: getAllowedOrigins(),
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

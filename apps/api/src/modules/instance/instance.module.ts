import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/services/prisma.service';
import { InstanceController } from './instance.controller';

@Module({ controllers: [InstanceController], providers: [PrismaService] })
export class InstanceModule {}

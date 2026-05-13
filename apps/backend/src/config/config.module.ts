import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'node:path';
import { validate } from './env.validation';

const rootDir = path.resolve(__dirname, '../../..');
const envFilePaths = [
  path.resolve(rootDir, '.env'),
  path.resolve(rootDir, 'apps/backend/.env'),
  path.resolve(process.cwd(), '.env'),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFilePaths,
      validate,
    }),
  ],
})
export class AppConfigModule {}

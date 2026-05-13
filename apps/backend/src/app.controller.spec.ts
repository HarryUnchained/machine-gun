import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SchemaDiscoveryService } from './core/discovery.service';
import { PublisherService } from './core/publishing/publisher.service';
import { CustomDataService } from './core/custom-data.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: SchemaDiscoveryService,
          useValue: { getSchemas: () => [] },
        },
        {
          provide: PublisherService,
          useValue: { getInfrastructureStatus: () => ({}) },
        },
        {
          provide: CustomDataService,
          useValue: {
            getTemplates: () => Promise.resolve([]),
            getModules: () => Promise.resolve([]),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('info', () => {
    it('should return app info', () => {
      const info = appController.getInfo();
      expect(info).toBeDefined();
      expect(info.name).toBe('machine-gun');
    });
  });
});

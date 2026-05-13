import { Injectable } from '@nestjs/common';
import { SchemaDiscoveryService } from './core/discovery.service';
import { PublisherService } from './core/publishing/publisher.service';
import { CustomDataService } from './core/custom-data.service';

@Injectable()
export class AppService {
  constructor(
    private readonly discoveryService: SchemaDiscoveryService,
    private readonly publisherService: PublisherService,
    private readonly customDataService: CustomDataService,
  ) {}

  getInfo() {
    const schemas = this.discoveryService.getSchemas();
    const infra = this.publisherService.getInfrastructureStatus();
    const templates = this.customDataService.getTemplates();
    const modules = this.customDataService.getModules();

    const counts = {
      system: 0,
      custom: 0,
      overrides: 0,
    };

    for (const schema of schemas) {
      if (schema.source === 'static') {
        counts.system++;
        if (schema.isModified) counts.overrides++;
      } else {
        counts.custom++;
      }
    }

    return {
      name: 'machine-gun',
      version: process.env['npm_package_version'] || '1.0.0',
      nodeVersion: process.version,
      environment: process.env['NODE_ENV'] || 'development',
      uptime: Math.floor(process.uptime()),
      infrastructure: infra,
      schemas: {
        total: schemas.length,
        ...counts,
      },
      customData: {
        templates: templates.length,
        modules: modules.length,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
